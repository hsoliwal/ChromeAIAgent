/* SPDX-License-Identifier: MIT */
// Playwright + Chromium MV3 real scripting API smoke; test-only host permission.
// This does not make the regular ChromeAIAgent extension WebMCP-enabled.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const adapter = resolve(here, '../src/webmcp/page-tool-adapter.js');
const validator = resolve(here, '../src/webmcp/tool-schema.js');
const polyfill = join(dirname(fileURLToPath(import.meta.resolve('@w3c/webmcp-polyfill'))), 'polyfill.js');
let context;
let extensionPage;
let server;
let extensionRoot;
let origin;

before(async () => {
  extensionRoot = await mkdtemp(join(tmpdir(), 'webmcp-mv3-'));
  await Promise.all([
    copyFile(adapter, join(extensionRoot, 'page-tool-adapter.js')),
    copyFile(validator, join(extensionRoot, 'tool-schema.js'))
  ]);
  await writeFile(join(extensionRoot, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'WebMCP isolation test', version: '0.0.1',
    permissions: ['tabs', 'scripting'], host_permissions: ['http://127.0.0.1/*'],
    background: { service_worker: 'background.js' }
  }));
  await writeFile(join(extensionRoot, 'background.js'), `
    importScripts('tool-schema.js', 'page-tool-adapter.js');
    const enabled = new WebMcpPageToolAdapter(chrome, async () => true);
    const denied = new WebMcpPageToolAdapter(chrome); // default deny
    chrome.runtime.onMessage.addListener((request, sender, respond) => {
      if (request?.type !== 'webmcp-test') return false;
      (async () => {
        const all = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
        const tab = all.find(t => t.url?.includes('case=' + request.caseId));
        if (!tab) throw new Error('test_tab_unavailable');
        if (request.action === 'discover') return enabled.discover({
          tabId: tab.id, expectedOrigin: request.origin });
        if (request.action === 'deny') return denied.discover({
          tabId: tab.id, expectedOrigin: request.origin });
        if (request.action === 'execute') return enabled.execute({
          tabId: tab.id, expectedOrigin: request.origin, ...request.tool });
        throw new Error('unsupported_test_action');
      })().then(result => respond({ ok: true, result }),
                error => respond({ ok: false, error: error.message }));
      return true;
    });
  `);
  await writeFile(join(extensionRoot, 'harness.html'), '<!doctype html><title>MV3 test harness</title>');
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><meta charset="utf-8"><title>MV3 tool page</title><p>Fixture</p>');
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  origin = `http://127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext(join(extensionRoot, 'profile'), {
    headless: true,
    args: [
      `--disable-extensions-except=${extensionRoot}`,
      `--load-extension=${extensionRoot}`,
      '--disable-features=WebMCP'
    ]
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).hostname;
  assert.match(id, /^[a-p]{32}$/);
  extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${id}/harness.html`);
});

after(async () => {
  await context?.close();
  await new Promise(done => server?.close(done) ?? done());
  if (extensionRoot) await rm(extensionRoot, { recursive: true, force: true });
});

async function fixturePage(caseId) {
  const page = await context.newPage();
  await page.goto(`${origin}/?case=${caseId}`);
  assert.equal(await page.evaluate(() => globalThis.isSecureContext), true);
  await page.addScriptTag({ path: polyfill });
  await page.evaluate(async () => {
    await document.modelContext.registerTool({
      name: 'fixture.read', description: 'Read current test page title',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object', required: ['title'],
        properties: { title: { type: 'string' } }, additionalProperties: false },
      execute() { return { title: document.title }; }
    });
  });
  return page;
}

async function request(caseId, action, tool) {
  return extensionPage.evaluate(({ caseId, action, origin, tool }) => new Promise(resolveResult => {
    chrome.runtime.sendMessage({ type: 'webmcp-test', caseId, action, origin, tool }, answer => {
      if (chrome.runtime.lastError) resolveResult({ ok: false, error: chrome.runtime.lastError.message });
      else resolveResult(answer);
    });
  }), { caseId, action, origin, tool });
}

test('actual MV3 MAIN-world discovery and document-pinned execution', async () => {
  const page = await fixturePage('read-1');
  try {
    const discovered = await request('read-1', 'discover');
    assert.equal(discovered.ok, true, JSON.stringify(discovered));
    const tool = discovered.result.find(value => value.name === 'fixture.read');
    assert.ok(tool?.documentId);
    const executed = await request('read-1', 'execute', {
      name: tool.name, signature: tool.signature, documentId: tool.documentId, input: {} });
    assert.equal(executed.ok, true, JSON.stringify(executed));
    assert.deepEqual(JSON.parse(executed.result), { title: 'MV3 tool page' });
  } finally { await page.close(); }
});

test('actual MV3 default-deny guard prevents even discovery', async () => {
  const page = await fixturePage('denied-2');
  try {
    const result = await request('denied-2', 'deny');
    assert.equal(result.ok, false);
    assert.match(result.error, /extension_permission_denied/);
  } finally { await page.close(); }
});

test('actual MV3 document ID rejects same-origin navigation', async () => {
  const page = await fixturePage('nav-3');
  try {
    const discovered = await request('nav-3', 'discover');
    assert.equal(discovered.ok, true, JSON.stringify(discovered));
    const tool = discovered.result.find(value => value.name === 'fixture.read');
    assert.ok(tool?.documentId);
    await page.goto(`${origin}/new-document?case=nav-3`);
    const result = await request('nav-3', 'execute', {
      name: tool.name, signature: tool.signature, documentId: tool.documentId, input: {} });
    assert.equal(result.ok, false);
    assert.match(result.error, /document_not_found|No document with id|No matching document/);
  } finally { await page.close(); }
});
