/* SPDX-License-Identifier: MIT */
// Real Chromium + official pinned @w3c/webmcp-polyfill compatibility smoke.
// This does not qualify Chrome native WebMCP or an actual browser agent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const polyfill = join(dirname(fileURLToPath(import.meta.resolve('@w3c/webmcp-polyfill'))), 'polyfill.js');
const adapterPath = resolve(here, '../src/webmcp/page-tool-adapter.js');
let server;
let browser;
let origin;

before(async () => {
  server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>WebMCP browser fixture</title><p>Fixture</p>');
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ['--disable-features=WebMCP'] });
});

after(async () => {
  await browser?.close();
  await new Promise(resolveClose => server?.close(resolveClose) ?? resolveClose());
});

async function pageWithPolyfill() {
  const page = await browser.newPage();
  await page.goto(origin, { waitUntil: 'load' });
  const native = await page.evaluate(() => typeof document.modelContext?.registerTool === 'function');
  assert.equal(native, false, 'fixture must exercise the polyfill, not native WebMCP');
  assert.equal(await page.evaluate(() => globalThis.isSecureContext), true);
  await page.addScriptTag({ path: polyfill });
  assert.equal(await page.evaluate(() => typeof document.modelContext?.registerTool), 'function');
  return page;
}

test('official polyfill: register, discover, JSON result and unregister', async () => {
  const page = await pageWithPolyfill();
  try {
    const result = await page.evaluate(async () => {
      const ctx = document.modelContext;
      const lifetime = new AbortController();
      await ctx.registerTool({ name: 'fixture.echo', description: 'Echo a bounded value',
        inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
        execute(input) { return { echoed: input.value }; } }, { signal: lifetime.signal });
      const tools = await ctx.getTools();
      const found = tools.find(item => item.name === 'fixture.echo');
      if (!found) throw Error('tool not discoverable');
      const response = await ctx.executeTool(found, { value: 'ready' });
      lifetime.abort();
      const absent = !(await ctx.getTools()).some(item => item.name === 'fixture.echo');
      return { response, absent, origin: found.origin };
    });
    assert.deepEqual(JSON.parse(result.response), { echoed: 'ready' });
    assert.equal(result.absent, true);
    assert.equal(result.origin, origin);
  } finally { await page.close(); }
});

test('official polyfill: repeated install preserves the same context', async () => {
  const page = await pageWithPolyfill();
  try {
    const previous = await page.evaluateHandle(() => document.modelContext);
    await page.addScriptTag({ path: polyfill });
    assert.equal(await page.evaluate(old => document.modelContext === old, previous), true);
    await previous.dispose();
  } finally { await page.close(); }
});

test('official polyfill: execute cancellation propagates to owning callback', async () => {
  const page = await pageWithPolyfill();
  try {
    const result = await page.evaluate(async () => {
      const ctx = document.modelContext;
      let began;
      const started = new Promise(resolve => { began = resolve; });
      let callbackSignal;
      await ctx.registerTool({ name: 'fixture.pending', description: 'Pending callback',
        execute(_input, { signal }) { callbackSignal = signal; began(); return new Promise(() => {}); } });
      const tool = (await ctx.getTools()).find(item => item.name === 'fixture.pending');
      const caller = new AbortController();
      const execution = ctx.executeTool(tool, {}, { signal: caller.signal })
        .then(() => 'unexpected-success', () => 'cancelled');
      await started;
      caller.abort();
      const resultType = await execution;
      const callbackAborted = await Promise.race([
        new Promise(resolve => {
          if (callbackSignal.aborted) resolve(true);
          else callbackSignal.addEventListener('abort', () => resolve(true), { once: true });
        }),
        new Promise(resolve => setTimeout(() => resolve(false), 2000))
      ]);
      return { resultType, callbackAborted };
    });
    assert.deepEqual(result, { resultType: 'cancelled', callbackAborted: true });
  } finally { await page.close(); }
});

test('extension page functions interoperate with actual polyfill descriptors', async () => {
  const page = await pageWithPolyfill();
  try {
    await page.addScriptTag({ path: adapterPath });
    const result = await page.evaluate(async () => {
      const ctx = document.modelContext;
      await ctx.registerTool({ name: 'fixture.page_read', description: 'Read a page value',
        inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
        execute() { return { title: document.title }; } });
      const origin = location.origin;
      const discovered = await pageDiscover(origin);
      if (!discovered.ok) return discovered;
      const tool = discovered.tools.find(value => value.name === 'fixture.page_read');
      if (!tool) return { ok: false, error: 'fixture_tool_missing' };
      return await pageExecute(origin, tool.name, tool.signature, '{}', 2000);
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(JSON.parse(result.outputJson), { title: 'WebMCP browser fixture' });
  } finally { await page.close(); }
});
