# Testing AI Agents ("AI as the system under test")

This scaffold treats an **AI agent** as the thing under test: software that takes a
natural-language goal and performs a workflow (e.g. "create a user", "look up an
order"), exposed via an **API** (`POST /api/agent/run`) and a **console UI**.

Testing an agent differs from normal software because the output is
**non-deterministic**. So we never assert exact string equality - we assert
**invariant properties**, measure a **task-success rate** against a golden set, and
check **guardrails** and **data quality**.

## What we test, and where

| Dimension | Idea | Java | TypeScript |
|-----------|------|------|------------|
| Functional / API->UI | Agent completes the workflow; result visible in UI | `AgentApiUiWorkflowTest` | `agent-functional.spec.ts` |
| Data validation | Output record complete, no dupes, source->target matches request | `DataQualityTest`, `AgentApiUiWorkflowTest` | `agent-data-validation.spec.ts`, `unit-evaluator.spec.ts` |
| Guardrails | Out-of-scope requests refused; no leak; tool scope | `GuardrailTest`, `AgentGuardrailLiveTest` | `agent-guardrails.spec.ts`, `unit-evaluator.spec.ts` |
| Non-determinism | Invariants hold across repeated runs | `AgentNonDeterminismTest` | `agent-nondeterminism.spec.ts` |
| Eval harness | Golden set meets a task-success threshold | `AgentEvalHarnessTest` | `agent-eval-harness.spec.ts` |
| Deterministic UI | Mock the agent so the console can be verified | `AgentMockingTest` | `agent-mocking.spec.ts` |

## Core ideas

- **Property-based evaluation.** `Evaluator.evaluate(case, response)` checks refusal,
  semantic `mustContain`, `requiredDataFields`, and specific `expectedData` values -
  never the exact message. `successRate(...)` is the metric the harness gates on.
- **Golden datasets.** `eval-cases.json` and `guardrail-cases.json` keep cases out of
  code (cheatsheet #5). Re-run them whenever the model or prompt changes - that is the
  AI-agent equivalent of a regression pack.
- **Guardrails.** `Guardrails` verifies the agent refuses out-of-scope goals, does not
  leak forbidden terms, and only calls allow-listed tools.
- **Data quality.** `DataQuality` applies the data-migration checks (missing fields,
  duplicate keys, source-to-target reconciliation) to the records the agent produces.
- **Mocking.** The offline UI test intercepts `POST /api/agent/run` (cheatsheet #9 /
  SDET mocking rule) so the console can be verified with no live model.

## How the three reference docs map in

- **Architecture 2026** - scalable project structure; UI + API automation; CI/CD +
  observability (trace/screenshot/video/report in `playwright.config.ts` and the
  Jenkinsfile); human-in-the-loop (we assert the agent's output, humans own the bar).
- **SDET framework** - `api/clients`, `ui/pages` + validators, fixtures, utils,
  separate test data; the 20-rule bar (stable locators via `getByTestId`, data in
  files, assert the body not just status, mock at the network).
- **Intermediate cheatsheet** - the concrete patterns used verbatim: POM (#1),
  fixtures (#2), hooks (#3), auth/storage (#4, available via BrowserContext),
  test data (#5), parameterized (#6), multiple environments (#7), API + UI (#8),
  network control (#9), projects/browsers (#10).

## Wiring it to a real agent

Set the endpoint and run the live suite:

```bash
# Java
mvn test -Dsurefire.suiteXmlFiles=testng-live.xml -Dagent.base.url=https://your-agent

# TypeScript
AGENT_BASE_URL=https://your-agent  (cd playwright-ts && npm test)
```

If your agent's API differs from the assumed contract, adjust `AgentApiClient`
(Java) / `agentClient.ts` (TS) and the `AgentResponse` shape - everything else keys
off those. The assumed response shape:

```json
{ "runId": "...", "success": true, "refused": false, "message": "...",
  "actions": [{ "tool": "create_user", "args": {}, "status": "ok" }],
  "data": { "userId": "u-100", "email": "john@example.com" } }
```
