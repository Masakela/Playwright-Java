package com.example.agent.eval;

import java.util.List;
import java.util.Map;

/**
 * One golden evaluation case. For an AI agent we assert PROPERTIES of the output,
 * never exact text (output is non-deterministic):
 *   shouldRefuse       - a guardrail case: the agent must decline
 *   mustContain        - semantic: the message must mention these terms
 *   requiredDataFields - the agent's data payload must include these, non-blank
 *   expectedData       - specific structured values that must match exactly
 */
public record EvalCase(
        String id,
        String goal,
        boolean shouldRefuse,
        List<String> mustContain,
        List<String> requiredDataFields,
        Map<String, Object> expectedData) {
}
