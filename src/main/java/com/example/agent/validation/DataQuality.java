package com.example.agent.validation;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * DataQuality - the source-to-target / reconciliation / no-duplicates / no-missing
 * checks from data-migration QA, applied to the records an AI AGENT produces
 * (the data dimension of "AI as the system under test").
 */
public final class DataQuality {

    private DataQuality() { }

    public static List<String> missingRequiredFields(Map<String, Object> record, List<String> required) {
        List<String> missing = new ArrayList<>();
        for (String f : required) {
            Object v = (record == null) ? null : record.get(f);
            if (v == null || String.valueOf(v).isBlank()) missing.add(f);
        }
        return missing;
    }

    public static List<Object> duplicateKeys(List<Map<String, Object>> records, String key) {
        Set<Object> seen = new HashSet<>();
        List<Object> dupes = new ArrayList<>();
        for (Map<String, Object> r : records) {
            Object v = r.get(key);
            if (!seen.add(v)) dupes.add(v);
        }
        return dupes;
    }

    /** Target must contain every source key with an equal value. */
    public static List<String> reconcile(Map<String, Object> source, Map<String, Object> target) {
        List<String> diffs = new ArrayList<>();
        for (Map.Entry<String, Object> e : source.entrySet()) {
            Object t = target.get(e.getKey());
            if (t == null) { diffs.add("missing in target: " + e.getKey()); continue; }
            if (!String.valueOf(e.getValue()).equals(String.valueOf(t))) {
                diffs.add("mismatch " + e.getKey() + ": source=" + e.getValue() + " target=" + t);
            }
        }
        return diffs;
    }
}
