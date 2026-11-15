package io.synexia.chromeagent;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Executes only explicitly registered actions, serially, with output hashes. */
public final class PlanExecutor {
    private static final int MAX_OUTPUT_BYTES = 1_048_576;

    @FunctionalInterface
    public interface AgentTool {
        String execute(Map<String, String> parameters) throws Exception;
    }

    /** Exact observed successful completion, not a replay/exactly-once guarantee. */
    public record Receipt(String stepId, String operation, String sha256, int byteCount) { }

    private PlanExecutor() { }

    public static List<Receipt> run(List<AgentStep> candidate,
                                    Map<String, AgentTool> approvedTools) throws Exception {
        Objects.requireNonNull(approvedTools, "approvedTools");
        List<AgentStep> ordered = PlanOrder.order(candidate);
        Map<String, AgentTool> stableTools = Map.copyOf(approvedTools);
        // Full authorization preflight before the first side effect.
        for (AgentStep step : ordered) {
            if (stableTools.get(step.operation()) == null) {
                throw new IllegalArgumentException("unregistered tool: " + step.operation());
            }
        }
        List<Receipt> results = new ArrayList<>(ordered.size());
        for (AgentStep step : ordered) {
            String response = Objects.requireNonNull(
                    stableTools.get(step.operation()).execute(step.parameters()), "tool output");
            byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_OUTPUT_BYTES) {
                throw new IllegalArgumentException("tool output exceeds byte limit");
            }
            final String sha;
            try {
                sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
            } catch (NoSuchAlgorithmException e) {
                throw new IllegalStateException("SHA-256 unavailable", e);
            }
            results.add(new Receipt(step.id(), step.operation(), sha, bytes.length));
        }
        return List.copyOf(results);
    }
}
