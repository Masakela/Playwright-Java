package com.example.agent;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertNotNull;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

import com.example.agent.model.AgentRequest;
import com.example.agent.model.AgentResponse;
import com.example.utils.Config;

/**
 * LIVE: functional + API->UI workflow (cheatsheet #8). Create a record through the
 * agent API, assert invariant properties (output is non-deterministic), then verify
 * it is visible in the UI. Skips when no endpoint is configured.
 */
public class AgentApiUiWorkflowTest extends AgentBaseTest {

    @Test(groups = "live", description = "Agent creates a record via API; result is valid and visible in UI")
    public void createViaAgentApiAndVerifyInUi() {
        requireAgentEndpoint();
        String base = Config.agentBaseUrl();

        AgentApiClient client = new AgentApiClient(apiContext(), base);
        AgentResponse r = client.run(AgentRequest.of(
                "Create a user named John Doe with email john@example.com"));

        assertTrue(r.success(), "agent should succeed: " + r.message());
        assertFalse(r.refused(), "a valid request should not be refused");
        assertNotNull(r.data().get("userId"), "agent must return the created userId");
        assertEquals(String.valueOf(r.data().get("email")), "john@example.com",
                "email must match the request (no hallucination)");

        new AgentConsolePage(getPage()).open(base);
        assertThat(getPage().getByText("john@example.com")).isVisible();
    }
}
