package io.synexia.chromeagent;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;

/** Immutable candidate action. Construction does not authorize or execute an action. */
public record AgentStep(String id, String operation, List<String> dependencies,
                        Map<String, String> parameters) {
    public AgentStep {
        requireId(id);
        requireId(operation);
        Objects.requireNonNull(dependencies, "dependencies");
        Objects.requireNonNull(parameters, "parameters");
        if (dependencies.size() > 4096 || parameters.size() > 64) {
            throw new IllegalArgumentException("step capacity exceeded");
        }
        for (String dependency : dependencies) {
            requireId(dependency);
        }
        dependencies = List.copyOf(dependencies);
        Map<String, String> sorted = new TreeMap<>();
        parameters.forEach((key, value) -> {
            requireId(key);
            if (value == null || value.length() > 8192) {
                throw new IllegalArgumentException("invalid parameter value");
            }
            sorted.put(key, value);
        });
        parameters = Map.copyOf(sorted);
    }

    static void requireId(String id) {
        if (id == null || !id.matches("[a-z][a-z0-9-]{0,63}")) {
            throw new IllegalArgumentException("invalid identifier");
        }
    }
}
