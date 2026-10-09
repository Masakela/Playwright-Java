package com.example.agent;

import org.testng.SkipException;
import org.testng.annotations.AfterSuite;

import com.example.base.BaseTest;
import com.example.utils.Config;
import com.microsoft.playwright.APIRequestContext;

/**
 * AgentBaseTest - base for LIVE agent tests (AI as the system under test).
 * Adds a lazily-created APIRequestContext for hitting the agent API, and skips
 * when no endpoint is configured so `mvn test` stays green out of the box.
 *
 * The self-contained logic tests (EvaluatorTest / DataQualityTest / GuardrailTest)
 * and the mocked-network test (AgentMockingTest) do NOT extend this - they always run.
 */
public abstract class AgentBaseTest extends BaseTest {

    protected static APIRequestContext api;

    /** Lazily build the API context from the shared Playwright instance (set by BaseTest). */
    protected APIRequestContext apiContext() {
        if (api == null) {
            if (playwright == null) {
                throw new IllegalStateException("Playwright not initialized by BaseTest");
            }
            api = playwright.request().newContext();
        }
        return api;
    }

    @AfterSuite(alwaysRun = true)
    public void disposeApiContext() {
        if (api != null) {
            api.dispose();
            api = null;
        }
    }

    protected void requireAgentEndpoint() {
        if (!Config.hasAgentEndpoint()) {
            throw new SkipException("No agent endpoint configured. Set -Dagent.base.url=... "
                    + "or AGENT_BASE_URL to run live agent tests.");
        }
    }
}
