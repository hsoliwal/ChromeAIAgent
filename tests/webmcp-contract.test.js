/* SPDX-License-Identifier: MIT */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { WebMcpPageToolAdapter, secureOrigin } = require('../src/webmcp/page-tool-adapter.js');

function fixture({ authorize = () => true, tools, execute, origin = 'https://example.org' } = {}) {
  let tabUrl = origin + '/app';
  let documentId = 'doc-1';
  const state = { called: 0, executed: 0 };
  const saved = { location: global.location, document: global.document,
    isSecureContext: global.isSecureContext };
  const chrome = {
    tabs: { get: async () => ({ url: tabUrl }) },
    scripting: { executeScript: async ({ world, target, func, args }) => {
      assert.equal(world, 'MAIN');
      assert.equal(target.allFrames, false);
      if (target.documentIds && !target.documentIds.includes(documentId)) {
        throw new Error('document_not_found');
      }
      state.called++;
      global.location = { origin };
      global.isSecureContext = true;
      global.document = { modelContext: {
        getTools: async () => tools ?? [{ name: 'title', origin,
          description: 'Read the title', inputSchema: { type: 'object' },
          annotations: { readOnlyHint: true } }],
        executeTool: async (...arguments_) => { state.executed++; return execute
          ? execute(...arguments_) : JSON.stringify({ title: 'Hello' }); }
      } };
      try { return [{ result: await func(...args), frameId: 0, documentId }]; }
      finally { global.location = saved.location; global.document = saved.document;
        global.isSecureContext = saved.isSecureContext; }
    } }
  };
  return { adapter: new WebMcpPageToolAdapter(chrome, authorize), state,
    navigate: url => { tabUrl = url; documentId = 'doc-2'; } };
}

test('secure origin is exact and restricted to HTTPS or local loopback', () => {
  assert.equal(secureOrigin('https://example.org/path'), 'https://example.org');
  assert.equal(secureOrigin('http://localhost:8888/a'), 'http://localhost:8888');
  assert.equal(secureOrigin('http://evil.invalid/a'), null);
  assert.equal(secureOrigin('chrome://settings'), null);
});

test('default-deny and mismatched target never inject', async () => {
  const denied = fixture({ authorize: () => false });
  await assert.rejects(denied.adapter.discover({ tabId: 1,
    expectedOrigin: 'https://example.org' }), /extension_permission_denied/);
  assert.equal(denied.state.called, 0);
  const switched = fixture();
  switched.navigate('https://other.example.org');
  await assert.rejects(switched.adapter.discover({ tabId: 1,
    expectedOrigin: 'https://example.org' }), /tab_origin_changed/);
  assert.equal(switched.state.called, 0);
});

test('discovery and execution use exact metadata and same-origin tool', async () => {
  const run = fixture();
  const [tool] = await run.adapter.discover({ tabId: 4, expectedOrigin: 'https://example.org' });
  assert.equal(tool.name, 'title');
  assert.equal(tool.readOnlyHint, true); // hint alone is NOT permission
  const output = await run.adapter.execute({ tabId: 4, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId, input: {} });
  assert.deepEqual(JSON.parse(output), { title: 'Hello' });
  assert.equal(run.state.executed, 1);
});

test('cross-origin tools and ambiguous names fail closed', async () => {
  const cross = fixture({ tools: [{ name: 'external', description: 'No',
    origin: 'https://outside.invalid' }] });
  const discovered = await cross.adapter.discover({ tabId: 5,
    expectedOrigin: 'https://example.org' });
  assert.deepEqual(discovered, []);
  const duplicated = fixture({ tools: Array(2).fill({ name: 'same', origin: 'https://example.org',
    description: 'Duplicate' }) });
  await assert.rejects(duplicated.adapter.discover({ tabId: 5,
    expectedOrigin: 'https://example.org' }), /ambiguous_tool_name/);
});

test('metadata change blocks invocation before callback', async () => {
  const run = fixture();
  const [tool] = await run.adapter.discover({ tabId: 3, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 3, expectedOrigin: 'https://example.org',
    name: 'title', documentId: tool.documentId, signature: tool.signature.replace('Read the title', 'Changed'), input: {} }),
    /tool_metadata_changed/);
  assert.equal(run.state.executed, 0);
});

test('per-call extension authorization cannot be supplied by the page', async () => {
  const run = fixture({ authorize: ({ kind }) => kind === 'discover' });
  const [tool] = await run.adapter.discover({ tabId: 3, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 3, expectedOrigin: 'https://example.org',
    name: 'title', signature: tool.signature, documentId: tool.documentId }), /extension_permission_denied/);
  assert.equal(run.state.executed, 0);
});

test('deadline abort reaches the callback and does not return late output', async () => {
  let observedSignal;
  const run = fixture({ execute: (_tool, _input, { signal }) => {
    observedSignal = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort',
      () => reject(new Error('aborted')), { once: true }));
  } });
  const [tool] = await run.adapter.discover({ tabId: 1, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 1, expectedOrigin: 'https://example.org',
    name: 'title', signature: tool.signature, documentId: tool.documentId, timeoutMs: 10 }), /deadline_exceeded/);
  assert.equal(observedSignal.aborted, true);
});

test('oversized input and malformed invocation refuse before injection', async () => {
  const run = fixture();
  await assert.rejects(run.adapter.execute({ tabId: 1,
    expectedOrigin: 'https://example.org', name: 'title', documentId: 'doc-1', signature: 'x',
    input: { content: 'A'.repeat(70000) } }), /input_limit_exceeded/);
  await assert.rejects(run.adapter.execute({ tabId: 1,
    expectedOrigin: 'https://example.org', name: 'title', documentId: 'doc-1', signature: 'x',
    input: [] }), /invalid_arguments/);
  assert.equal(run.state.called, 0);
});

test('JSON Schema subset enforces required and disallows unknown keywords', async () => {
  const inputSchema = { type: 'object', additionalProperties: false,
    required: ['query'], properties: { query: { type: 'string', minLength: 2, maxLength: 12 } } };
  const run = fixture({ tools: [{ name: 'search', origin: 'https://example.org', description: 'Search',
    inputSchema, outputSchema: { type: 'object', required: ['ok'],
      properties: { ok: { type: 'boolean' } }, additionalProperties: false } }],
    execute: () => JSON.stringify({ ok: true }) });
  const [tool] = await run.adapter.discover({ tabId: 1, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 1, expectedOrigin: 'https://example.org',
    name: 'search', signature: tool.signature, documentId: tool.documentId, input: {} }), /schema_required_missing/);
  await assert.rejects(run.adapter.execute({ tabId: 1, expectedOrigin: 'https://example.org',
    name: 'search', signature: tool.signature, documentId: tool.documentId, input: { query: 'ok', extra: true } }),
    /schema_extra_property/);
  const output = await run.adapter.execute({ tabId: 1, expectedOrigin: 'https://example.org',
    name: 'search', signature: tool.signature, documentId: tool.documentId, input: { query: 'good' } });
  assert.deepEqual(JSON.parse(output), { ok: true });
});

test('unsupported output schema is rejected before any page execution', async () => {
  const run = fixture({ tools: [{ name: 'status', origin: 'https://example.org', description: 'Status',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object',
      properties: { result: { anyOf: [{ type: 'string' }] } } } }],
    execute: () => JSON.stringify({ result: 'test' }) });
  const [tool] = await run.adapter.discover({ tabId: 1, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 1, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId }), /unsupported_schema_keyword/);
  assert.equal(run.state.executed, 0);
});

test('same-origin navigation invalidates the discovered document ID', async () => {
  const run = fixture();
  const [tool] = await run.adapter.discover({ tabId: 1,
    expectedOrigin: 'https://example.org' });
  run.navigate('https://example.org/new-document');
  await assert.rejects(run.adapter.execute({ tabId: 1,
    expectedOrigin: 'https://example.org', name: tool.name,
    documentId: tool.documentId, signature: tool.signature }), /document_not_found/);
  assert.equal(run.state.executed, 0);
});
