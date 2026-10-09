package com.example.utils;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import com.example.agent.eval.EvalCase;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.type.CollectionType;

/**
 * JsonDataReader - loads JSON eval / guardrail datasets into EvalCase lists.
 * "Keep test data separate from test logic" (cheatsheet #5; SDET doc data layer).
 */
public final class JsonDataReader {

    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    private JsonDataReader() { }

    public static List<EvalCase> readEvalCases(String path) {
        try {
            CollectionType type = MAPPER.getTypeFactory()
                    .constructCollectionType(List.class, EvalCase.class);
            return MAPPER.readValue(Files.readString(Path.of(path)), type);
        } catch (Exception e) {
            throw new RuntimeException("Failed to read eval cases: " + path, e);
        }
    }
}
