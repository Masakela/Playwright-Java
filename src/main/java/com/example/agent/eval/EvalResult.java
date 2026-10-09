package com.example.agent.eval;

import java.util.List;

public record EvalResult(String id, boolean passed, List<String> failures) { }
