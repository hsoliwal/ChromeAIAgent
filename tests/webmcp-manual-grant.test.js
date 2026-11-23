/* SPDX-License-Identifier: MIT */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WebMcpOneShotGrant } = require('../src/webmcp/one-shot-grant.js');
const base = { tabId: 7, origin: 'https://example.org' };
const execution = { ...base, documentId: 'document-123', name: 'tool.read',
  signature: '{"name":"tool.read"}', inputJson: '{"query":"hello"}' };

test('default deny: no discovery or execution without a one-time authorization', () => {
  const gate = new WebMcpOneShotGrant();
  assert.equal(gate.authorize({ kind: 'discover', ...base }), false);
  assert.equal(gate.authorize({ kind: 'execute', ...execution }), false);
});

test('discovery is exact and can occur only once', () => {
  const gate = new WebMcpOneShotGrant();
  gate.armDiscover(base);
  assert.equal(gate.authorize({ kind: 'discover', ...base }), true);
  assert.equal(gate.authorize({ kind: 'discover', ...base }), false);
});

test('different origin, tab and kind each invalidate the ticket', () => {
  for (const different of [
    { kind: 'discover', tabId: 7, origin: 'https://other.example.org' },
    { kind: 'discover', tabId: 8, origin: base.origin },
    { kind: 'execute', ...execution }
  ]) {
    const gate = new WebMcpOneShotGrant();
    gate.armDiscover(base);
    assert.equal(gate.authorize(different), false);
    assert.equal(gate.authorize({ kind: 'discover', ...base }), false);
  }
});

test('execution is bound to exact origin, tab, document, name, schema signature and JSON', () => {
  const grant = new WebMcpOneShotGrant();
  grant.armExecute(execution);
  assert.equal(grant.authorize({ kind: 'execute', ...execution }), true);
  assert.equal(grant.authorize({ kind: 'execute', ...execution }), false);
  for (const changed of [
    { documentId: 'other-document' }, { origin: 'https://outside.example.org' },
    { name: 'tool.write' }, { signature: '{"name":"other"}' },
    { inputJson: '{"query":"different"}' }, { tabId: 17 }
  ]) {
    grant.armExecute(execution);
    assert.equal(grant.authorize({ kind: 'execute', ...execution, ...changed }), false);
  }
});

test('expired ticket is refused, and revocation prevents reuse', () => {
  let now = 1000;
  const grant = new WebMcpOneShotGrant({ now: () => now, ttlMs: 5000 });
  grant.armExecute(execution);
  now += 5001;
  assert.equal(grant.authorize({ kind: 'execute', ...execution }), false);
  grant.armExecute(execution);
  grant.revoke();
  assert.equal(grant.authorize({ kind: 'execute', ...execution }), false);
});

test('new authorization overwrites the previous one rather than stacking grants', () => {
  const grant = new WebMcpOneShotGrant();
  grant.armDiscover(base);
  grant.armExecute(execution);
  assert.equal(grant.authorize({ kind: 'discover', ...base }), false);
  assert.equal(grant.authorize({ kind: 'execute', ...execution }), false);
});

test('malformed or insecure requests are not authorizable', () => {
  const gate = new WebMcpOneShotGrant();
  for (const invalid of [
    { tabId: -1, origin: base.origin },
    { tabId: 7, origin: 'http://outside.example.org' },
    { tabId: 7, origin: 'https://example.org/path' }
  ]) assert.throws(() => gate.armDiscover(invalid), /invalid_grant_scope/);
  assert.throws(() => gate.armExecute({ ...execution, documentId: '' }), /invalid_grant_scope/);
  assert.throws(() => gate.armExecute({ ...execution, name: 'bad name' }), /invalid_grant_scope/);
  assert.throws(() => gate.armExecute({ ...execution, inputJson: 'x'.repeat(70000) }),
    /invalid_grant_scope/);
});
