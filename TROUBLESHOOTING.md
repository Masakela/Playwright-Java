# Playwright Java Skeleton — Run & Troubleshooting Runbook

Project: `C:\QA Skeleton Projects\portfolio\playwright-java-skeleton`
Stack: Playwright for Java + TestNG + Maven, SauceDemo UI regression, zero-dependency
Node reference agent, KPI dashboard.
Last verified green: 2026-10-09.

This records the full sequence of getting the Java suite green locally end-to-end. It
hit more issues than the TypeScript edition (threading, locators, a stale build), so
this is the more valuable reference. Each section is symptom → cause → fix → why.

---

## 1. Happy path — run it

```powershell
cd "C:\QA Skeleton Projects\portfolio\playwright-java-skeleton"

# First run ONLY: download Playwright's browsers for Java
mvn compile exec:java "-Dexec.mainClass=com.microsoft.playwright.CLI" "-Dexec.args=install"

# Run everything (agent on 8787 → UI + offline + live suite → dashboard)
powershell -ExecutionPolicy Bypass -File scripts\run-e2e.ps1
Invoke-Item .\kpis-out\index.html
```

`run-e2e.ps1` starts the bundled agent on `http://localhost:8787`, runs `testng-ci.xml`
(SauceDemo UI regression + offline evaluator/guardrail/data-quality logic + the live
agent suite via `mvn clean test`), then builds the KPI dashboard at `kpis-out\index.html`.

Prerequisites: JDK 17+, Maven, Node 18+ (for the bundled agent).

Offline/default build (UI + offline agent logic; live tests skip with no endpoint):

```powershell
mvn clean test
```

---

## 2. Issues we hit and how they were solved
### 2.1 Port collision → HTTP 403 (same as the TS project)

**Symptom.** Live tests failed; agent calls returned `HTTP 403`.

**Root cause.** **Jenkins** was already listening on port **8080**, so the Node agent
couldn't bind and tests hit Jenkins instead.

**Diagnosis.**

```powershell
netstat -ano | findstr :8080               # find the PID holding 8080
curl.exe -s -i http://localhost:8080/health # healthy agent returns {"status":"ok"}
```

**Fix.** Default port moved to **8787** in `run-e2e.ps1`. Override with `$env:PORT`
if needed. (A 403 from a local JSON server = wrong process on the port, not a code bug.)

### 2.2 Compilation error — `cannot find symbol: class RouteFulfillOptions`

**Symptom.**
`AgentMockingTest.java:[12,40] cannot find symbol: class RouteFulfillOptions
location: package com.microsoft.playwright.options`

**Root cause.** In Playwright for Java the route-fulfill options are a **nested class**,
`com.microsoft.playwright.Route.FulfillOptions` — there is no
`com.microsoft.playwright.options.RouteFulfillOptions`.

**Fix.** In `AgentMockingTest.java`:

```java
import com.microsoft.playwright.Route;          // not ...options.RouteFulfillOptions
// ...
route.fulfill(new Route.FulfillOptions().setContentType("text/html").setBody(html));
```

**Recognize it again.** "cannot find symbol" for a Playwright `*Options` type usually
means it's nested under its owner class (e.g. `Route.FulfillOptions`,
`BrowserType.LaunchOptions`, `Locator.FilterOptions`, `Playwright.CreateOptions`), not
in the `options` package. `RequestOptions` is one of the few genuinely in `options`.

### 2.3 Playwright threading — "Cannot find object to call __adopt__"

**Symptom.**
`BaseTest.createContextAndPage ... Playwright Cannot find object to call __adopt__:
browser-context@...`, intermittently, once the live tests actually ran.

**Root cause.** Playwright for Java is **not thread-safe**: every object must be used on
the same thread that created the `Playwright` instance owning it. The suite runs
`parallel="methods" thread-count="3"`, but `BaseTest` shared one static
`Playwright`/`Browser` across those threads. (It didn't surface earlier because the 403
made live tests bail before doing much browser work.)

**Fix.** Give each test method its **own** Playwright + Browser + Context + Page, created
on the test thread and held in `ThreadLocal`s, torn down in `@AfterMethod`. The API
context (`AgentBaseTest`) is built from that same per-thread Playwright. This is the
pattern Playwright recommends for parallel TestNG. See `BaseTest.java` and
`AgentBaseTest.java`.

**Recognize it again.** Any Playwright-Java "Cannot find object" / "__adopt__" /
"object has been collected" error under parallel TestNG = cross-thread object use. Make
Playwright/Browser per-thread (or run serially).

### 2.4 SauceDemo login failed — wrong test-id attribute

**Symptom.** `InventoryTest.login` (the `@BeforeMethod`) failed; the `fill()` on the
username field timed out. The site itself was reachable:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" https://www.saucedemo.com   # => 200
```

**Root cause.** SauceDemo tags fields with the **`data-test`** attribute, but
Playwright's `getByTestId()` looks for **`data-testid`** by default — so the locators
never matched. (The agent console genuinely uses `data-testid`, so the two layers need
different attributes.)

**Fix.** Point the SauceDemo page objects at `data-test` explicitly instead of
`getByTestId` (leaving the agent console on `getByTestId`). In `LoginPage.java` /
`InventoryPage.java`:

```java
page.locator("[data-test='username']");
page.locator("[data-test='login-button']");
page.locator("[data-test='add-to-cart-" + slug + "']");
```

**Recognize it again.** If `getByTestId("x")` never finds an element, check the page's
actual attribute. It's `data-testid` by default; sites using `data-test` (like SauceDemo)
need explicit `[data-test='x']` locators, or a global
`selectors().setTestIdAttribute("data-test")` if the WHOLE suite uses that attribute.

### 2.5 Shared instance field race — one test saw another's page

**Symptom.** `InventoryTest.inventoryPageLoads ... Playwright Error` (page/context
closed) under parallel run.

**Root cause.** `InventoryTest` stored the logged-in `InventoryPage` in an **instance
field**. Under `parallel="methods"` TestNG reuses one test-class instance across
threads, so concurrent `@Test` methods overwrote that field and one thread used another
thread's (closed) page.

**Fix.** Don't share state in a field. Rebuild the page object from the per-thread
`getPage()` inside each test:

```java
private InventoryPage inventory() { return new InventoryPage(getPage()); }
```

**Recognize it again.** "Target page/context/browser has been closed" under parallel
TestNG often means shared mutable state across threads. Keep per-test state in
`ThreadLocal` or local variables, never plain instance/static fields.

### 2.6 Strict-mode violation — duplicate `id="inventory_container"`

**Symptom.**
`strict mode violation: locator("#inventory_container") resolved to 2 elements`
(a `<div role="main" id="inventory_container">` wrapper and the real grid div).

**Root cause.** SauceDemo ships **invalid HTML** with a duplicate `id`. An id selector
is therefore ambiguous under Playwright strict mode.

**Fix.** Use the unique `data-test` hooks instead of the id/classes:

```java
page.locator("[data-test='inventory-container']");
page.locator("[data-test='inventory-item-name']");
page.locator("[data-test='shopping-cart-badge']");
```

### 2.7 Stale Maven build — fixes "didn't take"

**Symptom.** After editing a source file, the **old** behavior still ran — the error
message even named the old locator (`#inventory_container`) that was no longer in the
file.

**Root cause.** The run script used `mvn test` (no `clean`). When a file's timestamp
isn't newer than the previously compiled `.class`, Maven's incremental compiler skips
recompiling it and runs the stale class. (This bit us hardest when files were written by
a tool that didn't bump mtimes.)

**Fix.** Force a clean compile. The run script now uses `mvn clean test`. To force it
once by hand:

```powershell
Remove-Item -Recurse -Force target -ErrorAction SilentlyContinue
mvn clean test
```

**Recognize it again.** If a change you *know* you made doesn't show up — especially if
an error names code that's no longer there — suspect a stale build. Verify the file on
disk, then `clean`:

```powershell
Get-Content src\main\java\com\example\pages\InventoryPage.java | Select-String "inventory.container"
```

### 2.8 Unique test data for the UI workflow (same idea as TS 2.2)

`AgentApiUiWorkflowTest` originally created a fixed `john@example.com`, which collided
with the users the non-determinism suite creates against the one shared agent → the UI
assertion matched multiple rows. Fixed with a unique email + a scoped `hasCount(1)`
assertion, mirroring the TypeScript functional spec.

---

## 3. Command glossary

| Command | What it does | When to use |
|---|---|---|
| `mvn compile exec:java "-Dexec.mainClass=com.microsoft.playwright.CLI" "-Dexec.args=install"` | Download Playwright browsers for Java | First run only |
| `scripts\run-e2e.ps1` | Agent (8787) → `mvn clean test` (UI+offline+live) → dashboard | Normal full run |
| `mvn clean test` | Clean build + default suite (UI + offline; live skips) | Quick check / force recompile |
| `mvn clean test -Dbrowser=firefox` | Same, on firefox (or `webkit`); add `-Dheaded=true` to watch | Cross-browser / debugging |
| `Remove-Item -Recurse -Force target` | Delete compiled output | Force a truly clean build |
| `netstat -ano \| findstr :8787` | Show what's on the port (PID last) | Suspected port collision |
| `curl.exe -s -i http://localhost:8787/health` | Check the agent is up and ours (`{"status":"ok"}`) | Live tests can't reach the agent |
| `curl.exe -s -o NUL -w "%{http_code}" https://www.saucedemo.com` | Check external-site connectivity | SauceDemo tests failing |
| `$env:PORT = "NNNN"` | Override the agent/test port | 8787 taken |
| `Get-Content <file> \| Select-String "<pattern>"` | Print matching lines of a file on disk | Verify an edit actually landed |

---

## 4. Push changes

```powershell
cd "C:\QA Skeleton Projects\portfolio\playwright-java-skeleton"
git add -A
git commit -m "..."
git push
```

After pushing, enable **Settings → Pages → Source: GitHub Actions** in the GitHub repo
to publish the dashboard and Allure report to a shareable URL.

---

## 5. One-line summary of the whole chain

Port collision (Jenkins on 8080) → compile error (nested `Route.FulfillOptions`) →
Playwright threading (per-thread Playwright) → wrong test-id attribute (`data-test` vs
`data-testid`) → shared instance-field race (per-thread page objects) → duplicate-id
strict mode (unique `data-test`) → stale Maven build (`mvn clean test`). Each fix is a
standard, portable practice — not a workaround — so the project now runs green on any
machine.
