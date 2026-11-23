/* SPDX-License-Identifier: MIT */
'use strict';
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { createContext, runInContext } = require('node:vm');

const scripts = ['tool-schema.js', 'page-tool-adapter.js', 'one-shot-grant.js',
  'manual-console.js'].map(name => [name,
  readFileSync(join(__dirname, '../src/webmcp', name), 'utf8')]);

class Element {
  constructor() {
    this.value = '';
    this.disabled = false;
    this.textContent = '';
    this.options = [];
    this.listeners = new Map();
  }

  addEventListener(type, callback) { this.listeners.set(type, callback); }
  emit(type) { return this.listeners.get(type)(); }
  replaceChildren(option) {
    this.options = [option];
    this.value = option.value;
  }
  add(option) { this.options.push(option); }
}

async function fixture() {
  const origin = 'https://example.org';
  const tab = { id: 7, url: origin + '/target', title: 'Target' };
  const elements = new Map(['target-tab', 'target-tool', 'input-json', 'approval-preview',
    'status', 'output', 'tool-description', 'list-tabs', 'discover-tools', 'review-once',
    'execute-once'].map(id => [id, new Element()]));
  const byId = id => elements.get(id);
  let time = 0;
  let injections = 0;
  let pendingLookup;
  const globals = { performance: { timeOrigin: Date.now(), now: () => time },
    URL, TextEncoder, AbortController, setTimeout, clearTimeout };
  const page = createContext({ ...globals, location: { origin }, isSecureContext: true });
  runInContext(`
    let calls = 0;
    const document = { modelContext: {
      getTools: async () => [{ name: 'fixture.echo', origin: location.origin,
        window: globalThis, description: 'Echo an input value',
        inputSchema: { type: 'object', required: ['value'],
          properties: { value: { type: 'string' } }, additionalProperties: false } }],
      executeTool: async (tool, input) => {
        calls++;
        return JSON.stringify(input);
      }
    } };
  `, page);
  const chrome = {
    tabs: {
      query: async () => [tab],
      get: async () => {
        const lookup = pendingLookup;
        pendingLookup = undefined;
        return lookup ?? tab;
      }
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        injections++;
        const injected = runInContext('(' + func.toString() + ')', page);
        return [{ frameId: 0, documentId: 'doc-1', result: await injected(...args) }];
      }
    }
  };
  const extension = createContext({ ...globals, chrome, document: { getElementById: byId },
    Option: class {
      constructor(text, value) { this.text = text; this.value = value; }
    } });
  for (const [filename, source] of scripts) runInContext(source, extension, { filename });
  await byId('list-tabs').emit('click');
  byId('target-tab').value = String(tab.id);
  byId('target-tab').emit('change');
  await byId('discover-tools').emit('click');
  assert.equal(byId('target-tool').options[1]?.text, 'fixture.echo');
  byId('target-tool').value = '0';
  byId('target-tool').emit('change');

  return {
    byId,
    clickApprove: () => byId('execute-once').emit('click'),
    review(input) {
      byId('input-json').value = JSON.stringify(input);
      byId('input-json').emit('input');
      byId('review-once').emit('click');
      assert.equal(byId('execute-once').disabled, false);
    },
    pauseNextTabLookup() {
      let resume;
      pendingLookup = new Promise(resolve => { resume = () => resolve(tab); });
      return resume;
    },
    advance: ms => { time += ms; },
    injections: () => injections,
    toolCalls: () => runInContext('calls', page)
  };
}

test('approval invokes the reviewed tool once with its reviewed arguments', async () => {
  const console = await fixture();
  const input = { value: 'approved' };
  console.review(input);
  assert.equal(console.injections(), 1, 'review does not add an injection after discovery');
  assert.equal(console.toolCalls(), 0);

  await console.clickApprove();
  assert.deepEqual(JSON.parse(console.byId('output').textContent), input);
  assert.equal(console.byId('execute-once').disabled, true);
  await console.clickApprove();
  assert.equal(console.injections(), 2);
  assert.equal(console.toolCalls(), 1);
});

test('approval expires during the first tab lookup without injecting an invocation', async () => {
  const console = await fixture();
  console.review({ value: 'approved' });
  const resumeLookup = console.pauseNextTabLookup();
  const completion = console.clickApprove();
  console.advance(8001);
  resumeLookup();
  await completion;

  assert.equal(console.injections(), 1, 'only discovery injected a script');
  assert.equal(console.toolCalls(), 0);
  assert.match(console.byId('status').textContent, /Operation denied\/failed/);
  assert.equal(console.byId('execute-once').disabled, true);
});

test('an argument edit during the first tab lookup revokes the pending approval', async () => {
  const console = await fixture();
  console.review({ value: 'approved' });
  const resumeLookup = console.pauseNextTabLookup();
  const completion = console.clickApprove();
  const input = console.byId('input-json');
  const disabledDuringLookup = input.disabled;
  input.value = '{"value":"changed"}';
  input.emit('input');
  resumeLookup();
  await completion;

  assert.equal(console.injections(), 1, 'only discovery injected a script');
  assert.equal(console.toolCalls(), 0);
  assert.equal(disabledDuringLookup, true);
  assert.equal(input.disabled, false);
  assert.equal(console.byId('execute-once').disabled, true);
});

test('review escapes bidi controls while preserving the reviewed and executed JSON value', async () => {
  const console = await fixture();
  const input = { value: 'a\u202eb\u202c' };
  console.review(input);
  const preview = console.byId('approval-preview').textContent;
  const displayedJson = preview.split('\nExact arguments:\n')[1].split('\n\n')[0];
  assert.doesNotMatch(displayedJson, /\p{Bidi_Control}/u);
  assert.deepEqual(JSON.parse(displayedJson), input);

  await console.clickApprove();
  assert.deepEqual(JSON.parse(console.byId('output').textContent), input);
  assert.equal(console.toolCalls(), 1);
});

test('raw input or tool selection changed without an event still invalidates review', async () => {
  for (const [id, value] of [['input-json', '{"value":"silently changed"}'],
    ['target-tool', '1']]) {
    const console = await fixture();
    console.review({ value: 'approved' });
    const resumeLookup = console.pauseNextTabLookup();
    const completion = console.clickApprove();
    console.byId(id).value = value;
    resumeLookup();
    await completion;
    assert.equal(console.injections(), 1, 'only discovery injected a script');
    assert.equal(console.toolCalls(), 0);
    assert.match(console.byId('status').textContent, /review_invalidated/);
  }
});
