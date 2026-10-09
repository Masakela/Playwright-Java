package com.example.agent.model;

import java.util.Map;

/** A goal sent to the agent, plus optional context. */
public record AgentRequest(String goal, Map<String, Object> context) {
    public static AgentRequest of(String goal) {
        return new AgentRequest(goal, Map.of());
    }
}
