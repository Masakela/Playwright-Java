package com.example.agent.model;

import java.util.List;
import java.util.Map;

/**
 * Structured result of an agent run.
 *   success  - the agent completed the task
 *   refused  - the agent declined (guardrail / out-of-scope)
 *   message  - free-text summary (NON-deterministic - never assert exact equality)
 *   actions  - tool trace (for scope / integration checks)
 *   data     - the business payload produced (e.g. the created record)
 */
public record AgentResponse(
        String runId,
        boolean success,
        boolean refused,
        String message,
        List<AgentAction> actions,
        Map<String, Object> data) {
}
