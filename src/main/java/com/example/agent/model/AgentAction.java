package com.example.agent.model;

import java.util.Map;

/** One tool/action the agent took while fulfilling a goal (its execution trace). */
public record AgentAction(String tool, Map<String, Object> args, String status) { }
