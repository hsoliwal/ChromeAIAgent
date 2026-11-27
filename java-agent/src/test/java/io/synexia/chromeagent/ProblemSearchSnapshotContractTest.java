// SPDX-License-Identifier: Apache-2.0
package io.synexia.chromeagent;

import java.net.URI;
import java.util.AbstractCollection;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Admission follows the copied snapshot even when a caller collection grows during copying. */
final class ProblemSearchSnapshotContractTest {
    private ProblemSearchSnapshotContractTest() { }

    static int verify() {
        List<ProblemReference> corpus = corpus();
        int checks = concurrentGrowth(corpus);
        for (ProblemSearchIndex.Backend backend : ProblemSearchIndex.Backend.values()) {
            checks += refused(() -> new ProblemSearchIndex(
                    new Transition(List.of(), corpus), backend), "empty input grew beyond capacity");
            checks += refused(() -> new ProblemSearchIndex(
                    new Transition(corpus.subList(0, 4096), corpus), backend), "full input grew beyond capacity");
            AbstractCollection<ProblemReference> oversized = new AbstractCollection<>() {
                @Override public int size() { return 4097; }
                @Override public Iterator<ProblemReference> iterator() {
                    throw new AssertionError("oversized input was iterated");
                }
                @Override public Object[] toArray() {
                    throw new AssertionError("oversized input was copied before admission");
                }
            };
            checks += refused(() -> new ProblemSearchIndex(oversized, backend), "pre-allocation capacity");
        }
        checks += admitted(new Transition(List.of(), corpus.subList(0, 1)), 1, corpus.get(0));
        checks += admitted(new Transition(corpus.subList(0, 4095), corpus.subList(0, 4096)),
                4096, corpus.get(4095));
        checks += admitted(new Transition(corpus.subList(0, 4096), corpus.subList(0, 4096)),
                4096, corpus.get(4095));
        return checks;
    }

    private static List<ProblemReference> corpus() {
        List<ProblemReference> records = new ArrayList<>(4097);
        for (int i = 0; i < 4097; i++) {
            String id = "entry-" + i;
            records.add(new ProblemReference(ProblemReference.Source.LEETCODE, id, "graph",
                    "Needle Shared", List.of("shared"), URI.create("https://leetcode.com/problems/" + id + "/")));
        }
        return List.copyOf(records);
    }

    private static int admitted(Transition input, int count, ProblemReference added) {
        ProblemSearchIndex index = new ProblemSearchIndex(input);
        require(index.records().size() == count, "copied snapshot record count");
        require(index.records().contains(added), "new record missing from snapshot");
        require(index.search("needle shared", null, null, 100).size() == Math.min(count, 100),
                "valid boundary snapshot cannot form valid postings");
        require(input.copies == 1, "caller collection must be copied exactly once");
        return 4;
    }

    private static int concurrentGrowth(List<ProblemReference> corpus) {
        CopyOnWriteArrayList<ProblemReference> records = new CopyOnWriteArrayList<>(corpus.subList(0, 4096));
        CountDownLatch snapshotStarted = new CountDownLatch(1);
        CountDownLatch insertionFinished = new CountDownLatch(1);
        AtomicReference<Throwable> workerFailure = new AtomicReference<>();
        AbstractCollection<ProblemReference> input = new AbstractCollection<>() {
            @Override public int size() { return records.size(); }
            @Override public Iterator<ProblemReference> iterator() { return records.iterator(); }
            @Override public Object[] toArray() {
                snapshotStarted.countDown();
                await(insertionFinished);
                return records.toArray();
            }
        };
        Thread mutator = new Thread(() -> {
            try {
                await(snapshotStarted);
                records.add(corpus.get(4096));
            } catch (Throwable failure) {
                workerFailure.set(failure);
            } finally {
                insertionFinished.countDown();
            }
        }, "catalogue-snapshot-test");
        mutator.setDaemon(true);
        mutator.start();
        try {
            return refused(() -> new ProblemSearchIndex(input), "concurrent snapshot admitted 4097 records");
        } finally {
            snapshotStarted.countDown();
            join(mutator);
            if (workerFailure.get() != null) throw new AssertionError("mutator failed", workerFailure.get());
        }
    }

    private static int refused(Runnable action, String message) {
        try { action.run(); }
        catch (IllegalArgumentException expected) {
            require("catalogue capacity exceeded".equals(expected.getMessage()), "incorrect admission failure");
            return 1;
        }
        throw new AssertionError(message);
    }

    private static void await(CountDownLatch latch) {
        try { require(latch.await(10, TimeUnit.SECONDS), "snapshot rendezvous timed out"); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("snapshot rendezvous interrupted", interrupted);
        }
    }

    private static void join(Thread thread) {
        try { thread.join(10_000); }
        catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new AssertionError("mutator join interrupted", interrupted);
        }
        if (thread.isAlive()) {
            thread.interrupt();
            throw new AssertionError("mutator did not terminate");
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static final class Transition extends AbstractCollection<ProblemReference> {
        private List<ProblemReference> current;
        private final List<ProblemReference> next;
        private int copies;
        private Transition(List<ProblemReference> current, List<ProblemReference> next) {
            this.current = current;
            this.next = next;
        }
        @Override public int size() { return current.size(); }
        @Override public Iterator<ProblemReference> iterator() { return current.iterator(); }
        @Override public Object[] toArray() {
            copies++;
            current = next;
            return current.toArray();
        }
    }
}
