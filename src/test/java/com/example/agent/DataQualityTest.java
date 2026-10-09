package com.example.agent;

import static org.testng.Assert.assertEquals;
import static org.testng.Assert.assertFalse;
import static org.testng.Assert.assertTrue;

import java.util.List;
import java.util.Map;

import org.testng.annotations.Test;

import com.example.agent.validation.DataQuality;

/** Self-contained data-quality checks on agent output records. */
public class DataQualityTest {

    @Test
    public void detectsMissingRequiredFields() {
        Map<String, Object> rec = Map.of("userId", "u1", "email", "");
        List<String> missing = DataQuality.missingRequiredFields(rec, List.of("userId", "email", "name"));
        assertTrue(missing.contains("email"));
        assertTrue(missing.contains("name"));
        assertFalse(missing.contains("userId"));
    }

    @Test
    public void detectsDuplicateKeys() {
        List<Map<String, Object>> records = List.of(
                Map.of("id", "1"),
                Map.of("id", "2"),
                Map.of("id", "1"));
        assertEquals(DataQuality.duplicateKeys(records, "id"), List.of("1"));
    }

    @Test
    public void reconcilesSourceToTarget() {
        Map<String, Object> source = Map.of("name", "John", "email", "john@example.com");
        Map<String, Object> target = Map.of("name", "John", "email", "wrong@example.com");
        List<String> diffs = DataQuality.reconcile(source, target);
        assertEquals(diffs.size(), 1);
        assertTrue(diffs.get(0).contains("email"));
    }
}
