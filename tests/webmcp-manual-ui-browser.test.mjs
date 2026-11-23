/* SPDX-License-Identifier: MIT */
// Isolated real MV3 manual-approval console; normal extension manifest unchanged.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = resolve(here, '../src/webmcp');
const upstream = join(dirname(fileURLToPath(import.meta.resolve('@w3c/webmcp-polyfill'))),
  'polyfill.js');
let server, origin, context, extension, target, root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'webmcp-manual-ui-'));
  const dest = join(root, 'src', 'webmcp');
  await mkdir(dest, { recursive: true });
  await Promise.all([
    'tool-schema.js', 'page-tool-adapter.js', 'one-shot-grant.js',
    'manual-console.js', 'manual-console.html'
  ].map(name => copyFile(join(sourceDir, name), join(dest, name))));
  await writeFile(join(root, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'WebMCP manual approval isolated test',
    version: '0.0.1', permissions: ['tabs', 'scripting'],
    host_permissions: ['http://127.0.0.1/*'],
    background: { service_worker: 'background.js' }
  }));
  await writeFile(join(root, 'background.js'), '// No autonomous registration or execution.\n');
  server = createServer((request, response) => {
    if (new URL(request.url, 'http://127.0.0.1').pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8">' +
      '<title>Manual WebMCP target</title><body>Test target</body>');
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  context = await chromium.launchPersistentContext(join(root, 'profile'), {
    channel: 'chromium', headless: true,
    args: ['--disable-extensions-except=' + root, '--load-extension=' + root,
      '--disable-features=WebMCP']
  });
  const worker = context.serviceWorkers()[0] ||
    await context.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(worker.url()).hostname;
  assert.match(id, /^[a-p]{32}$/);
  target = await context.newPage();
  await target.goto(origin + '/target');
  await target.addScriptTag({ path: upstream });
  await target.evaluate(async () => {
    await document.modelContext.registerTool({
      name: 'fixture.read', description: 'Read a bounded value',
      inputSchema: { type: 'object', required: ['value'],
        properties: { value: { type: 'string' } }, additionalProperties: false },
      outputSchema: { type: 'object', required: ['echo'],
        properties: { echo: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute(input) {
        document.body.dataset.calls = String(Number(document.body.dataset.calls || '0') + 1);
        return { echo: input.value };
      }
    });
  });
  extension = await context.newPage();
  await extension.goto('chrome-extension://' + id + '/src/webmcp/manual-console.html');
});

after(async () => {
  await context?.close();
  await new Promise(done => server?.close(done) ?? done());
  if (root) await rm(root, { recursive: true, force: true });
});

test('manual discovery, review and one-use execution; navigation invalidates document', async () => {
  assert.match(await extension.locator('#status').textContent(), /No access requested/);
  assert.equal(await target.evaluate(() => document.body.dataset.calls), undefined);
  await extension.locator('#list-tabs').click();
  await extension.locator('#target-tab').selectOption({
    label: origin + ' — Manual WebMCP target'
  });
  await extension.locator('#discover-tools').click();
  await extension.waitForFunction(() =>
    document.getElementById('status')?.textContent?.includes('Discovered 1 tools'),
    null, { timeout: 15000 });
  await extension.locator('#target-tool').selectOption({ label: 'fixture.read' });
  await extension.locator('#input-json').fill('{"value":"user approved"}');
  await extension.locator('#review-once').click();
  assert.match(await extension.locator('#approval-preview').textContent(), /user approved/);
  assert.equal(await target.evaluate(() => document.body.dataset.calls), undefined,
    'review alone must not execute the tool');
  await extension.locator('#execute-once').click();
  await extension.waitForFunction(() =>
    document.getElementById('status')?.textContent?.includes('one-time tool operation returned'),
    null, { timeout: 15000 });
  assert.deepEqual(JSON.parse(await extension.locator('#output').textContent()),
    { echo: 'user approved' });
  assert.equal(await target.evaluate(() => document.body.dataset.calls), '1');
  assert.equal(await extension.locator('#execute-once').isDisabled(), true);
  await extension.locator('#review-once').click();
  await target.goto(origin + '/new-document');
  await extension.locator('#execute-once').click();
  await extension.waitForFunction(() =>
    document.getElementById('status')?.textContent?.includes('Operation denied/failed'),
    null, { timeout: 15000 });
  assert.equal(await extension.locator('#execute-once').isDisabled(), true);
  assert.match(await extension.locator('#status').textContent(), /no automatic retry/);
});
