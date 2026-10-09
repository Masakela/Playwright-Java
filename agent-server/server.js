'use strict';

/*
 * Reference AI-agent service - the "system under test" for the Playwright
 * agent-testing suites. Zero dependencies (Node's built-in http only), so it runs
 * with `node server.js` or inside the provided Docker image.
 *
 * Endpoints
 *   GET  /health            -> { status: "ok" }
 *   POST /api/agent/run     -> { goal, context } => AgentResponse
 *   GET  /api/agent/users   -> created users (so the console UI can list them)
 *   GET  /agent             -> minimal console UI (data-testid hooks the POM uses)
 *
 * It is intentionally rule-based and deterministic on the INVARIANTS the tests
 * assert (success, refusal, required data fields, specific values) while leaving
 * runId non-deterministic - exactly the shape real agent tests must tolerate.
 */

const http = require('http');

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

/** In-memory store of users the agent "created" (reset on restart). */
const users = [];
let userSeq = 0;

// ---------------------------------------------------------------- helpers ----
function newRunId() {
  return 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

function capitalizeWords(s) {
  return s
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractEmail(goal) {
  const m = goal.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1] : null;
}

function extractName(goal, email) {
  const named = goal.match(/named\s+([A-Za-z][A-Za-z .'-]*?)(?:\s+with\b|\s+and\b|,|\.|$)/i);
  if (named) return named[1].trim();
  if (email) return capitalizeWords(email.split('@')[0]);
  return '';
}

function extractRole(goal) {
  if (/\badmin\b/i.test(goal)) return 'Admin';
  const m = goal.match(/\b([A-Za-z]+)\s+role\b/i) || goal.match(/\brole\s+(?:of\s+)?([A-Za-z]+)/i);
  if (m) return capitalizeWords(m[1]);
  return 'User';
}

function extractOrderId(goal) {
  const m = goal.match(/order\s*#?\s*(\d+)/i) || goal.match(/(\d{3,})/);
  return m ? m[1] : null;
}

// --------------------------------------------------------------- guardrails --
function guardrailReason(lower) {
  if (/\bdelete\b/.test(lower) && /\b(all|production|prod|everything)\b/.test(lower)) {
    return 'destructive bulk/production deletion is not permitted';
  }
  if (/\bpassword(s)?\b/.test(lower) || /\bapi key/.test(lower) || /\bsecret/.test(lower) || /exfiltrat/.test(lower)) {
    return 'requesting credentials or secrets is not permitted';
  }
  if (/\btransfer\b/.test(lower) && (/\$/.test(lower) || /\baccount\b/.test(lower))) {
    return 'moving funds is outside this agent\'s scope';
  }
  return null;
}

// -------------------------------------------------------------- core logic ---
function runAgent(goal) {
  const text = String(goal || '');
  const lower = text.toLowerCase();

  // 1) Guardrails first - refuse out-of-scope / unsafe requests.
  const reason = guardrailReason(lower);
  if (reason) {
    return {
      runId: newRunId(),
      success: false,
      refused: true,
      message: 'Refused: ' + reason + '.',
      actions: [],
      data: {},
    };
  }

  // 2) Create / onboard a user.
  if (/\buser\b/.test(lower) && /(create|onboard|add|register|provision)/.test(lower)) {
    const email = extractEmail(text);
    if (!email) {
      return {
        runId: newRunId(),
        success: false,
        refused: false,
        message: 'Could not create a user: no email address was provided.',
        actions: [],
        data: {},
      };
    }
    const name = extractName(text, email);
    const role = extractRole(text);
    const userId = 'u-' + (++userSeq).toString().padStart(4, '0');
    const record = { userId, email, name, role };
    users.push(record);
    return {
      runId: newRunId(),
      success: true,
      refused: false,
      message: 'User created: ' + email + ' (' + name + ', ' + role + ').',
      actions: [{ tool: 'create_user', args: { email, name, role }, status: 'ok' }],
      data: record,
    };
  }

  // 3) Look up an order.
  if (/\border\b/.test(lower) && /\d/.test(lower)) {
    const orderId = extractOrderId(text);
    const status = 'Shipped';
    return {
      runId: newRunId(),
      success: true,
      refused: false,
      message: 'Order ' + orderId + ' status: ' + status + '.',
      actions: [{ tool: 'lookup_order', args: { orderId }, status: 'ok' }],
      data: { orderId, status },
    };
  }

  // 4) Nothing matched.
  return {
    runId: newRunId(),
    success: false,
    refused: false,
    message: 'Unsupported goal: no workflow matched this request.',
    actions: [],
    data: {},
  };
}

// ------------------------------------------------------------------ console --
function consoleHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Agent Console</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 2rem auto; padding: 0 1rem; color: #1f2a44; }
    h1 { font-size: 1.4rem; }
    input, button { font-size: 1rem; padding: .5rem .6rem; }
    input { width: 60%; }
    button { cursor: pointer; }
    pre { background: #0f1b2d; color: #e6edf3; padding: 1rem; border-radius: 8px; white-space: pre-wrap; }
    .status { font-weight: 600; margin: .5rem 0; }
    ul { padding-left: 1.1rem; }
    li { margin: .2rem 0; }
    .muted { color: #57606a; }
  </style>
</head>
<body>
  <h1>Agent Console</h1>
  <p class="muted">Describe a goal (e.g. "Create a user named John Doe with email john@example.com").</p>
  <div>
    <input data-testid="agent-goal-input" placeholder="Describe a goal..." />
    <button data-testid="agent-submit">Run</button>
  </div>
  <div class="status">Status: <span data-testid="agent-status"></span></div>
  <pre data-testid="agent-response"></pre>

  <h2>Created users</h2>
  <ul data-testid="agent-users"></ul>

  <script>
    async function refreshUsers() {
      const res = await fetch('/api/agent/users');
      const list = await res.json();
      const ul = document.querySelector('[data-testid=agent-users]');
      ul.innerHTML = '';
      for (const u of list) {
        const li = document.createElement('li');
        li.setAttribute('data-testid', 'user-row');
        li.textContent = u.email + ' — ' + (u.name || '') + ' (' + (u.role || '') + ')';
        ul.appendChild(li);
      }
    }

    document.querySelector('[data-testid=agent-submit]').addEventListener('click', async () => {
      const goal = document.querySelector('[data-testid=agent-goal-input]').value;
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      const j = await res.json();
      document.querySelector('[data-testid=agent-status]').textContent =
        j.success ? 'success' : (j.refused ? 'refused' : 'error');
      document.querySelector('[data-testid=agent-response]').textContent = j.message;
      await refreshUsers();
    });

    refreshUsers();
  </script>
</body>
</html>`;
}

// ------------------------------------------------------------------- server --
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';

  if (req.method === 'GET' && url === '/health') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (req.method === 'GET' && (url === '/agent' || url === '/agent/')) {
    const html = consoleHtml();
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'GET' && url.startsWith('/api/agent/users')) {
    return sendJson(res, 200, users);
  }

  if (req.method === 'POST' && url.startsWith('/api/agent/run')) {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(); // basic guard
    });
    req.on('end', () => {
      let goal = '';
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        goal = parsed.goal || '';
      } catch (e) {
        return sendJson(res, 400, { error: 'invalid JSON body' });
      }
      return sendJson(res, 200, runAgent(goal));
    });
    return;
  }

  sendJson(res, 404, { error: 'not found', path: url });
});

server.listen(PORT, () => {
  console.log('Reference agent listening on http://localhost:' + PORT);
  console.log('  POST /api/agent/run   GET /agent   GET /api/agent/users   GET /health');
});

module.exports = { runAgent }; // exported for quick unit checks
