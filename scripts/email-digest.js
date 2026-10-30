#!/usr/bin/env node
/*
 * email-digest.js — send a management-facing QA status digest from test results.
 *
 * Reads a JUnit report, builds a short summary (pass rate, change vs last run,
 * open defects, dashboard link) and emails it to the recipients YOU configure.
 * Nothing is hard-coded: sender, recipients (any domain), and SMTP are all env/CLI.
 *
 * Usage:
 *   node email-digest.js --junit <file|dir> [--dashboard-url URL] [--history history.json] [--dry-run]
 *
 * Recipients & transport (env — fill these in manually; never commit them):
 *   MAIL_TO              comma-separated recipients, ANY domain (e.g. "cto@acme.com,qa-lead@vendor.io")
 *   MAIL_FROM            sender address (e.g. "qa-bot@yourco.com")
 *   MAIL_SUBJECT_PREFIX  optional subject tag (default "[QA]")
 *   SMTP_HOST            SMTP server (e.g. smtp.gmail.com, smtp.office365.com, smtp.sendgrid.net)
 *   SMTP_PORT            default 587
 *   SMTP_SECURE          "true" for port 465 (implicit TLS); otherwise STARTTLS on 587
 *   SMTP_USER / SMTP_PASS  SMTP credentials / API key
 *
 * --dry-run prints recipients + subject + body and sends nothing (no credentials needed).
 * The real send uses nodemailer:  npm i nodemailer
 */
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
function opt(name, def) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; }
function die(m) { console.error('✗ ' + m); process.exit(1); }
function env(k) { const v = process.env[k]; if ((v === undefined || v === '') && !DRY) die(`Missing env ${k} (set it, or use --dry-run to preview).`); return v || `UNSET_${k}`; }

// ---------------- minimal JUnit parser (file or directory) ----------------
function loadJUnit(p) {
  let files = [];
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp); else if (/\.xml$/i.test(e.name)) files.push(fp);
    });
    walk(p);
  } else files = [p];
  const cases = [];
  for (const f of files) {
    const xml = fs.readFileSync(f, 'utf8');
    for (const c of xml.match(/<testcase\b[\s\S]*?(?:\/>|<\/testcase>)/g) || []) {
      const open = (c.match(/<testcase\b[^>]*>/) || [c])[0];
      const at = (n) => { const m = open.match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : ''; };
      let status = 'passed';
      if (/<error\b/.test(c)) status = 'error';
      else if (/<failure\b/.test(c)) status = 'failed';
      else if (/<skipped\b/.test(c)) status = 'skipped';
      const msg = (c.match(/<(?:failure|error)\b[^>]*message="([^"]*)"/) || [])[1] || '';
      const reqM = (at('name') + ' ' + at('classname')).match(/\bREQ[-_]?(\d+)\b/i);
      cases.push({ name: at('name'), classname: at('classname'), status, message: msg, req: reqM ? 'REQ-' + reqM[1] : null });
    }
  }
  return cases;
}

function summarize(cases) {
  const s = { total: cases.length, passed: 0, failed: 0, error: 0, skipped: 0 };
  cases.forEach((c) => { s[c.status]++; });
  const executed = s.total - s.skipped;
  s.executed = executed;
  s.passRate = executed ? Math.round((s.passed / executed) * 1000) / 10 : 0;
  s.defects = cases.filter((c) => c.status === 'failed' || c.status === 'error');
  // requirement rollup
  const byReq = {};
  cases.forEach((c) => { if (!c.req) return; (byReq[c.req] = byReq[c.req] || []).push(c); });
  s.reqAtRisk = Object.entries(byReq)
    .map(([r, cs]) => {
      const exec = cs.filter((x) => x.status !== 'skipped');
      const pass = cs.filter((x) => x.status === 'passed').length;
      const broken = cs.filter((x) => x.status === 'failed' || x.status === 'error').length;
      return { req: r, total: cs.length, exec: exec.length, pass, broken, rate: exec.length ? Math.round((pass / exec.length) * 1000) / 10 : 100 };
    })
    .filter((r) => r.broken > 0); // at risk only if a test actually failed/errored (deferred ≠ at risk)
  return s;
}

// ---------------- history / trend (optional) ----------------
function trend(historyPath, passRate) {
  if (!historyPath) return { delta: null, prev: null, hist: null };
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { hist = []; }
  const prev = hist.length ? hist[hist.length - 1].passRate : null;
  const delta = prev === null ? null : Math.round((passRate - prev) * 10) / 10;
  return { delta, prev, hist, historyPath };
}
function appendHistory(t, passRate) {
  if (!t.historyPath) return;
  const hist = t.hist || [];
  hist.push({ date: new Date().toISOString().slice(0, 10), passRate });
  try { fs.writeFileSync(t.historyPath, JSON.stringify(hist.slice(-50), null, 2)); } catch (e) {}
}

// ---------------- compose ----------------
function arrow(d) { return d === null ? '' : d > 0 ? ` (▲ +${d} pts)` : d < 0 ? ` (▼ ${d} pts)` : ' (no change)'; }
function health(rate, hasCritical) { return hasCritical ? 'AT RISK' : rate >= 90 ? 'GREEN' : rate >= 80 ? 'STABLE' : 'NEEDS ATTENTION'; }

function build(cases, dashUrl) {
  const s = summarize(cases);
  const t = trend(opt('history', ''), s.passRate);
  const hasCritical = s.error > 0; // treat runtime errors as the most severe signal here
  const status = health(s.passRate, false);
  const subjectPrefix = process.env.MAIL_SUBJECT_PREFIX || '[QA]';
  const feature = (cases[0] && cases[0].classname.split('.')[0]) || 'Suite';
  const subject = `${subjectPrefix} ${feature} — ${s.passRate}% pass, ${s.defects.length} open defect(s)${arrow(t.delta)}`;

  const label = (d) => (d.req && !d.name.includes(d.req)) ? `${d.req} — ${d.name}` : d.name;
  const defectLines = s.defects.length
    ? s.defects.map((d) => `  • ${label(d)} — ${d.message || d.status}`).join('\n')
    : '  • None — all executed tests passed.';
  const reqLines = s.reqAtRisk.length
    ? s.reqAtRisk.map((r) => `  • ${r.req}: ${r.rate}% (${r.pass}/${r.exec} executed)`).join('\n')
    : '  • None — every requirement with a failing test.';

  const text =
`QA STATUS — ${feature}
Status: ${status}   Pass rate: ${s.passRate}%${arrow(t.delta)}

Executed ${s.executed} of ${s.total} tests: ${s.passed} passed, ${s.failed} failed, ${s.error} error, ${s.skipped} deferred.

Open defects (${s.defects.length}):
${defectLines}

Requirements at risk:
${reqLines}
${dashUrl ? `\nFull dashboard: ${dashUrl}` : ''}
Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`;

  const badge = status === 'GREEN' ? '#0ca30c' : status === 'STABLE' ? '#2e7d32' : status === 'NEEDS ATTENTION' ? '#c77700' : '#c62828';
  const html =
`<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#1f2d3d">
  <h2 style="margin:0 0 4px">QA Status — ${feature}</h2>
  <p style="margin:0 0 16px;color:#5b6b7b">Automated test run · ${new Date().toISOString().slice(0, 10)}</p>
  <table style="border-collapse:collapse;margin:0 0 18px">
    <tr>
      <td style="padding:10px 18px;background:${badge};color:#fff;border-radius:8px;font-weight:700;font-size:15px">${status}</td>
      <td style="padding:0 18px;font-size:30px;font-weight:700;color:#1f4e79">${s.passRate}%<span style="font-size:14px;font-weight:400;color:#5b6b7b"> pass${arrow(t.delta)}</span></td>
    </tr>
  </table>
  <p style="margin:0 0 14px">Executed <b>${s.executed}</b> of ${s.total} tests — ${s.passed} passed, ${s.failed} failed, ${s.error} error, ${s.skipped} deferred.</p>
  <h3 style="margin:0 0 6px;font-size:15px">Open defects (${s.defects.length})</h3>
  <ul style="margin:0 0 14px;padding-left:20px">${s.defects.length ? s.defects.map((d) => `<li>${(d.req && !d.name.includes(d.req)) ? '<b>' + d.req + '</b> — ' : ''}${d.name}<br><span style="color:#8a98a6;font-size:13px">${d.message || d.status}</span></li>`).join('') : '<li>None — all executed tests passed.</li>'}</ul>
  <h3 style="margin:0 0 6px;font-size:15px">Requirements at risk</h3>
  <ul style="margin:0 0 16px;padding-left:20px">${s.reqAtRisk.length ? s.reqAtRisk.map((r) => `<li><b>${r.req}</b>: ${r.rate}% (${r.pass}/${r.exec} executed)</li>`).join('') : '<li>None.</li>'}</ul>
  ${dashUrl ? `<p><a href="${dashUrl}" style="background:#1f4e79;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:600">Open full dashboard →</a></p>` : ''}
  <p style="color:#8a98a6;font-size:12px;margin-top:18px">Generated automatically from the test run. Reply to this address with questions.</p>
</div>`;

  return { subject, text, html, summary: s, t };
}

// ---------------- main ----------------
(async () => {
  const junit = opt('junit', '');
  if (!junit) die('Pass --junit <file|dir>.');
  const cases = loadJUnit(junit);
  if (!cases.length) die('No test cases found in ' + junit);
  const dashUrl = opt('dashboard-url', process.env.DASHBOARD_URL || '');
  const { subject, text, html, summary, t } = build(cases, dashUrl);

  const htmlOut = opt('html-out', '');
  if (htmlOut) { fs.writeFileSync(htmlOut, `<!doctype html><meta charset="utf-8"><title>${subject}</title>${html}`); console.log('Wrote HTML preview: ' + htmlOut + '\n'); }

  const to = (process.env.MAIL_TO || (DRY ? 'UNSET_MAIL_TO (fill in manually)' : '')).trim();
  const from = process.env.MAIL_FROM || (DRY ? 'UNSET_MAIL_FROM' : '');

  if (DRY) {
    console.log('[dry-run] no email sent.\n');
    console.log('To:      ' + to);
    console.log('From:    ' + from);
    console.log('Subject: ' + subject + '\n');
    console.log(text);
    console.log('\n[dry-run] HTML body built (' + html.length + ' chars). Set SMTP_* + MAIL_TO/FROM and drop --dry-run to send.');
    return;
  }

  if (!to) die('Set MAIL_TO to one or more recipients (comma-separated, any domain).');
  let nodemailer;
  try { nodemailer = require('nodemailer'); } catch (e) { die('nodemailer not installed. Run: npm i nodemailer'); }
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  });
  const info = await transport.sendMail({ from: env('MAIL_FROM'), to, subject, text, html });
  console.log(`✓ Digest sent to ${to} — messageId ${info.messageId}`);
  appendHistory(t, summary.passRate);
})().catch((e) => die(e.message || String(e)));
