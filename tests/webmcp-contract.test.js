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
        getTools: async () => (tools ?? [{ name: 'title', origin,
          description: 'Read the title', inputSchema: { type: 'object' },
          annotations: { readOnlyHint: true } }]).map(tool => ({ window: globalThis, ...tool })),
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

test('schema definition refuses keywords applied to the wrong JSON type', () => {
  const { validateSchemaDefinition } = require('../src/webmcp/tool-schema.js');
  for (const value of [
    { type: 'object', minimum: 2 },
    { type: 'boolean', minLength: 1 },
    { type: 'array', properties: { id: { type: 'string' } } },
    { type: 'string', minItems: 1 },
    { type: 'integer', additionalProperties: true },
    { type: 'object', required: ['x','x'] },
    { type: 'array', items: { type: 'string', pattern: '[a-z]' } },
    { type: 'string', minLength: 2, maxLength: 1 }
  ]) assert.throws(() => validateSchemaDefinition(value), /unsupported_schema/);
});

test('nested schema is fully checked before invoking a tool', async () => {
  const run = fixture({ tools: [{ name: 'nested', origin: 'https://example.org',
    description: 'Nested read', inputSchema: { type: 'object',
      properties: { value: { type: 'array', items: { type: 'object',
        properties: { answer: { type: 'string', pattern: '.*' } } } } } } }] });
  const [tool] = await run.adapter.discover({ tabId: 3, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 3, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId,
    input: { value: [] } }), /unsupported_schema_keyword/);
  assert.equal(run.state.executed, 0);
});

test('output validation rejects wrong-keyword constraints before any side effect', async () => {
  const run = fixture({ tools: [{ name: 'weird', origin: 'https://example.org',
    description: 'Weird', inputSchema: { type: 'object' },
    outputSchema: { type: 'object', minLength: 3 } }] });
  const [tool] = await run.adapter.discover({ tabId: 3, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 3, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId }),
  /unsupported_schema_keyword_type/);
  assert.equal(run.state.executed, 0);
});

test('hanging page callback returns a deadline failure even when abort is ignored', async () => {
  let signal;
  const run = fixture({ execute: (_tool, _arg, options) => {
    signal = options.signal;
    return new Promise(() => {});
  } });
  const [tool] = await run.adapter.discover({ tabId: 2, expectedOrigin: 'https://example.org' });
  const started = Date.now();
  await assert.rejects(run.adapter.execute({ tabId: 2, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId,
    timeoutMs: 15 }), /deadline_exceeded/);
  assert.equal(signal.aborted, true);
  assert.ok(Date.now() - started < 1000);
});

test('hanging Chrome script injection is independently bounded', async () => {
  const chrome = { tabs: { get: async () => ({ url: 'https://example.org/path' }) },
    scripting: { executeScript: () => new Promise(() => {}) } };
  const adapter = new WebMcpPageToolAdapter(chrome, () => true);
  await assert.rejects(adapter.runScript(2, () => 1, [],
    'https://example.org', null, 15), /injection_deadline_exceeded/);
});

test('output can be rejected after execution; the side effect is never claimed to roll back', async () => {
  const run = fixture({ tools: [{ name: 'bad-output', description: 'Bad output',
    origin: 'https://example.org', inputSchema: { type: 'object' },
    outputSchema: { type: 'object', additionalProperties: false } }],
    execute: () => JSON.stringify({ unexpected: 'data' }) });
  const [tool] = await run.adapter.discover({ tabId: 3, expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 3, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId }),
  /schema_extra_property/);
  assert.equal(run.state.executed, 1);
});

test('strict numeric and nested array constraints are enforced', () => {
  const { validateSchemaValue } = require('../src/webmcp/tool-schema.js');
  const schema = { type: 'object', required: ['ids'], additionalProperties: false,
    properties: { ids: { type: 'array', minItems: 1, maxItems: 3,
      items: { type: 'integer', minimum: 0, maximum: 42 } } } };
  assert.equal(validateSchemaValue({ ids: [0, 3, 42] }, schema), true);
  assert.throws(() => validateSchemaValue({ ids: [] }, schema), /schema_array_bounds/);
  assert.throws(() => validateSchemaValue({ ids: [44] }, schema), /schema_number_bounds/);
  assert.throws(() => validateSchemaValue({ ids: [3.3] }, schema), /schema_type_mismatch/);
});


test('invalid JSON output is rejected even without a declared output schema', async () => {
  const run = fixture({ execute: () => '{not valid json}' });
  const [tool] = await run.adapter.discover({ tabId: 4,
    expectedOrigin: 'https://example.org' });
  await assert.rejects(run.adapter.execute({ tabId: 4, expectedOrigin: 'https://example.org',
    name: tool.name, signature: tool.signature, documentId: tool.documentId }),
  /invalid_json_output/);
  assert.equal(run.state.executed, 1);
});

test('same-origin iframe-owned tools are excluded even though the origin matches', async () => {
  const foreignWindow = { unrelated: true };
  const run = fixture({ tools: [{ name: 'child', origin: 'https://example.org',
    description: 'Child frame', inputSchema: { type: 'object' }, window: foreignWindow }] });
  const list = await run.adapter.discover({ tabId: 2, expectedOrigin: 'https://example.org' });
  assert.deepEqual(list, []);
  // Even a forged metadata signature cannot execute a child-frame tool.
  const signature = JSON.stringify({ name: 'child', origin: 'https://example.org',
    description: 'Child frame', inputSchema: { type: 'object' }, outputSchema: null });
  await assert.rejects(run.adapter.execute({ tabId: 2, expectedOrigin: 'https://example.org',
    name: 'child', documentId: 'doc-1', signature, input: {} }), /tool_not_unique/);
  assert.equal(run.state.executed, 0);
});

test('native-style Tool.source is used before polyfill window fallback', async () => {
  const run = fixture({ tools: [{ name: 'native', origin: 'https://example.org',
    description: 'Native tool', inputSchema: { type: 'object' },
    window: { wrong: true }, source: globalThis }] });
  const tools = await run.adapter.discover({ tabId: 2, expectedOrigin: 'https://example.org' });
  assert.equal(tools.length, 1);
  assert.equal(tools[0].name, 'native');
});
