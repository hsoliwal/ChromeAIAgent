/* SPDX-License-Identifier: MIT */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { setTimeout: delay } = require('node:timers/promises');
const { WebMcpPageToolAdapter } = require('../src/webmcp/page-tool-adapter.js');

const origin = 'https://example.org';
const signature = JSON.stringify({ name: 'read', origin, description: 'Read',
  inputSchema: { type: 'object' }, outputSchema: null });
const call = { tabId: 3, expectedOrigin: origin, name: 'read', signature,
  documentId: 'doc-1', input: {} };
const epochNow = () => performance.timeOrigin + performance.now();

// Chrome is the external boundary. The real serialized page function executes
// in its own realm, including its real timers, Promise races and AbortSignal.
function fixture({ discoveryDelay = 0, injectionDelay = 0,
    authorize = () => true, description = 'Read' } = {}) {
  const state = { injected: 0, discovered: 0, executed: 0 };
  const page = vm.createContext({ performance, setTimeout, clearTimeout,
    AbortController, TextEncoder, delay, state, discoveryDelay, description,
    isSecureContext: true, location: { origin } });
  vm.runInContext(`
    document = { modelContext: {
      async getTools() {
        state.discovered++;
        if (discoveryDelay) await delay(discoveryDelay);
        return [{ name: 'read', origin: location.origin, description,
          inputSchema: { type: 'object' }, window: globalThis }];
      },
      async executeTool() { state.executed++; return '{"ok":true}'; }
    } };
  `, page);
  const chrome = {
    tabs: { get: async () => ({ url: origin + '/app' }) },
    scripting: { executeScript: async ({ func, args, target }) => {
      state.injected++;
      assert.equal(target.tabId, 3);
      if (injectionDelay) await delay(injectionDelay);
      page.arguments_ = args;
      return [{ frameId: 0, documentId: 'doc-1',
        result: await vm.runInContext('(' + func.toString() + ')(...arguments_)', page) }];
    } }
  };
  return { state, adapter: new WebMcpPageToolAdapter(chrome, authorize) };
}

test('rediscovery is inside the execution deadline and cannot start a late callback', async () => {
  const run = fixture({ discoveryDelay: 40 });
  await assert.rejects(run.adapter.execute({ ...call, timeoutMs: 10 }), /deadline_exceeded/);
  // Let the original page discovery settle; it must not continue to execute.
  await delay(60);
  assert.equal(run.state.injected, 1);
  assert.equal(run.state.discovered, 1, 'the delayed rediscovery was actually reached');
  assert.equal(run.state.executed, 0);
});

test('delayed script injection cannot restart the execution budget', async () => {
  const run = fixture({ injectionDelay: 40 });
  await assert.rejects(run.adapter.execute({ ...call, timeoutMs: 10 }), /deadline_exceeded/);
  await delay(60);
  assert.equal(run.state.injected, 1, 'Chrome had accepted the delayed injection');
  assert.equal(run.state.discovered, 0, 'expired script refuses before rediscovery');
  assert.equal(run.state.executed, 0);
});

test('an expired explicit consent deadline refuses before injection', async () => {
  const run = fixture();
  await assert.rejects(run.adapter.execute({ ...call, deadlineEpochMs: epochNow() - 1 }),
    /deadline_exceeded/);
  assert.equal(run.state.injected, 0);
  assert.equal(run.state.executed, 0);
});

test('authorization settling after the explicit deadline cannot inject', async () => {
  const run = fixture({ authorize: async () => { await delay(40); return true; } });
  await assert.rejects(run.adapter.execute({ ...call, deadlineEpochMs: epochNow() + 10 }),
    /deadline_exceeded/);
  await delay(60);
  assert.equal(run.state.injected, 0);
});

test('consent expiring between authorization and injection cannot inject', async t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const run = fixture({ authorize: () => {
    // Advance the clock after the authorization race settles, before the
    // adapter resumes from awaiting that race to request injection.
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => { now = 101; })));
    return true;
  } });
  await assert.rejects(run.adapter.execute({ ...call, deadlineEpochMs: epochNow() + 100 }),
    /deadline_exceeded/);
  assert.equal(run.state.injected, 0);
});

test('a shorter explicit consent deadline remains active during rediscovery', async () => {
  const run = fixture({ discoveryDelay: 40 });
  await assert.rejects(run.adapter.execute({ ...call, timeoutMs: 5000,
    deadlineEpochMs: epochNow() + 10 }), /deadline_exceeded/);
  await delay(60);
  assert.equal(run.state.executed, 0);
});

test('invalid explicit deadline cannot reach a page', async () => {
  for (const deadlineEpochMs of [NaN, Infinity, -1, '5000', null]) {
    const run = fixture();
    await assert.rejects(run.adapter.execute({ ...call, deadlineEpochMs }), /invalid_call/);
    assert.equal(run.state.injected, 0);
  }
});

test('ordinary calls and future explicit deadlines still execute exactly once', async () => {
  for (const extra of [{}, { deadlineEpochMs: epochNow() + 10000 }]) {
    const run = fixture();
    assert.equal(await run.adapter.execute({ ...call, ...extra }), '{"ok":true}');
    assert.equal(run.state.injected, 1);
    assert.equal(run.state.executed, 1);
  }
});

test('discovery refuses metadata exceeding 16 KiB in UTF-8', async () => {
  const run = fixture({ description: '\u4e00'.repeat(6000) });
  await assert.rejects(run.adapter.discover({ tabId: 3, expectedOrigin: origin }),
    /metadata_limit_exceeded/);
  assert.equal(run.state.executed, 0);
});

test('execution refuses oversized UTF-8 metadata before authorization or injection', async () => {
  const largeSignature = JSON.stringify({ name: 'read', origin,
    description: '\u4e00'.repeat(6000), inputSchema: { type: 'object' }, outputSchema: null });
  assert.ok(largeSignature.length < 16384);
  const run = fixture({ description: '\u4e00'.repeat(6000) });
  await assert.rejects(run.adapter.execute({ ...call, signature: largeSignature }), /invalid_call/);
  assert.equal(run.state.injected, 0);
});
