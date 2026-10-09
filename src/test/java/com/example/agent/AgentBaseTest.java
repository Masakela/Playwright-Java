package com.example.agent;

import org.testng.SkipException;
import org.testng.annotations.AfterMethod;

import com.example.base.BaseTest;
import com.example.utils.Config;
import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.Playwright;

/**
 * AgentBaseTest - base for LIVE agent tests (AI as the system under test).
 * Adds a per-thread APIRequestContext for hitting the agent API, and skips when no
 * endpoint is configured so `mvn test` stays green out of the box.
 *
 * The API context is built from THIS thread's Playwright (BaseTest creates one per
 * test method), so it is safe under parallel="methods" and is disposed per method.
 *
 * The self-contained logic tests (EvaluatorTest / DataQualityTest / GuardrailTest)
 * and the mocked-network test (AgentMockingTest) do NOT extend this.
 */
public abstract class AgentBaseTest extends BaseTest {

    private static final ThreadLocal<APIRequestContext> API = new ThreadLocal<>();

    /** Lazily build this thread's API context from the thread's Playwright instance. */
    protected APIRequestContext apiContext() {
        APIRequestContext ctx = API.get();
        if (ctx == null) {
            Playwright pw = playwright();
            if (pw == null) {
                throw new IllegalStateException("Playwright not initialized by BaseTest");
            }
            ctx = pw.request().newContext();
            API.set(ctx);
        }
        return ctx;
    }

    // Runs before BaseTest.tearDown (TestNG runs subclass @AfterMethod first), so the
    // API context is disposed while its owning Playwright is still open.
    @AfterMethod(alwaysRun = true)
    public void disposeApiContext() {
        APIRequestContext ctx = API.get();
        if (ctx != null) {
            try { ctx.dispose(); } catch (Exception ignored) { }
            API.remove();
        }
    }

    protected void requireAgentEndpoint() {
        if (!Config.hasAgentEndpoint()) {
            throw new SkipException("No agent endpoint configured. Set -Dagent.base.url=... "
                    + "or AGENT_BASE_URL to run live agent tests.");
        }
    }
}
