package com.example.agent;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertTrue;

import org.testng.annotations.Test;

import com.example.agent.model.AgentRequest;
import com.example.agent.model.AgentResponse;
import com.example.utils.Config;

/**
 * LIVE: run the SAME prompt N times and assert the invariant properties hold on
 * EVERY run. We never assert exact text equality - only that the agent keeps the
 * requested email and succeeds each time (no drift, no hallucination).
 */
public class AgentNonDeterminismTest extends AgentBaseTest {

    @Test(groups = "live", description = "Invariant properties hold across repeated runs of the same prompt")
    public void sameGoalHoldsInvariantsAcrossRuns() {
        requireAgentEndpoint();
        AgentApiClient client = new AgentApiClient(apiContext(), Config.agentBaseUrl());

        int runs = Config.repeatRuns();
        for (int i = 0; i < runs; i++) {
            AgentResponse r = client.run(AgentRequest.of(
                    "Create a user named John with email john@example.com"));
            assertTrue(r.success(), "run " + i + " should succeed");
            assertEquals(String.valueOf(r.data().get("email")), "john@example.com",
                    "run " + i + ": email must be exactly what was requested");
        }
    }
}
