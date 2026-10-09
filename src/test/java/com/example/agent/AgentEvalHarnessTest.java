package com.example.agent;

import static org.testng.Assert.assertTrue;

import java.util.ArrayList;
import java.util.List;

import org.testng.annotations.Test;

import com.example.agent.eval.EvalCase;
import com.example.agent.eval.EvalResult;
import com.example.agent.eval.Evaluator;
import com.example.agent.model.AgentRequest;
import com.example.agent.model.AgentResponse;
import com.example.utils.Config;
import com.example.utils.JsonDataReader;

/**
 * LIVE: run the golden eval set through the real agent and gate on task-success
 * rate (>= eval threshold). This is the regression signal when the model or prompt
 * changes - the AI-agent analog of a regression pack.
 */
public class AgentEvalHarnessTest extends AgentBaseTest {

    @Test(groups = "live", description = "Golden eval set meets the task-success threshold")
    public void goldenSetMeetsThreshold() {
        requireAgentEndpoint();
        AgentApiClient client = new AgentApiClient(apiContext(), Config.agentBaseUrl());

        List<EvalCase> cases = JsonDataReader.readEvalCases("src/test/resources/agent/eval-cases.json");
        List<EvalResult> results = new ArrayList<>();
        for (EvalCase c : cases) {
            AgentResponse r = client.run(AgentRequest.of(c.goal()));
            results.add(Evaluator.evaluate(c, r));
        }

        double rate = Evaluator.successRate(results);
        List<String> failed = results.stream()
                .filter(x -> !x.passed())
                .map(x -> x.id() + " " + x.failures())
                .toList();

        assertTrue(rate >= Config.evalThreshold(),
                "task-success rate " + rate + " < threshold " + Config.evalThreshold()
                        + "; failures: " + failed);
    }
}
