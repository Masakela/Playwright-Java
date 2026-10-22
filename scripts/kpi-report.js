'use strict';

/*
 * kpi-report.js - build stakeholder-facing QA KPIs from both test suites.
 *
 * Inputs (all optional - the script degrades gracefully if one is missing):
 *   --junit   <glob-dir>  directory scanned recursively for JUnit TEST-*.xml  (Java/surefire)
 *   --pw      <file>      Playwright JSON report (test-results/results.json)
 *   --out     <dir>       output directory (default: ./kpis)
 *   --history <file>      JSON history file to append this run to (trend)
 *   --commit  <sha>  --branch <name>  --run-url <url>   run metadata (from CI env)
 *
 * Outputs (in --out):
 *   kpi-summary.json   machine-readable KPIs (now includes per-test records + traceability)
 *   kpi-summary.md     Markdown summary (for the PR / GITHUB_STEP_SUMMARY)
 *   index.html         self-contained KPI dashboard (publish to GitHub Pages)
 *   history.json       rolling history (if --history given)
 *
 * Dashboard features: pass-rate donut, suite breakdown with per-test DRILL-DOWN,
 * requirement TRACEABILITY (tests tagged "REQ-123 ..." grouped by requirement),
 * agent quality gates, and a RUN HISTORY trend chart + table.
 */

const fs = require('fs');
const path = require('path');

// ----------------------------------------------------------------- args ----
function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const JUNIT_DIR = arg('junit', 'target/surefire-reports');
const PW_JSON = arg('pw', 'playwright-ts/test-results/results.json');
const OUT_DIR = arg('out', 'kpis');
const HISTORY = arg('history', '');
const META = {
  commit: arg('commit', process.env.GITHUB_SHA || 'local'),
  branch: arg('branch', process.env.GITHUB_REF_NAME || 'local'),
  runUrl: arg('run-url', ''),
  date: new Date().toISOString(),
};

// ------------------------------------------------------------- helpers ------
function walk(dir, acc) {
  acc = acc || [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
function attr(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
  return m ? m[1] : '';
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (n, d) => (d > 0 ? (100 * n) / d : 100);
const r1 = (x) => Math.round(x * 10) / 10;

// Extract a requirement id from a test name/classname for traceability.
// Matches "REQ-123", "REQ_123", "@REQ-123", "[REQ-123]" (case-insensitive).
function reqOf() {
  for (const s of arguments) {
    if (!s) continue;
    const m = String(s).match(/\bREQ[-_]?(\d+)\b/i);
    if (m) return 'REQ-' + m[1];
  }
  return null;
}

// A normalized per-test record: { name, suite, lang, status: pass|fail|skip, flaky, durationMs, req }
const tests = [];

// ------------------------------------------------- parse Java JUnit XML -----
function parseJunit(dir) {
  const files = walk(dir).filter((f) => /TEST-.*\.xml$/.test(path.basename(f)));
  for (const f of files) {
    let xml = '';
    try { xml = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
    const cases = xml.match(/<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g) || [];
    for (const c of cases) {
      const open = c.match(/<testcase\b[^>]*>/) ? c.match(/<testcase\b[^>]*>/)[0] : c;
      const classname = attr(open, 'classname');
      const name = attr(open, 'name');
      const time = parseFloat(attr(open, 'time') || '0') * 1000;
      let status = 'pass';
      if (/<failure\b|<error\b/.test(c)) status = 'fail';
      else if (/<skipped\b/.test(c)) status = 'skip';
      const suite = classname.includes('.agent.') ? 'Agent Workflows (Java)' : 'UI Regression (Java)';
      tests.push({ name, suite, lang: 'java', status, flaky: false, durationMs: time, classname, req: reqOf(name, classname) });
    }
  }
}

// ------------------------------------------- parse Playwright JSON report ---
function parsePlaywright(file) {
  let json;
  try { json = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return; }
  const visit = (suite, fileTitle) => {
    const title = fileTitle || suite.title || '';
    for (const sp of suite.specs || []) {
      for (const t of sp.tests || []) {
        const results = t.results || [];
        const statuses = results.map((r) => r.status);
        const durationMs = results.reduce((a, r) => a + (r.duration || 0), 0);
        let status = 'pass';
        const last = statuses[statuses.length - 1];
        if (last === 'skipped' || t.status === 'skipped') status = 'skip';
        else if (last === 'passed') status = 'pass';
        else status = 'fail';
        const flaky = t.status === 'flaky' ||
          (status === 'pass' && statuses.some((s) => s === 'failed' || s === 'timedOut'));
        const proj = t.projectName || 'chromium';
        tests.push({
          name: sp.title,
          suite: 'TS: ' + proj,
          lang: 'ts',
          status,
          flaky,
          durationMs,
          req: reqOf(sp.title, title),
        });
      }
    }
    for (const child of suite.suites || []) visit(child, title);
  };
  for (const s of json.suites || []) visit(s, s.title);
}

parseJunit(JUNIT_DIR);
parsePlaywright(PW_JSON);

// ----------------------------------------------------------- aggregate ------
function tally(list) {
  const t = { total: list.length, passed: 0, failed: 0, skipped: 0, flaky: 0, durationMs: 0 };
  for (const x of list) {
    if (x.status === 'pass') t.passed++;
    else if (x.status === 'fail') t.failed++;
    else t.skipped++;
    if (x.flaky) t.flaky++;
    t.durationMs += x.durationMs || 0;
  }
  t.executed = t.passed + t.failed;
  t.passRate = r1(pct(t.passed, t.executed));
  return t;
}

const overall = tally(tests);

// by suite
const suiteNames = [...new Set(tests.map((t) => t.suite))].sort();
const bySuite = suiteNames.map((s) => ({ suite: s, ...tally(tests.filter((t) => t.suite === s)) }));

// by requirement (traceability) - only tests that carry a REQ tag
const reqIds = [...new Set(tests.map((t) => t.req).filter(Boolean))]
  .sort((a, b) => (parseInt(a.slice(4), 10) || 0) - (parseInt(b.slice(4), 10) || 0));
const byReq = reqIds.map((id) => ({ req: id, ...tally(tests.filter((t) => t.req === id)) }));

// agent quality gates (across both languages), matched by test name
function gate(label, re) {
  const list = tests.filter((t) => re.test(t.name));
  const t = tally(list);
  return { label, passed: t.passed, failed: t.failed, skipped: t.skipped, total: t.total, passRate: t.passRate };
}
const gates = [
  gate('Eval harness (task-success)', /eval|threshold|golden/i),
  gate('Guardrails (refusals)', /guardrail|refus/i),
  gate('Non-determinism (invariants)', /non-?determinism|invariant|repeated|same (goal|prompt)/i),
  gate('Data validation', /data validation|required field|reconcil|complete/i),
];

const summary = {
  meta: META,
  overall,
  bySuite,
  traceability: byReq,
  agentQualityGates: gates,
  tests: tests.map((t) => ({
    name: t.name, suite: t.suite, lang: t.lang, status: t.status,
    flaky: !!t.flaky, durationMs: Math.round(t.durationMs || 0), req: t.req || null,
  })),
  generatedAt: new Date().toISOString(),
};

// ----------------------------------------------------------- history --------
let history = [];
if (HISTORY) {
  try { history = JSON.parse(fs.readFileSync(HISTORY, 'utf8')); } catch (e) { history = []; }
  if (!Array.isArray(history)) history = [];
  history.push({
    date: META.date, commit: (META.commit || '').slice(0, 7),
    passRate: overall.passRate, total: overall.total,
    passed: overall.passed, failed: overall.failed, skipped: overall.skipped,
  });
  history = history.slice(-20);
}

// --------------------------------------------------------- write outputs ----
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'kpi-summary.json'), JSON.stringify(summary, null, 2));
if (HISTORY) fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2));

// Markdown (PR comment / step summary)
function mdTable(rows) { return rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n'); }
const md = [
  '## QA Automation KPIs',
  '',
  '**Branch:** `' + META.branch + '`  **Commit:** `' + (META.commit || '').slice(0, 7) + '`',
  '',
  '| KPI | Value |',
  '|---|---|',
  '| Pass rate | **' + overall.passRate + '%** |',
  '| Total tests | ' + overall.total + ' |',
  '| Passed | ' + overall.passed + ' |',
  '| Failed | ' + overall.failed + ' |',
  '| Skipped | ' + overall.skipped + ' |',
  '| Flaky | ' + overall.flaky + ' |',
  '| Duration | ' + r1(overall.durationMs / 1000) + 's |',
  '',
  '### By suite',
  '',
  '| Suite | Tests | Pass | Fail | Skip | Pass rate |',
  '|---|---|---|---|---|---|',
  mdTable(bySuite.map((s) => [s.suite, s.total, s.passed, s.failed, s.skipped, s.passRate + '%'])),
  '',
  ...(byReq.length ? [
    '### Requirement traceability',
    '',
    '| Requirement | Tests | Pass | Fail | Skip | Pass rate |',
    '|---|---|---|---|---|---|',
    mdTable(byReq.map((r) => [r.req, r.total, r.passed, r.failed, r.skipped, r.passRate + '%'])),
    '',
  ] : []),
  '### Agent quality gates',
  '',
  '| Gate | Pass / Total | Pass rate |',
  '|---|---|---|',
  mdTable(gates.map((g) => [g.label, g.passed + ' / ' + g.total, g.passRate + '%'])),
  '',
].join('\n');
fs.writeFileSync(path.join(OUT_DIR, 'kpi-summary.md'), md);

// --------------------------------------------------------- dashboard HTML ---
function statusColor(status) {
  return status === 'pass' ? 'var(--good)' : status === 'fail' ? 'var(--crit)' : 'var(--warn)';
}
// horizontal stacked bar for a suite row (passed/failed/skipped)
function suiteBar(s) {
  const w = 460, total = Math.max(s.total, 1);
  let x = 0; const parts = [];
  for (const [n, color] of [[s.passed, 'var(--good)'], [s.failed, 'var(--crit)'], [s.skipped, 'var(--warn)']]) {
    const segW = (n / total) * w;
    if (n > 0) parts.push('<g transform="translate(' + x + ',0)"><rect height="14" rx="3" ry="3" width="' + Math.max(segW - 2, 1) + '" fill="' + color + '"></rect></g>');
    x += segW;
  }
  return '<svg width="' + w + '" height="14" role="img" aria-label="' + esc(s.suite) + ' results">' + parts.join('') + '</svg>';
}
// donut ring for pass rate
function donut(rate) {
  const R = 54, C = 2 * Math.PI * R, val = Math.max(0, Math.min(100, rate));
  const dash = (val / 100) * C;
  const color = val >= 90 ? 'var(--good)' : val >= 70 ? 'var(--warn)' : 'var(--crit)';
  return `<svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Pass rate ${val}%">
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="var(--track)" stroke-width="14"></circle>
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
      stroke-dasharray="${dash} ${C - dash}" transform="rotate(-90 70 70)"></circle>
    <text x="70" y="66" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink)">${val}%</text>
    <text x="70" y="88" text-anchor="middle" font-size="11" fill="var(--muted)">pass rate</text>
  </svg>`;
}
// small trend sparkline (pass rate over runs) - shown next to the donut
function sparkline(hist) {
  if (!hist || hist.length < 2) return '';
  const w = 320, h = 60, pad = 6;
  const xs = hist.map((_, i) => pad + (i * (w - 2 * pad)) / (hist.length - 1));
  const ys = hist.map((d) => h - pad - ((d.passRate / 100) * (h - 2 * pad)));
  const pts = xs.map((x, i) => x.toFixed(1) + ',' + ys[i].toFixed(1)).join(' ');
  const last = hist[hist.length - 1];
  return `<svg width="${w}" height="${h}" role="img" aria-label="Pass rate trend">
    <polyline fill="none" stroke="var(--series1)" stroke-width="2" points="${pts}"></polyline>
    <circle cx="${xs[xs.length - 1].toFixed(1)}" cy="${ys[ys.length - 1].toFixed(1)}" r="3.5" fill="var(--series1)"></circle>
    <title>Latest ${last.passRate}%</title>
  </svg>`;
}
// larger run-history trend chart with gridlines and a 90% target line
function trendChart(hist) {
  if (!hist || hist.length < 2) return '';
  const w = 680, h = 150, padL = 26, padR = 10, padT = 12, padB = 20, n = hist.length;
  const xs = hist.map((_, i) => padL + (i * (w - padL - padR)) / (n - 1));
  const y = (v) => padT + ((100 - v) / 100) * (h - padT - padB);
  const pts = hist.map((d, i) => xs[i].toFixed(1) + ',' + y(d.passRate).toFixed(1)).join(' ');
  const grid = [0, 50, 90, 100].map((v) =>
    `<line x1="${padL}" x2="${w - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--track)" stroke-width="1" ${v === 90 ? 'stroke-dasharray="4 3"' : ''}></line>
     <text x="0" y="${(y(v) + 3).toFixed(1)}" font-size="9" fill="var(--muted)">${v}</text>`).join('');
  const dots = hist.map((d, i) =>
    `<circle cx="${xs[i].toFixed(1)}" cy="${y(d.passRate).toFixed(1)}" r="2.5" fill="var(--series1)"><title>${esc(d.commit || '')} — ${d.passRate}%</title></circle>`).join('');
  return `<svg width="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Pass-rate trend over runs">
    ${grid}<polyline fill="none" stroke="var(--series1)" stroke-width="2" points="${pts}"></polyline>${dots}</svg>`;
}
function historyTable(hist) {
  const rows = hist.slice().reverse().map((d) => `<tr>
    <td>${esc(new Date(d.date).toISOString().replace('T', ' ').slice(0, 16))} UTC</td>
    <td><code>${esc(d.commit || '')}</code></td>
    <td class="num"><strong>${d.passRate}%</strong></td>
    <td class="num" style="color:var(--good)">${d.passed}</td>
    <td class="num" style="color:var(--crit)">${d.failed}</td>
    <td class="num" style="color:var(--warn)">${d.skipped}</td></tr>`).join('');
  return `<table style="margin-top:12px">
    <thead><tr><th>Run</th><th>Commit</th><th class="num">Rate</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}
// per-test list used by suite + requirement drill-downs
function testList(list) {
  if (!list.length) return '<div class="muted" style="padding:6px 0">No tests.</div>';
  return list.map((t) => `<div class="trow">
    <span class="sdot" style="background:${statusColor(t.status)}"></span>
    <span class="tname">${esc(t.name)}</span>
    ${t.req ? '<span class="reqtag">' + esc(t.req) + '</span>' : ''}
    <span class="tdur">${r1((t.durationMs || 0) / 1000)}s</span></div>`).join('');
}

function tile(label, value, sub, color) {
  return `<div class="tile"><div class="tile-val" ${color ? 'style="color:' + color + '"' : ''}>${value}</div>
    <div class="tile-label">${label}</div>${sub ? '<div class="tile-sub">' + sub + '</div>' : ''}</div>`;
}

// suite rows, each expandable to its tests
const suiteRows = bySuite.map((s, i) => {
  const id = 'su' + i;
  const list = tests.filter((t) => t.suite === s.suite);
  return `<tr class="clickable" data-toggle="${id}">
  <td><span class="caret">&#9656;</span> ${esc(s.suite)}</td>
  <td class="num">${s.total}</td>
  <td>${suiteBar(s)}</td>
  <td class="num" style="color:var(--good)">${s.passed}</td>
  <td class="num" style="color:var(--crit)">${s.failed}</td>
  <td class="num" style="color:var(--warn)">${s.skipped}</td>
  <td class="num"><strong>${s.passRate}%</strong></td>
</tr>
<tr class="detail" id="${id}"><td colspan="7"><div class="tests">${testList(list)}</div></td></tr>`;
}).join('');

// requirement traceability rows, each expandable to its tests
const traceRows = byReq.map((r, i) => {
  const id = 'rq' + i;
  const ok = r.failed === 0;
  const list = tests.filter((t) => t.req === r.req);
  return `<tr class="clickable" data-toggle="${id}">
  <td><span class="caret">&#9656;</span> <strong>${esc(r.req)}</strong></td>
  <td class="num">${r.total}</td>
  <td class="num" style="color:var(--good)">${r.passed}</td>
  <td class="num" style="color:var(--crit)">${r.failed}</td>
  <td class="num" style="color:var(--warn)">${r.skipped}</td>
  <td class="num"><strong>${r.passRate}%</strong></td>
  <td style="color:${ok ? 'var(--good)' : 'var(--crit)'}">${ok ? '&#10003; covered' : '&#10007; failing'}</td>
</tr>
<tr class="detail" id="${id}"><td colspan="7"><div class="tests">${testList(list)}</div></td></tr>`;
}).join('');

const gateCards = gates.map((g) => {
  const ok = g.failed === 0 && g.total > 0;
  const badge = g.total === 0 ? 'n/a' : (ok ? '✓ pass' : '✗ ' + g.failed + ' failing');
  const col = g.total === 0 ? 'var(--muted)' : (ok ? 'var(--good)' : 'var(--crit)');
  return `<div class="gate"><div class="gate-label">${esc(g.label)}</div>
    <div class="gate-badge" style="color:${col}">${badge}</div>
    <div class="gate-sub">${g.passed} / ${g.total} passed</div></div>`;
}).join('');

const html = `<!doctype html>
<html lang="en" data-palette="#2a78d6,#eb6834,#1baf7a">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>QA Automation KPIs</title>
<style>
  :root {
    --surface:#fcfcfb; --card:#ffffff; --ink:#0b0b0b; --muted:#52514e; --border:#e6e4df;
    --good:#0ca30c; --warn:#fab219; --crit:#d03b3b; --serious:#ec835a;
    --series1:#2a78d6; --track:#e6e4df;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --surface:#1a1a19; --card:#232321; --ink:#ffffff; --muted:#c3c2b7; --border:#34332f;
      --good:#0ca30c; --warn:#fab219; --crit:#d03b3b; --series1:#3987e5; --track:#34332f;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--surface); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; line-height:1.5; }
  .wrap { max-width:960px; margin:0 auto; padding:24px 16px 56px; }
  header h1 { font-size:1.5rem; margin:0 0 4px; }
  .meta { color:var(--muted); font-size:.85rem; }
  .row { display:flex; flex-wrap:wrap; gap:16px; margin:20px 0; align-items:stretch; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; flex:1; }
  .tile { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:14px; }
  .tile-val { font-size:1.7rem; font-weight:700; }
  .tile-label { color:var(--muted); font-size:.8rem; margin-top:2px; }
  .tile-sub { color:var(--muted); font-size:.72rem; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:18px; }
  .donutcard { display:flex; align-items:center; gap:16px; min-width:260px; }
  h2 { font-size:1.05rem; margin:28px 0 10px; }
  table { width:100%; border-collapse:collapse; font-size:.9rem; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--border); vertical-align:middle; }
  th { color:var(--muted); font-weight:600; font-size:.8rem; text-transform:uppercase; letter-spacing:.02em; }
  td.num,th.num { text-align:right; font-variant-numeric:tabular-nums; }
  .legend { display:flex; gap:14px; font-size:.8rem; color:var(--muted); margin-top:10px; flex-wrap:wrap; }
  .legend span { display:inline-flex; align-items:center; gap:5px; }
  .dot { width:10px; height:10px; border-radius:2px; display:inline-block; }
  .gates { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }
  .gate { background:var(--card); border:1px solid var(--border); border-radius:10px; padding:14px; }
  .gate-label { font-size:.82rem; color:var(--muted); }
  .gate-badge { font-size:1.1rem; font-weight:700; margin:4px 0 2px; }
  .gate-sub { font-size:.75rem; color:var(--muted); }
  .muted { color:var(--muted); }
  /* drill-down */
  tr.clickable { cursor:pointer; }
  tr.clickable:hover td { background:color-mix(in srgb, var(--series1) 7%, transparent); }
  .caret { display:inline-block; transition:transform .15s ease; color:var(--muted); font-size:.75rem; }
  tr.open .caret { transform:rotate(90deg); }
  tr.detail { display:none; }
  tr.detail.open { display:table-row; }
  tr.detail > td { background:color-mix(in srgb, var(--ink) 3%, transparent); padding:4px 14px 10px; }
  .tests { display:flex; flex-direction:column; }
  .trow { display:flex; align-items:center; gap:8px; padding:3px 0; font-size:.85rem; border-bottom:1px dotted var(--border); }
  .trow:last-child { border-bottom:none; }
  .sdot { width:8px; height:8px; border-radius:50%; flex:none; }
  .tname { color:var(--ink); }
  .reqtag { font-size:.68rem; background:var(--track); color:var(--muted); padding:1px 6px; border-radius:999px; }
  .tdur { margin-left:auto; color:var(--muted); font-variant-numeric:tabular-nums; }
  a { color:var(--series1); }
  footer { margin-top:32px; color:var(--muted); font-size:.78rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>QA Automation &mdash; Test KPIs</h1>
    <div class="meta">Branch <strong>${esc(META.branch)}</strong> &middot; commit <code>${esc((META.commit || '').slice(0, 7))}</code>
      &middot; ${new Date(META.date).toUTCString()}${META.runUrl ? ' &middot; <a href="' + esc(META.runUrl) + '">CI run</a>' : ''}</div>
  </header>

  <div class="row">
    <div class="card donutcard">
      ${donut(overall.passRate)}
      <div>
        <div style="font-size:.8rem;color:var(--muted)">Overall quality</div>
        <div style="font-size:1.1rem;font-weight:700">${overall.passed}/${overall.executed} executed passed</div>
        <div style="font-size:.8rem;color:var(--muted)">${overall.skipped} skipped${overall.flaky ? ' &middot; ' + overall.flaky + ' flaky' : ''}</div>
        ${sparkline(history) ? '<div style="margin-top:8px">' + sparkline(history) + '<div style="font-size:.72rem;color:var(--muted)">pass-rate trend</div></div>' : ''}
      </div>
    </div>
    <div class="tiles">
      ${tile('Total tests', overall.total, overall.executed + ' executed')}
      ${tile('Passed', overall.passed, '', 'var(--good)')}
      ${tile('Failed', overall.failed, '', overall.failed ? 'var(--crit)' : 'var(--muted)')}
      ${tile('Skipped', overall.skipped, '', 'var(--warn)')}
      ${tile('Flaky', overall.flaky, '', overall.flaky ? 'var(--serious)' : 'var(--muted)')}
      ${tile('Duration', r1(overall.durationMs / 1000) + 's', 'total')}
    </div>
  </div>

  <h2>Results by suite <span class="muted" style="font-weight:400;font-size:.8rem">(click a row to see its tests)</span></h2>
  <div class="card">
    <table>
      <thead><tr><th>Suite</th><th class="num">Tests</th><th>Breakdown</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th><th class="num">Rate</th></tr></thead>
      <tbody>${suiteRows || '<tr><td colspan="7" class="muted">No results found.</td></tr>'}</tbody>
    </table>
    <div class="legend">
      <span><span class="dot" style="background:var(--good)"></span>Passed</span>
      <span><span class="dot" style="background:var(--crit)"></span>Failed</span>
      <span><span class="dot" style="background:var(--warn)"></span>Skipped</span>
    </div>
  </div>

  <h2>Requirement traceability <span class="muted" style="font-weight:400;font-size:.8rem">(requirement &rarr; tests &rarr; result)</span></h2>
  <div class="card">
    ${byReq.length ? `<table>
      <thead><tr><th>Requirement</th><th class="num">Tests</th><th class="num">Pass</th><th class="num">Fail</th><th class="num">Skip</th><th class="num">Rate</th><th>Status</th></tr></thead>
      <tbody>${traceRows}</tbody>
    </table>` : `<p class="muted" style="margin:0">No requirement tags found. Name a test with a requirement id &mdash; e.g. <code>REQ-012 applies discount code</code> &mdash; and it appears here, each requirement linked to the tests that cover it and their latest result.</p>`}
  </div>

  <h2>Agent quality gates <span class="muted" style="font-weight:400;font-size:.85rem">(AI-as-system-under-test)</span></h2>
  <div class="gates">${gateCards}</div>

  <h2>Run history <span class="muted" style="font-weight:400;font-size:.8rem">(last ${Math.max(history.length, 0)} runs)</span></h2>
  <div class="card">
    ${history.length >= 2
      ? trendChart(history) + '<div class="muted" style="font-size:.72rem;margin-top:2px">pass rate per run; dashed line = 90% target</div>' + historyTable(history)
      : '<p class="muted" style="margin:0">The trend appears once there are at least two runs. History is carried across CI runs via the <code>--history</code> file (cached between builds).</p>'}
  </div>

  <footer>
    Generated by <code>scripts/kpi-report.js</code>. Full <a href="allure/index.html">Allure report</a> &middot;
    <a href="playwright-report/index.html">Playwright HTML report</a>.
    <br/>Raw data: <a href="kpi-summary.json">kpi-summary.json</a>.
  </footer>
</div>
<script type="application/json" id="kpi-data">${JSON.stringify(summary)}</script>
<script>
  document.querySelectorAll('tr.clickable[data-toggle]').forEach(function (tr) {
    tr.addEventListener('click', function () {
      var d = document.getElementById(tr.getAttribute('data-toggle'));
      if (d) d.classList.toggle('open');
      tr.classList.toggle('open');
    });
  });
</script>
</body>
</html>`;
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

// console summary for CI logs
console.log('KPIs: ' + overall.passed + '/' + overall.executed + ' passed (' + overall.passRate + '%), '
  + overall.failed + ' failed, ' + overall.skipped + ' skipped, ' + overall.flaky + ' flaky.'
  + (byReq.length ? ' ' + byReq.length + ' requirement(s) traced.' : ''));
console.log('Wrote ' + path.join(OUT_DIR, 'index.html') + ', kpi-summary.json, kpi-summary.md');

// non-zero exit if anything actually failed (optional gate for CI)
if (process.env.KPI_FAIL_ON_RED === '1' && overall.failed > 0) process.exit(1);
