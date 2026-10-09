package com.example.agent.eval;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.example.agent.model.AgentResponse;

/**
 * Evaluator - scores an AgentResponse against an EvalCase on INVARIANT PROPERTIES
 * (refusal, semantic contains, required data fields, specific structured values).
 * Never exact-matches free text. Task-success rate across the golden set is the
 * metric the harness gates on - the regression signal when a model/prompt changes.
 */
public final class Evaluator {

    private Evaluator() { }

    public static EvalResult evaluate(EvalCase c, AgentResponse r) {
        List<String> failures = new ArrayList<>();

        if (c.shouldRefuse()) {
            if (!(r.refused() && !r.success())) {
                failures.add("expected refusal but agent proceeded (success=" + r.success() + ")");
            }
            return new EvalResult(c.id(), failures.isEmpty(), failures);
        }

        if (!r.success()) {
            failures.add("agent did not succeed: " + r.message());
        }

        String hay = (r.message() == null ? "" : r.message()).toLowerCase(Locale.ROOT);
        if (c.mustContain() != null) {
            for (String term : c.mustContain()) {
                if (!hay.contains(term.toLowerCase(Locale.ROOT))) {
                    failures.add("response missing expected term: " + term);
                }
            }
        }

        if (c.requiredDataFields() != null) {
            for (String f : c.requiredDataFields()) {
                Object v = (r.data() == null) ? null : r.data().get(f);
                if (v == null || String.valueOf(v).isBlank()) {
                    failures.add("missing required data field: " + f);
                }
            }
        }

        if (c.expectedData() != null) {
            for (Map.Entry<String, Object> e : c.expectedData().entrySet()) {
                Object actual = (r.data() == null) ? null : r.data().get(e.getKey());
                if (!String.valueOf(e.getValue()).equals(String.valueOf(actual))) {
                    failures.add("data[" + e.getKey() + "] expected " + e.getValue() + " but was " + actual);
                }
            }
        }

        return new EvalResult(c.id(), failures.isEmpty(), failures);
    }

    /** Task-success rate across a batch (0..1). */
    public static double successRate(List<EvalResult> results) {
        if (results.isEmpty()) return 0.0;
        long passed = results.stream().filter(EvalResult::passed).count();
        return (double) passed / results.size();
    }
}
