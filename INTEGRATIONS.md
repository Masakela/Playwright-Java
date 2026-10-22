# Import results into Jira/Xray, Zephyr, TestRail — Playwright skeleton edition

`scripts/import-results.js` pushes a test run's results into the systems teams track
work in. It's the **same zero-dependency script** used by the stlc-automation plugin —
it reads **JUnit XML**, so it's identical for the Java skeleton and the TS project; only
the report path differs. Drop it next to your existing `scripts/kpi-report.js`.

Credentials come only from environment variables; add `--dry-run` to preview any command.

## Install (both projects)

Copy `scripts/import-results.js` into each repo's `scripts/` folder. No dependencies,
Node 18+ (the same runtime `kpi-report.js` already needs).

### Java skeleton — ready to go
Surefire already writes JUnit to `target/surefire-reports/`. After `mvn test`:
```bash
node scripts/import-results.js xray     --junit target/surefire-reports/junit.xml
node scripts/import-results.js testrail  --junit target/surefire-reports/junit.xml --create-missing
```
> Surefire emits one `TEST-*.xml` per class. If you don't already aggregate them,
> either point `--junit` at a merged file, or add the Surefire **report plugin** /
> `failsafe`-style merge. Most setups already have a combined `junit.xml`; if not,
> tell me and I'll add the one-liner to `pom.xml`.

### TS project — add the JUnit reporter (one line)
Your `playwright.config.ts` currently has html/json/allure reporters. Add `junit`:
```ts
export default defineConfig({
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],   // <-- add this line
    // ...allure, etc.
  ],
});
```
Then after `npx playwright test`:
```bash
node scripts/import-results.js xray     --junit test-results/junit.xml
node scripts/import-results.js testrail  --junit test-results/junit.xml --create-missing
```

## Targets & environment variables

Identical to the stlc-automation integration — see that package's `INTEGRATIONS.md`
for the full table. In short:

| Command | System | Env vars |
|--------|--------|----------|
| `xray` | Jira / Xray (Cloud) | `XRAY_CLIENT_ID`, `XRAY_CLIENT_SECRET`, `XRAY_PROJECT_KEY`, *(opt)* `XRAY_TEST_PLAN_KEY` |
| `xray` | Jira / Xray (Server/DC) | `XRAY_MODE=server`, `JIRA_BASE_URL`, `JIRA_PAT` *or* `JIRA_USER`+`JIRA_API_TOKEN`, `XRAY_PROJECT_KEY` |
| `zephyr` | Zephyr Scale (Cloud) | `ZEPHYR_API_TOKEN`, `ZEPHYR_PROJECT_KEY`, *(opt)* `ZEPHYR_TEST_CYCLE_KEY` |
| `testrail` | TestRail | `TESTRAIL_URL`, `TESTRAIL_USER`, `TESTRAIL_API_KEY`, `TESTRAIL_PROJECT_ID`, *(opt)* `TESTRAIL_SUITE_ID`; `TESTRAIL_SECTION_ID` for `--create-missing` |
| `jira-defects` | Jira | `JIRA_BASE_URL`, `JIRA_USER`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, *(opt)* `JIRA_DEFECT_ISSUETYPE`, `JIRA_LABELS` |

TestRail resolves tests by a `C<id>` token, then a saved map, then (`--create-missing`)
by creating the case — so it works for an existing, empty, or mixed suite, and reuses a
`testrail-map.json` on re-runs to avoid duplicates. Xray and Zephyr do their own matching
on import.

## CI wiring

Both projects' `.github/workflows/ci.yml` already run tests, build the KPI dashboard, and
deploy Pages. Add the step below to the job that has the JUnit report, **after** the test
step. `if: always()` reports results even when tests fail. Store each value as a repo
secret (Settings → Secrets and variables → Actions).

### Java skeleton — add to the `java-tests` job
```yaml
      - name: Import results into Jira/Xray
        if: always()
        env:
          XRAY_CLIENT_ID:     ${{ secrets.XRAY_CLIENT_ID }}
          XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
          XRAY_PROJECT_KEY:   QA
        run: node scripts/import-results.js xray --junit target/surefire-reports/junit.xml
```

### TS project — add to the `ts-tests` job
```yaml
      - name: Import results into Jira/Xray
        if: always()
        env:
          XRAY_CLIENT_ID:     ${{ secrets.XRAY_CLIENT_ID }}
          XRAY_CLIENT_SECRET: ${{ secrets.XRAY_CLIENT_SECRET }}
          XRAY_PROJECT_KEY:   QA
        run: node scripts/import-results.js xray --junit test-results/junit.xml
```

Swap the command/env for `testrail`, `zephyr`, or `jira-defects` as needed. The step
is a no-op you can leave in place until the secrets exist — with them unset the run
prints a clear "missing env var" message and the job step fails only that step (keep it
in a separate, non-blocking step or guard with `if: ${{ secrets.XRAY_CLIENT_ID != '' }}`).
