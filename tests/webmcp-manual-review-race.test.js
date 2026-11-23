/* SPDX-License-Identifier: MIT */
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { WebMcpOneShotGrant } = require('../src/webmcp/one-shot-grant.js');
const WebMcpSchema = require('../src/webmcp/tool-schema.js');

const controller = readFileSync(join(__dirname, '../src/webmcp/manual-console.js'), 'utf8');
const ORIGIN = 'https://example.org';
const INPUT_SCHEMA = { type: 'object', required: ['value'],
  properties: { value: { type: 'string' } }, additionalProperties: false };

function fakeElement(value = '') {
  const listeners = new Map();
  return {
    value, disabled: false, textContent: '', options: [],
    addEventListener(event, callback) { listeners.set(event, callback); },
    fire(event) { return listeners.get(event)?.(); },
    replaceChildren(...children) {
      this.options = children;
      this.value = children[0]?.value ?? '';
    },
    add(option) { this.options.push(option); }
  };
}

function fixture() {
  const ids = [
    'target-tab', 'target-tool', 'input-json', 'approval-preview', 'status',
    'output', 'tool-description', 'discover-tools', 'review-once',
    'execute-once', 'list-tabs'
  ];
  const controls = Object.fromEntries(ids.map(id => [id, fakeElement()]));
  controls['input-json'].value = '{}';
  let resolveTab;
  let executeCalls = 0;
  const chrome = {
    tabs: {
      query: async () => [{ id: 7, url: ORIGIN + '/home', title: 'Example' }],
      get: () => new Promise(resolve => { resolveTab = resolve; })
    }
  };
  class FakeAdapter {
    constructor(_chrome, authorize) { this.authorize = authorize; }
    async discover({ tabId, expectedOrigin }) {
      assert.equal(this.authorize({ kind: 'discover', tabId, origin: expectedOrigin }), true);
      return [{
        name: 'fixture.read', description: 'Untrusted page-owned description',
        origin: ORIGIN, documentId: 'doc-1',
        signature: JSON.stringify({
          name: 'fixture.read', description: 'Untrusted page-owned description',
          origin: ORIGIN, inputSchema: INPUT_SCHEMA
        })
      }];
    }
    async execute({ tabId, expectedOrigin, name, signature, documentId, input }) {
      executeCalls++;
      const authorized = this.authorize({
        kind: 'execute', tabId, origin: expectedOrigin, name, signature,
        documentId, inputJson: JSON.stringify(input)
      });
      if (!authorized) throw Error('extension_permission_denied');
      return JSON.stringify({ echo: input.value });
    }
  }
  const document = { getElementById: id => {
    assert.ok(controls[id], 'unexpected UI control ' + id);
    return controls[id];
  } };
  function Option(text, value) { this.text = text; this.value = value; }
  runInNewContext(controller, {
    document, chrome, Option, URL, TextEncoder, WebMcpOneShotGrant,
    WebMcpPageToolAdapter: FakeAdapter, WebMcpSchema, console, performance
  }, { filename: 'manual-console.js' });
  return { controls, chrome, resolveTab: value => resolveTab(value),
    count: () => executeCalls };
}

async function reviewReady(fixt) {
  const c = fixt.controls;
  await c['list-tabs'].fire('click');
  c['target-tab'].value = '7';
  c['target-tab'].fire('change');
  await c['discover-tools'].fire('click');
  c['target-tool'].value = '0';
  c['target-tool'].fire('change');
  c['input-json'].value = '{"value":"reviewed"}';
  c['input-json'].fire('input');
  c['review-once'].fire('click');
  assert.equal(c['execute-once'].disabled, false);
  assert.equal(fixt.count(), 0, 'review must not execute');
}

test('approval invalidated during async tab check never dispatches a stale operation', async () => {
  const fixt = fixture();
  const c = fixt.controls;
  await reviewReady(fixt);
  const pending = c['execute-once'].fire('click');
  assert.equal(c['input-json'].disabled, true, 'editing disabled during execution');
  // Programmatic change while the trusted extension awaits chrome.tabs.get.
  c['input-json'].value = '{"value":"changed"}';
  c['input-json'].fire('input');
  fixt.resolveTab({ id: 7, url: ORIGIN + '/home' });
  await pending;
  assert.equal(fixt.count(), 0);
  assert.match(c.status.textContent, /review_invalidated/);
  assert.equal(c['execute-once'].disabled, true);
});

test('single unchanged manual approval authorizes precisely one execution', async () => {
  const fixt = fixture();
  const c = fixt.controls;
  await reviewReady(fixt);
  const pending = c['execute-once'].fire('click');
  fixt.resolveTab({ id: 7, url: ORIGIN + '/home' });
  await pending;
  assert.equal(fixt.count(), 1);
  assert.deepEqual(JSON.parse(c.output.textContent), { echo: 'reviewed' });
  assert.equal(c['execute-once'].disabled, true);
  assert.match(c.status.textContent, /one-time tool operation returned/);
});
