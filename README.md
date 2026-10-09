# Playwright Agent Testing (Java) + UI Regression

Two things live in this project:

1. **SauceDemo UI regression** (the original) - Playwright for Java + TestNG + Maven,
   Page Object Model, data-driven login/inventory tests.
2. **AI-agent workflow testing** - "AI as the system under test" (`com.example.agent`):
   functional, data, guardrails, non-determinism, and an eval harness for the
   agent's non-deterministic output.

A zero-dependency **reference agent service** (`agent-server/`) *is* the agent under
test, so the whole thing runs end-to-end locally with no external dependencies.

> **A TypeScript edition** of the same agent-testing approach is a **separate
> project** (`playwright-agent-ts/`). This repo is the Java edition.

Both the UI and agent layers are built on the patterns from the three Playwright
reference docs (architecture, SDET framework, intermediate cheatsheet): POM,
fixtures, hooks, separate test data, parameterized tests, multiple environments,
API + UI testing, and network control/mocking. See **AI_AGENT_TESTING.md** for how
each doc maps into the code.

> **Full system walkthrough:** **[ARCHITECTURE.md](ARCHITECTURE.md)** documents the
> whole project in depth - components, data flow, the agent contract, every test
> type, the CI/KPI pipeline, configuration, and how to wire a real agent.

## Structure

```
pom.xml                       Maven build + deps (Playwright, TestNG, POI, Jackson, Allure)
testng.xml                    default suite (UI regression + offline agent tests)
testng-live.xml               LIVE agent suite (needs a running agent)
testng-ci.xml                 CI suite: UI + offline + live in one pass
Jenkinsfile                   legacy Jenkins pipeline (UI suite)
AI_AGENT_TESTING.md           guide: concepts + doc-to-code mapping
ARCHITECTURE.md               full system walkthrough

src/main/java/com/example/
  pages/   BasePage, LoginPage, InventoryPage      SauceDemo page objects
  utils/   ExcelReader, Config, JsonDataReader      data + env helpers
  agent/   AgentApiClient, AgentConsolePage         agent API client + console POM
    model/     AgentRequest, AgentResponse, AgentAction
    eval/      EvalCase, EvalResult, Evaluator, Guardrails
    validation/ DataQuality

src/test/java/com/example/
  base/    BaseTest                                 Playwright lifecycle
  tests/   LoginTest, InventoryTest                 SauceDemo UI tests
  agent/   AgentBaseTest                            API context + skip-if-unconfigured
           EvaluatorTest, DataQualityTest, GuardrailTest   offline logic (always run)
           AgentMockingTest                         offline: mock agent API, verify UI
           AgentApiUiWorkflowTest, AgentEvalHarnessTest,
           AgentNonDeterminismTest, AgentGuardrailLiveTest   LIVE (group "live")

src/test/resources/
  logins.xlsx                                       SauceDemo data
  agent/   eval-cases.json, guardrail-cases.json, agent-console.mock.html

agent-server/                  reference AI-agent service (the system under test)
  server.js                      zero-dep Node server: /api/agent/run, /agent, /health
  Dockerfile                     container image for the agent
docker-compose.yml             brings the agent up on http://localhost:8080
scripts/
  run-e2e.sh / run-e2e.ps1       start the agent + run the live suite, then stop it
  start-agent.sh / start-agent.ps1   just start the agent
  kpi-report.js                  build the stakeholder KPI dashboard
kpis/README.md                 KPI definitions + where reports live
```

## Run the whole project end-to-end

The `agent-server/` service implements the contract the live tests expect, so the
entire suite runs locally with nothing external.

**One command** (starts the agent, runs the live suite, stops the agent):

```bash
./scripts/run-e2e.sh        # macOS / Linux
.\scripts\run-e2e.ps1       # Windows PowerShell
```

**Or by hand:**

```bash
node agent-server/server.js            # or: docker compose up
# http://localhost:8080  (GET /agent for the console, /health for a ping)

mvn test -Dsurefire.suiteXmlFiles=testng-live.xml -Dagent.base.url=http://localhost:8080
```

Prerequisites: Node 18+ (for the agent), JDK 17+ & Maven, and (first run) Playwright
browsers. Open `http://localhost:8080/agent` to drive the agent by hand.

### Default port is 8787 (not 8080)

The reference agent defaults to **http://localhost:8787** because Jenkins and
Tomcat both grab **8080** on most dev machines - a busy 8080 means the agent
can't bind and the live tests hit the other service (a confusing **HTTP 403**).
Override with `PORT`/`$env:PORT` if 8787 is taken, or if you run the agent by
hand: `PORT=8787 node agent-server/server.js`.

### Behind a corporate proxy?

On managed machines an `HTTP_PROXY`/`HTTPS_PROXY` is often set, and Playwright's
request context will route the **localhost** agent call through it - the proxy then
answers **HTTP 403** and every live test fails. The project guards against this:
`BaseTest` passes `NO_PROXY` for `localhost`/`127.0.0.1`/`::1` into the Playwright
driver whenever the agent URL is local, and the `run-e2e` scripts do the same. If
you invoke Maven some other way and still see a 403, set it yourself first:

```bash
export NO_PROXY=localhost,127.0.0.1,::1   # PowerShell: $env:NO_PROXY="localhost,127.0.0.1,::1"
```

## Java - run

```bash
# one-time: download Playwright's browsers
mvn compile exec:java -e -D exec.mainClass=com.microsoft.playwright.CLI \
    -D exec.args="install --with-deps"

mvn test                       # UI regression + OFFLINE agent tests (green with no endpoint)
mvn test -Dbrowser=firefox     # or webkit; -Dheaded=true to watch

# LIVE agent suite against a running agent:
mvn test -Dsurefire.suiteXmlFiles=testng-live.xml \
         -Dagent.base.url=http://localhost:8080 \
         -Deval.threshold=0.8 -Dagent.repeat=3
```

## Continuous integration & stakeholder KPIs

`.github/workflows/ci.yml` runs on every push/PR:

1. **java-tests** - starts the reference agent, runs the full Java suite
   (`testng-ci.xml`: UI + offline + live), produces JUnit + **Allure** results.
2. **report** - generates the **Allure report**, builds a **stakeholder KPI
   dashboard** (`scripts/kpi-report.js`), posts the KPI summary to the Actions run
   summary, uploads everything as a build artifact, and (on `main`) **deploys to
   GitHub Pages**.

The published Pages site has the KPI dashboard at the root and the Allure report at
`/allure/`. KPIs include pass rate, totals, failures, skips, flaky count, duration,
a per-suite breakdown, and the four **agent quality gates** (eval task-success,
guardrail refusals, non-determinism, data validation). See `kpis/README.md`.

To enable the Pages deploy: **Settings -> Pages -> Source: GitHub Actions**.

Build the dashboard locally after a run:

```bash
node scripts/kpi-report.js --junit target/surefire-reports --out kpis-out
# open kpis-out/index.html
```

## Why it is split into "offline" and "live"

AI output is **non-deterministic** and a live agent may not be available in CI, so:

- **Offline tests** (`EvaluatorTest`, `DataQualityTest`, `GuardrailTest`,
  `AgentMockingTest`) exercise the evaluator / data-quality / guardrail logic and
  the UI via a **mocked** agent. They always run and keep the default build green.
- **Live tests** (group `live`) hit a real agent and assert **invariant
  properties**, a **task-success threshold**, **guardrail refusals**, and **data
  completeness** - the regression signal when the model or prompt changes.

## Selenium -> Playwright mapping (original UI layer)

| Selenium | Playwright (here) |
|----------|-------------------|
| WebDriver | Page / BrowserContext / Browser |
| WebDriverWait + ExpectedConditions | auto-waiting + web-first assertions |
| By.id / cssSelector / data-* | getByTestId / locator(css) |
| @DataProvider | @DataProvider (same) |
| ThreadLocal<WebDriver> | per-test BrowserContext (isolated) |
| Extent + screenshot listener | Playwright HTML report / trace / video |

## Notes

- **No explicit waits** - locator actions auto-wait; `assertThat(locator)` retries.
- **Isolation** - each test gets a fresh `BrowserContext`.
- **Test data** - `logins.xlsx` (GoodLogin/BadLogin); agent JSON datasets under
  `src/test/resources/agent/`.
