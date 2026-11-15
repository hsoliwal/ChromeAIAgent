package io.synexia.chromeagent;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.Set;
import java.util.TreeMap;

/** Iterative Kahn scheduler with stable lexicographic ordering and fail-closed validation. */
public final class PlanOrder {
    private static final int MAX_STEPS = 4096;
    private static final int MAX_EDGES = 65536;

    private PlanOrder() { }

    public static List<AgentStep> order(List<AgentStep> proposed) {
        Objects.requireNonNull(proposed, "proposed");
        if (proposed.size() > MAX_STEPS) {
            throw new IllegalArgumentException("too many steps");
        }
        Map<String, AgentStep> byId = new TreeMap<>();
        for (AgentStep step : proposed) {
            Objects.requireNonNull(step, "step");
            if (byId.putIfAbsent(step.id(), step) != null) {
                throw new IllegalArgumentException("duplicate step id: " + step.id());
            }
        }
        Map<String, Integer> degree = new HashMap<>();
        Map<String, List<String>> following = new HashMap<>();
        for (String id : byId.keySet()) {
            degree.put(id, 0);
            following.put(id, new ArrayList<>());
        }
        int edges = 0;
        for (AgentStep step : byId.values()) {
            Set<String> unique = new HashSet<>();
            for (String dependency : step.dependencies()) {
                if (!byId.containsKey(dependency) || step.id().equals(dependency)
                        || !unique.add(dependency)) {
                    throw new IllegalArgumentException("invalid dependency: " + dependency);
                }
                if (++edges > MAX_EDGES) {
                    throw new IllegalArgumentException("too many edges");
                }
                following.get(dependency).add(step.id());
                degree.put(step.id(), degree.get(step.id()) + 1);
            }
        }
        PriorityQueue<String> ready = new PriorityQueue<>();
        for (Map.Entry<String, Integer> entry : degree.entrySet()) {
            if (entry.getValue() == 0) {
                ready.add(entry.getKey());
            }
        }
        List<AgentStep> result = new ArrayList<>(byId.size());
        while (!ready.isEmpty()) {
            String id = ready.remove();
            result.add(byId.get(id));
            for (String next : following.get(id)) {
                int remaining = degree.merge(next, -1, Integer::sum);
                if (remaining == 0) {
                    ready.add(next);
                }
            }
        }
        if (result.size() != byId.size()) {
            throw new IllegalArgumentException("cyclic plan");
        }
        return List.copyOf(result);
    }
}
