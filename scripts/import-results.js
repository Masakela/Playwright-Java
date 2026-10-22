#!/usr/bin/env node
/**
 * import-results.js — push STLC test results into the most-used test-management
 * systems. Zero dependencies (Node 18+; uses global fetch/FormData/Blob).
 *
 * Targets:
 *   xray      Jira / Xray (Cloud or Server/DC) — imports a JUnit XML report,
 *             creating a Test Execution issue in Jira.
 *   zephyr    Zephyr Scale (Jira, Cloud) — imports a JUnit XML report.
 *   testrail  TestRail — creates a run and posts per-case results (maps tests
 *             to TestRail case IDs by a "C<number>" token in the test name).
 *   jira-defects  Jira — opens a Bug for each failed/errored test.
 *
 * Nothing is hard-coded: every credential and target id is read from the
 * environment. Use --dry-run to print what WOULD be sent without calling out.
 *
 * Usage:
 *   node import-results.js xray         --junit target/surefire-reports/junit.xml
 *   node import-results.js zephyr       --junit test-results/junit.xml
 *   node import-results.js testrail     --junit test-results/junit.xml
 *   node import-results.js jira-defects --junit test-results/junit.xml
 *   add --dry-run to any of the above.
 *
 * See INTEGRATIONS.md for the environment variables each target needs.
 */

'use strict';
const fs = require('fs');
const path = require('path');

// ---------- arg parsing ----------
const argv = process.argv.slice(2);
const target = argv[0];
const opts = {};
const BOOL_FLAGS = new Set(['dry-run', 'create-missing']);
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (BOOL_FLAGS.has(key) || next === undefined || next.startsWith('--')) {
    opts[key] = true;                 // valueless boolean flag
  } else {
    opts[key] = next; i++;            // flag with a value
  }
}
const DRY = !!opts['dry-run'];

const TARGETS = ['xray', 'zephyr', 'testrail', 'jira-defects'];
if (!target || !TARGETS.includes(target)) {
  console.error(`Usage: node import-results.js <${TARGETS.join('|')}> --junit <path> [--dry-run]`);
  process.exit(target ? 1 : 0);
}

function env(name, required = true) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (required && DRY) return `UNSET_${name}`;   // dry-run previews without credentials
    if (required) die(`Missing required env var: ${name}`);
    return v;                                       // optional + missing -> undefined
  }
  return v;
}
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function info(msg) { console.log(msg); }

function readJUnitPath() {
  const p = opts.junit || opts.j;
  if (!p) die('Pass the JUnit report with --junit <path> (Playwright: reporter "junit"; Java: surefire).');
  if (!fs.existsSync(p)) die(`JUnit report not found: ${p}`);
  return path.resolve(p);
}

// ---------- minimal JUnit XML parser (for testrail / jira-defects) ----------
// Tolerant, attribute-aware; handles <testcase .../> and <testcase>...</testcase>
// with child <failure>/<error>/<skipped>. Good enough for JUnit from Playwright
// and Maven Surefire; Xray/Zephyr parse the file themselves so they skip this.
function parseJUnit(xml) {
  const cases = [];
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1]);
    const body = m[3] || '';
    let status = 'passed', message = '', detail = '';
    const fail = /<(failure|error)\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    const skip = /<skipped\b([^>]*)(?:\/>|>([\s\S]*?)<\/skipped>)/.exec(body);
    if (fail) {
      status = fail[1] === 'error' ? 'error' : 'failed';
      const fa = parseAttrs(fail[2] || '');
      message = fa.message || '';
      detail = unescapeXml((fail[3] || '').trim());
    } else if (skip) {
      status = 'skipped';
      const sa = parseAttrs(skip[1] || '');
      message = sa.message || '';
    }
    cases.push({
      name: attrs.name || '(unnamed)',
      classname: attrs.classname || '',
      time: parseFloat(attrs.time || '0') || 0,
      status, message, detail,
    });
  }
  return cases;
}
function parseAttrs(s) {
  const out = {};
  const re = /(\w[\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) out[m[1]] = unescapeXml(m[2]);
  return out;
}
function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}
function summarize(cases) {
  const s = { total: cases.length, passed: 0, failed: 0, error: 0, skipped: 0 };
  for (const c of cases) s[c.status]++;
  return s;
}

// Load a JUnit report from a FILE (Playwright's junit reporter) or a DIRECTORY of
// per-class files (Maven Surefire's TEST-*.xml). A directory is merged in memory
// into one valid <testsuites> document, so file-upload targets (Xray/Zephyr) and
// the local parser (TestRail/Jira) both work the same way.
function loadJUnit(p) {
  if (fs.statSync(p).isDirectory()) {
    const files = fs.readdirSync(p).filter(f => /\.xml$/i.test(f)).map(f => path.join(p, f));
    if (!files.length) die(`No .xml files in directory: ${p}`);
    const inner = files.map(f => {
      const s = fs.readFileSync(f, 'utf8').replace(/<\?xml[^>]*\?>/i, '').trim();
      const m = /<testsuites\b[^>]*>([\s\S]*)<\/testsuites>/i.exec(s);
      return (m ? m[1] : s).trim();               // unwrap <testsuites>, else keep <testsuite> blocks
    }).join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${inner}\n</testsuites>\n`;
    return { xml, cases: parseJUnit(xml), source: `${files.length} file(s) in ${p}` };
  }
  const xml = fs.readFileSync(p, 'utf8');
  return { xml, cases: parseJUnit(xml), source: p };
}

// ---------- HTTP helper ----------
async function http(url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status} ${res.statusText}\n${text.slice(0, 800)}`);
  }
  try { return JSON.parse(text); } catch { return text; }
}
function basicAuth(user, token) {
  return 'Basic ' + Buffer.from(`${user}:${token}`).toString('base64');
}

// ---------- XRAY (Jira) ----------
// Cloud: authenticate for a bearer token, then POST the JUnit file.
// Server/DC: Basic/PAT auth straight to the Jira raven endpoint.
async function importXray(junitPath) {
  const xml = loadJUnit(junitPath).xml;
  const projectKey = env('XRAY_PROJECT_KEY');
  const testPlanKey = env('XRAY_TEST_PLAN_KEY', false); // optional
  const mode = (process.env.XRAY_MODE || 'cloud').toLowerCase();

  const qs = new URLSearchParams({ projectKey });
  if (testPlanKey) qs.set('testPlanKey', testPlanKey);

  if (mode === 'cloud') {
    const clientId = env('XRAY_CLIENT_ID');
    const clientSecret = env('XRAY_CLIENT_SECRET');
    const base = process.env.XRAY_CLOUD_BASE || 'https://xray.cloud.getxray.app';
    const url = `${base}/api/v2/import/execution/junit?${qs.toString()}`;
    if (DRY) return info(`[dry-run] POST ${url}\n           auth: client_id/secret, body: ${junitPath} (${xml.length} bytes)`);
    const tokenRaw = await http(`${base}/api/v2/authenticate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    const token = String(tokenRaw).replace(/^"|"$/g, '');
    const out = await http(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', Authorization: `Bearer ${token}` },
      body: xml,
    });
    const key = out && out.key ? out.key : (out && out.testExecIssue && out.testExecIssue.key);
    info(`✓ Xray (Cloud): imported ${path.basename(junitPath)} → Test Execution ${key || '(see response)'}`);
  } else {
    // Server / Data Center
    const jiraBase = env('JIRA_BASE_URL').replace(/\/$/, '');
    const url = `${jiraBase}/rest/raven/2.0/import/execution/junit?${qs.toString()}`;
    const headers = { 'Content-Type': 'text/xml' };
    if (process.env.JIRA_PAT) headers.Authorization = `Bearer ${env('JIRA_PAT')}`;
    else headers.Authorization = basicAuth(env('JIRA_USER'), env('JIRA_API_TOKEN'));
    if (DRY) return info(`[dry-run] POST ${url}\n           body: ${junitPath} (${xml.length} bytes)`);
    const out = await http(url, { method: 'POST', headers, body: xml });
    const key = out && out.testExecIssue && out.testExecIssue.key;
    info(`✓ Xray (Server/DC): imported ${path.basename(junitPath)} → Test Execution ${key || '(see response)'}`);
  }
}

// ---------- ZEPHYR SCALE (Jira, Cloud) ----------
async function importZephyr(junitPath) {
  const base = process.env.ZEPHYR_BASE || 'https://api.zephyrscale.smartbear.com/v2';
  const token = env('ZEPHYR_API_TOKEN');
  const projectKey = env('ZEPHYR_PROJECT_KEY');
  const qs = new URLSearchParams({ projectKey });
  if (process.env.ZEPHYR_TEST_CYCLE_KEY) qs.set('testCycle', process.env.ZEPHYR_TEST_CYCLE_KEY);
  const url = `${base}/automations/executions/junit?${qs.toString()}`;

  if (DRY) return info(`[dry-run] POST ${url}\n           auth: Bearer <ZEPHYR_API_TOKEN>, multipart file=${junitPath}`);
  const form = new FormData();
  const buf = Buffer.from(loadJUnit(junitPath).xml);
  form.append('file', new Blob([buf], { type: 'application/xml' }), path.basename(junitPath));
  const out = await http(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  info(`✓ Zephyr Scale: imported ${path.basename(junitPath)} → ${out && out.testCycle && out.testCycle.key ? out.testCycle.key : '(see response)'}`);
}

// ---------- TESTRAIL ----------
// Creates a run, then posts results. A test resolves to a TestRail case by, in order:
//   1) a "C<number>" token in the test name (e.g. "C1234 ...") — existing suite,
//   2) a saved entry in the test->case map file (cases this tool created before),
//   3) with --create-missing: a new case created in TESTRAIL_SECTION_ID; its id is
//      saved to the map so later runs reuse it instead of creating duplicates.
// This makes one command work for an existing suite, an empty suite, or a mix.
function trResult(caseId, c, statusId) {
  const r = {
    case_id: caseId,
    status_id: statusId[c.status] || 2,
    comment: (c.status === 'passed' ? 'Passed via STLC automation.'
             : `${c.status.toUpperCase()}: ${c.message || ''}\n${(c.detail || '').slice(0, 1000)}`).trim(),
  };
  if (c.time >= 1) r.elapsed = `${Math.round(c.time)}s`;
  return r;
}
const trStripCid = (name) => name.replace(/\bC\d+\b\s*/, '').trim();

async function importTestRail(junitPath) {
  const baseUrl = env('TESTRAIL_URL').replace(/\/$/, '');     // https://you.testrail.io
  const user = env('TESTRAIL_USER');
  const apiKey = env('TESTRAIL_API_KEY');
  const projectId = env('TESTRAIL_PROJECT_ID');
  const suiteId = process.env.TESTRAIL_SUITE_ID;              // required for multi-suite projects
  const sectionId = process.env.TESTRAIL_SECTION_ID;         // required for --create-missing
  const createMissing = !!opts['create-missing'];
  const api = (p) => `${baseUrl}/index.php?/api/v2/${p}`;
  const headers = { 'Content-Type': 'application/json', Authorization: basicAuth(user, apiKey) };

  const cases = loadJUnit(junitPath).cases;
  const statusId = { passed: 1, failed: 5, error: 5, skipped: 2 };  // 3 untested can't be posted

  // persistent test->case map, so created ids are reused across runs (no duplicates)
  const mapPath = opts.map || path.join(path.dirname(junitPath), 'testrail-map.json');
  let map = {};
  if (fs.existsSync(mapPath)) { try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch { /* ignore */ } }
  const idKey = (c) => `${c.classname}::${c.name}`;

  const results = [];     // tests resolved to an existing/known case id
  const toCreate = [];    // tests with no id yet (only used when --create-missing)
  let unmapped = 0;
  for (const c of cases) {
    const mm = /\bC(\d+)\b/.exec(c.name) || /\bC(\d+)\b/.exec(c.classname);
    let caseId = mm ? parseInt(mm[1], 10) : (map[idKey(c)] || null);
    if (caseId) results.push(trResult(caseId, c, statusId));
    else if (createMissing) toCreate.push(c);
    else unmapped++;
  }

  const runName = opts.name || process.env.TESTRAIL_RUN_NAME || `STLC automated run — ${new Date().toISOString()}`;

  if (DRY) {
    info(`[dry-run] TestRail: add_run/${projectId}  name="${runName}"${suiteId ? `  suite_id=${suiteId}` : ''}`);
    if (createMissing) {
      info(`[dry-run]           matched ${results.length} known case(s); would create ${toCreate.length} new case(s) in section ${sectionId || '(set TESTRAIL_SECTION_ID)'} and save them to ${mapPath}.`);
    } else {
      info(`[dry-run]           ${results.length} matched; ${unmapped} test(s) had no C<id> and would be skipped (use --create-missing to create them).`);
    }
    return;
  }

  // create missing cases, persist their ids
  if (createMissing && toCreate.length) {
    if (!sectionId) die('TESTRAIL_SECTION_ID is required with --create-missing (the section new cases go into).');
    for (const c of toCreate) {
      const title = (trStripCid(c.name) || '(unnamed test)').slice(0, 250);
      const created = await http(api(`add_case/${sectionId}`), { method: 'POST', headers, body: JSON.stringify({ title }) });
      map[idKey(c)] = created.id;
      results.push(trResult(created.id, c, statusId));
      info(`  + created case C${created.id}  ${title}`);
    }
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2));
    info(`  saved test→case map → ${mapPath}`);
  }

  if (!results.length) {
    die(createMissing
      ? 'No tests to report.'
      : 'No tests matched a TestRail case. Add "C<number>" to test names, or pass --create-missing (needs TESTRAIL_SECTION_ID).');
  }

  const runBody = { name: runName, include_all: false, case_ids: results.map(r => r.case_id) };
  if (suiteId) runBody.suite_id = parseInt(suiteId, 10);
  const run = await http(api(`add_run/${projectId}`), { method: 'POST', headers, body: JSON.stringify(runBody) });
  await http(api(`add_results_for_cases/${run.id}`), { method: 'POST', headers, body: JSON.stringify({ results }) });
  const skipNote = (!createMissing && unmapped) ? ` (${unmapped} unmatched test(s) skipped)` : '';
  info(`✓ TestRail: run #${run.id} "${runName}" — ${results.length} result(s)${skipNote}.`);
  info(`  ${baseUrl}/index.php?/runs/view/${run.id}`);
}

// ---------- JIRA DEFECTS (open a Bug per failing test) ----------
async function createJiraDefects(junitPath) {
  const base = env('JIRA_BASE_URL').replace(/\/$/, '');
  const projectKey = env('JIRA_PROJECT_KEY');
  const issueType = process.env.JIRA_DEFECT_ISSUETYPE || 'Bug';
  const headers = { 'Content-Type': 'application/json', Authorization: basicAuth(env('JIRA_USER'), env('JIRA_API_TOKEN')) };

  const cases = loadJUnit(junitPath).cases;
  const failures = cases.filter(c => c.status === 'failed' || c.status === 'error');
  if (!failures.length) return info('✓ No failed/errored tests — no Jira defects to create.');

  if (DRY) {
    info(`[dry-run] Would create ${failures.length} ${issueType}(s) in ${projectKey}:`);
    failures.forEach(f => info(`  - [STLC] ${f.classname ? f.classname + ' › ' : ''}${f.name}`));
    return;
  }
  const created = [];
  for (const f of failures) {
    const summary = `[STLC] Test failed: ${(f.classname ? f.classname + ' › ' : '') + f.name}`.slice(0, 240);
    const descText = `Automated STLC run detected a failure.\n\nTest: ${f.name}\nClass: ${f.classname || '-'}\nStatus: ${f.status}\nMessage: ${f.message || '-'}\n\n${(f.detail || '').slice(0, 2000)}`;
    const fields = {
      project: { key: projectKey },
      issuetype: { name: issueType },
      summary,
      description: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: descText }] }],
      },
    };
    if (process.env.JIRA_LABELS) fields.labels = process.env.JIRA_LABELS.split(',').map(s => s.trim()).filter(Boolean);
    const out = await http(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
    created.push(out.key);
    info(`  ✓ ${out.key}  ${summary}`);
  }
  info(`✓ Jira: created ${created.length} ${issueType}(s): ${created.join(', ')}`);
}

// ---------- main ----------
(async () => {
  try {
    if (target === 'xray')            { const p = readJUnitPath(); await importXray(p); }
    else if (target === 'zephyr')     { const p = readJUnitPath(); await importZephyr(p); }
    else if (target === 'testrail')   { const p = readJUnitPath(); await importTestRail(p); }
    else if (target === 'jira-defects'){ const p = readJUnitPath(); await createJiraDefects(p); }
    // small run summary for the targets that parse locally
    if ((target === 'testrail' || target === 'jira-defects')) {
      const s = summarize(loadJUnit(readJUnitPath()).cases);
      info(`  (source: ${s.total} tests — ${s.passed} passed, ${s.failed + s.error} failed/errored, ${s.skipped} skipped)`);
    }
  } catch (e) {
    die(e.message || String(e));
  }
})();
