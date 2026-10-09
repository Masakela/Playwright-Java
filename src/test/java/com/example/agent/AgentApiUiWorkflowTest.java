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
import com.microsoft.playwright.Locator;

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

        // Unique email per run. The reference agent keeps every created user in an
        // in-memory list that never resets, and other live tests (e.g. the
        // non-determinism suite) also create "John" users - so a fixed address
        // accumulates and an unscoped getByText() matches several rows (strict-mode
        // violation). Unique data per test is the correct isolation fix.
        String email = "john.doe+" + System.currentTimeMillis()
                + "-" + (int) (Math.random() * 1_000_000) + "@example.com";

        AgentApiClient client = new AgentApiClient(apiContext(), base);
        AgentResponse r = client.run(AgentRequest.of(
                "Create a user named John Doe with email " + email));

        assertTrue(r.success(), "agent should succeed: " + r.message());
        assertFalse(r.refused(), "a valid request should not be refused");
        assertNotNull(r.data().get("userId"), "agent must return the created userId");
        assertEquals(String.valueOf(r.data().get("email")), email,
                "email must match the request (no hallucination)");

        new AgentConsolePage(getPage()).open(base);

        // Scope to the user row and assert EXACTLY one match: proves the user was
        // created and listed, and is immune to other tests' accumulated rows.
        Locator row = getPage().getByTestId("user-row")
                .filter(new Locator.FilterOptions().setHasText(email));
        assertThat(row).hasCount(1);
    }
}
