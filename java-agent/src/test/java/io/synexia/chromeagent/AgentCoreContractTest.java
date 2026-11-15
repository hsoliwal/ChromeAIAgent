package io.synexia.chromeagent;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/** JDK-only assertions independent of Maven's test dependencies. */
public final class AgentCoreContractTest {
    private static int checks;

    private AgentCoreContractTest() { }

    private static void expect(boolean condition, String reason) {
        checks++;
        if (!condition) throw new AssertionError(reason);
    }

    @FunctionalInterface
    private interface CheckedAction { void run() throws Exception; }

    private static void refused(CheckedAction action, String reason) throws Exception {
        checks++;
        try { action.run(); }
        catch (IllegalArgumentException expected) { return; }
        throw new AssertionError(reason);
    }

    private static AgentStep step(String id, String operation, String... dependencies) {
        return new AgentStep(id, operation, Arrays.asList(dependencies), Map.of());
    }

    public static void main(String[] args) throws Exception {
        AgentStep a = step("a", "noop");
        AgentStep b = step("b", "noop", "a");
        AgentStep c = step("c", "noop", "a");
        AgentStep d = step("d", "noop", "b", "c");
        List<String> expected = List.of("a", "b", "c", "d");
        expect(PlanOrder.order(List.of(d, c, b, a)).stream().map(AgentStep::id).toList()
                .equals(expected), "topological precedence");
        List<AgentStep> inputs = new ArrayList<>(List.of(a, b, c, d));
        for (int i = 0; i < inputs.size(); i++) {
            for (int j = 0; j < inputs.size(); j++) {
                java.util.Collections.swap(inputs, i, j);
                expect(PlanOrder.order(inputs).stream().map(AgentStep::id).toList()
                        .equals(expected), "permutation invariant");
                java.util.Collections.swap(inputs, i, j);
            }
        }
        refused(() -> PlanOrder.order(List.of(a, a)), "duplicate id accepted");
        refused(() -> PlanOrder.order(List.of(step("a", "noop", "missing"))), "missing edge accepted");
        refused(() -> PlanOrder.order(List.of(step("a", "noop", "a"))), "self edge accepted");
        refused(() -> PlanOrder.order(List.of(step("a", "noop", "b"),
                step("b", "noop", "a"))), "cycle accepted");
        refused(() -> PlanOrder.order(List.of(step("a", "noop", "b", "b"), b)),
                "duplicate edge accepted");
        refused(() -> step("A", "noop"), "invalid uppercase id accepted");
        refused(() -> new AgentStep("a", "noop", List.of(), Map.of("bad key", "x")),
                "invalid arg name accepted");
        AtomicInteger invocations = new AtomicInteger();
        Map<String, PlanExecutor.AgentTool> tools = Map.of("noop", params -> {
            invocations.incrementAndGet();
            return "ok";
        });
        expect(PlanExecutor.run(List.of(d, c, b, a), tools).size() == 4, "valid plan execution");
        expect(invocations.get() == 4, "exact callback count");
        expect(PlanExecutor.run(List.of(a), tools).get(0).sha256().equals(
                "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df"),
                "sha256 receipt mismatch");
        int before = invocations.get();
        refused(() -> PlanExecutor.run(List.of(a, step("z", "not-approved", "a")), tools),
                "unapproved operation accepted");
        expect(invocations.get() == before, "partial execution occurred during failed preflight");
        refused(() -> PlanExecutor.run(List.of(a, step("z", "noop", "missing")), tools),
                "invalid plan was executed");
        expect(invocations.get() == before, "invalid dependency caused side effects");
        List<AgentStep> output = PlanOrder.order(List.of(a));
        try { output.add(a); throw new AssertionError("mutable plan result"); }
        catch (UnsupportedOperationException ok) { checks++; }
        System.out.println("AgentCoreContractTest PASS checks=" + checks);
    }
}
