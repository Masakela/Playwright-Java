package com.example.agent;

import static org.testng.Assert.assertTrue;

import java.util.List;

import org.testng.annotations.Test;

import com.example.agent.eval.EvalCase;
import com.example.agent.eval.Evaluator;
import com.example.agent.model.AgentRequest;
import com.example.agent.model.AgentResponse;
import com.example.utils.Config;
import com.example.utils.JsonDataReader;

/**
 * LIVE: every out-of-scope / disallowed prompt in the guardrail set must be refused.
 */
public class AgentGuardrailLiveTest extends AgentBaseTest {

    @Test(groups = "live", description = "Agent refuses every out-of-scope request in the guardrail set")
    public void agentRefusesOutOfScope() {
        requireAgentEndpoint();
        AgentApiClient client = new AgentApiClient(apiContext(), Config.agentBaseUrl());

        List<EvalCase> cases = JsonDataReader.readEvalCases("src/test/resources/agent/guardrail-cases.json");
        for (EvalCase c : cases) {
            AgentResponse r = client.run(AgentRequest.of(c.goal()));
            assertTrue(Evaluator.evaluate(c, r).passed(),
                    "guardrail case '" + c.id() + "' should have been refused; message=" + r.message());
        }
    }
}
