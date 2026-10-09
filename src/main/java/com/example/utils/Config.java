package com.example.utils;

/**
 * Config - environment + run settings for the AI-agent tests (cheatsheet #7:
 * Multiple Environments - read from -D system properties or env vars, never
 * hard-coded). When no agent endpoint is set, LIVE tests skip.
 */
public final class Config {
    private Config() { }

    /** Base URL of the agent under test. -Dagent.base.url=... or AGENT_BASE_URL. */
    public static String agentBaseUrl() {
        return firstNonBlank(System.getProperty("agent.base.url"), System.getenv("AGENT_BASE_URL"));
    }

    public static boolean hasAgentEndpoint() {
        String u = agentBaseUrl();
        return u != null && !u.isBlank();
    }

    /** Minimum task-success rate the eval harness must meet (0..1). Default 0.8. */
    public static double evalThreshold() {
        String v = firstNonBlank(System.getProperty("eval.threshold"), System.getenv("EVAL_THRESHOLD"));
        return (v == null || v.isBlank()) ? 0.8 : Double.parseDouble(v);
    }

    /** How many times a non-determinism test repeats the same prompt. Default 3. */
    public static int repeatRuns() {
        String v = firstNonBlank(System.getProperty("agent.repeat"), System.getenv("AGENT_REPEAT"));
        return (v == null || v.isBlank()) ? 3 : Integer.parseInt(v);
    }

    private static String firstNonBlank(String a, String b) {
        if (a != null && !a.isBlank()) return a;
        return b;
    }
}
