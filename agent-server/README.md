# Reference Agent Server

The **system under test** for the Playwright agent suites: a tiny, zero-dependency
Node service that implements the agent contract the tests expect. It is rule-based
and deterministic on the invariants the tests assert (success, refusal, required
data fields, specific values), while leaving `runId` non-deterministic.

## Run

```bash
node server.js                 # http://localhost:8080
PORT=9090 node server.js       # custom port
# or
docker build -t reference-agent . && docker run -p 8080:8080 reference-agent
```

## Endpoints

| Method + path         | Purpose |
|-----------------------|---------|
| `GET  /health`        | `{ "status": "ok" }` |
| `POST /api/agent/run` | `{ goal, context }` -> AgentResponse |
| `GET  /api/agent/users` | users created so far (the console lists them) |
| `GET  /agent`         | minimal console UI with the `data-testid` hooks |

## Supported goals

- **Create / onboard a user** - e.g. "Create a user named John Doe with email
  john@example.com" -> `create_user`, returns `{ userId, email, name, role }`.
- **Look up an order** - e.g. "Look up order 10452 and return its status" ->
  `lookup_order`, returns `{ orderId, status }`.
- **Guardrails (refused)** - bulk/production deletion, requests for
  passwords/secrets/API keys, or moving funds -> `refused: true, success: false`.

Anything else returns `success: false` with an "unsupported goal" message.
