package com.example.agent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.example.agent.model.AgentAction;
import com.example.agent.model.AgentRequest;
import com.example.agent.model.AgentResponse;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.microsoft.playwright.APIRequestContext;
import com.microsoft.playwright.APIResponse;
import com.microsoft.playwright.options.RequestOptions;

/**
 * AgentApiClient - thin API client for the agent service (SDET doc: api/clients +
 * request builders; cheatsheet #8: API + UI testing via APIRequestContext).
 *
 * Contract assumed: POST {baseUrl}/api/agent/run  { goal, context } -> AgentResponse JSON.
 */
public class AgentApiClient {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private final APIRequestContext request;
    private final String baseUrl;

    public AgentApiClient(APIRequestContext request, String baseUrl) {
        this.request = request;
        this.baseUrl = baseUrl.replaceAll("/+$", "");
    }

    public AgentResponse run(AgentRequest req) {
        Map<String, Object> body = new HashMap<>();
        body.put("goal", req.goal());
        body.put("context", req.context());

        APIResponse res = request.post(baseUrl + "/api/agent/run",
                RequestOptions.create()
                        .setHeader("content-type", "application/json")
                        .setData(body));

        if (!res.ok()) {
            throw new RuntimeException("Agent run failed: HTTP " + res.status() + " " + res.text());
        }
        return parse(res.text());
    }

    /** Parse an agent JSON payload into an AgentResponse (also used to validate mocked bodies). */
    public static AgentResponse parse(String json) {
        try {
            JsonNode n = MAPPER.readTree(json);
            List<AgentAction> actions = new ArrayList<>();
            if (n.has("actions") && n.get("actions").isArray()) {
                for (JsonNode a : n.get("actions")) {
                    actions.add(new AgentAction(
                            a.path("tool").asText(""),
                            toMap(a.get("args")),
                            a.path("status").asText("")));
                }
            }
            return new AgentResponse(
                    n.path("runId").asText(""),
                    n.path("success").asBoolean(false),
                    n.path("refused").asBoolean(false),
                    n.path("message").asText(""),
                    actions,
                    toMap(n.get("data")));
        } catch (Exception e) {
            throw new RuntimeException("Could not parse agent response: " + json, e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> toMap(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull() || !n.isObject()) {
            return Map.of();
        }
        return MAPPER.convertValue(n, Map.class);
    }
}
