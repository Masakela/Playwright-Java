# Onboarding — adopt this on a new project in under an hour (Java)

A step-by-step runbook for pointing this Playwright-for-Java / TestNG skeleton at a real
application and getting a green suite, a KPI dashboard, and CI reporting quickly.

> Rule of thumb: get the **offline** suite green first (zero setup), then point it at
> the app, then wire CI. Each step is independently useful.

## 0 · Prerequisites (~5 min)
- JDK 17+, Maven, and Node 18+ (Node runs the bundled reference service and the KPI script)

## 1 · Clone & build (~5 min)
```bash
git clone <this-repo> && cd playwright-java-skeleton
mvn -q compile exec:java -e \
  -D exec.mainClass=com.microsoft.playwright.CLI \
  -D exec.args="install --with-deps chromium"
```

## 2 · Prove it works — offline, no app needed (~3 min)
```bash
mvn test                 # UI + offline agent tests — green with no endpoint configured
```
Green here means the framework is sound before you touch the client's app.

## 3 · Point it at the real application (~10 min)
The agent/app endpoint is read from a property / env var, never hard-coded:
```bash
cp .env.example .env     # then set, e.g.:
#   AGENT_BASE_URL=http://the-app-under-test.example.com
```
- Conventional web app? Set the base URL and adapt the page objects under
  `src/main/java/com/example/pages/` to the app's pages.
- AI/agent feature? Keep the contract in `src/main/java/com/example/agent/` and update
  `AgentApiClient.java` + the response model to match the real endpoint.

## 4 · Run against the app (~5 min)
```bash
mvn test -Dsurefire.suiteXmlFiles=testng-live.xml \
         -Dagent.base.url=http://the-app.example.com \
         -Deval.threshold=0.8
```

## 5 · Build the stakeholder dashboard (~2 min)
```bash
node scripts/kpi-report.js --junit target/surefire-reports --out kpis-out
# open kpis-out/index.html
```
Donut pass-rate, suite drill-down, requirement traceability, and run-history trend.

## 6 · Wire CI + published dashboard (~10 min)
- Copy `.github/workflows/ci.yml` (already in the repo) — it runs the suite, builds the
  dashboard, and deploys to GitHub Pages on every push.
- In GitHub: **Settings → Pages → Source: GitHub Actions**.

## 7 · (Optional) Push results to their tracker (~10 min)
Surefire writes one `TEST-*.xml` per class; the importer merges the directory. See `INTEGRATIONS.md`:
```bash
node scripts/import-results.js xray     --junit target/surefire-reports
node scripts/import-results.js testrail --junit target/surefire-reports --create-missing
# preview with no credentials:
bash scripts/import-dry.sh      # or scripts\import-dry.ps1 on Windows
```

## 8 · Turn on traceability (ongoing)
Name a test with a requirement id and it appears in the dashboard's traceability table,
linked to its result:
```java
@Test
public void reqValidLogin() { /* name it so the report reads "REQ-003 valid login" */ }
```

---
**Delivered in order:** green framework → app wired → dashboard → CI → tracker → traceability.
Stop at whatever depth the engagement needs.
