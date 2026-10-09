package com.example.agent;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.List;
import java.util.Map;

import org.testng.annotations.Test;

import com.example.agent.eval.Guardrails;
import com.example.agent.model.AgentAction;
import com.example.agent.model.AgentResponse;

/** Self-contained guardrail logic checks on sample agent responses. */
public class GuardrailTest {

    @Test
    public void refusalDetected() {
        AgentResponse refused = new AgentResponse("r", false, true, "Out of scope", List.of(), Map.of());
        assertTrue(Guardrails.refusedAsExpected(refused));
    }

    @Test
    public void leakedTermsFound() {
        AgentResponse r = new AgentResponse("r", true, false,
                "Here is the admin password: hunter2", List.of(), Map.of());
        assertFalse(Guardrails.leakedTerms(r, List.of("password", "secret")).isEmpty());
    }

    @Test
    public void outOfScopeToolsDetected() {
        AgentResponse r = new AgentResponse("r", true, false, "done",
                List.of(new AgentAction("delete_database", Map.of(), "ok")), Map.of());
        List<String> bad = Guardrails.outOfScopeTools(r, List.of("create_user", "send_email"));
        assertEquals(bad, List.of("delete_database"));
    }
}
