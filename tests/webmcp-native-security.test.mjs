/* SPDX-License-Identifier: MIT */
// Browser-native WebMCP security: no polyfill, no extension or cloud agent.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

let browser, first, second, originA, originB;
async function start(server) {
  await new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  return 'http://127.0.0.1:' + server.address().port;
}
function fixtureServer() {
  return createServer((req, response) => {
    if (new URL(req.url, 'http://127.0.0.1').pathname === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><meta charset="utf-8"><title>Native WebMCP proof</title>' +
      '<body data-phase="idle">WebMCP tool fixture</body>');
  });
}
before(async () => {
  first = fixtureServer();
  second = fixtureServer();
  [originA, originB] = await Promise.all([start(first), start(second)]);
  assert.notEqual(originA, originB);
  browser = await chromium.launch({ headless: false, args: [
    '--enable-features=WebMCP,WebMCPTesting', '--enable-blink-features=WebMCP'
  ] });
  assert.ok(Number(browser.version().split('.')[0]) >= 146);
  console.log('native-WebMCP security matrix Chromium:', browser.version());
});
after(async () => {
  await browser?.close();
  await Promise.all([first, second].map(server =>
    new Promise(done => server?.close(done) ?? done())));
});
async function rootPage() {
  const page = await browser.newPage();
  await page.goto(originA);
  assert.equal(await page.evaluate(() => globalThis.isSecureContext &&
    typeof document.modelContext?.registerTool === 'function' &&
    typeof document.modelContext?.getTools === 'function' &&
    typeof document.modelContext?.executeTool === 'function'), true,
  'native WebMCP must be present without installing the polyfill');
  return page;
}
async function frameIn(page, delegated, name) {
  const url = originB + '/frame?case=' + encodeURIComponent(name);
  const navigation = page.waitForEvent('framenavigated', { timeout: 10000,
    predicate: frame => frame !== page.mainFrame() && frame.url() === url });
  await page.evaluate(({ url, delegated }) => {
    const iframe = document.createElement('iframe');
    iframe.id = 'delegated-frame';
    if (delegated) iframe.setAttribute('allow', 'tools');
    iframe.src = url;
    document.body.appendChild(iframe);
  }, { url, delegated });
  return navigation;
}

test('default cross-origin iframe policy refuses tool registration', async () => {
  const page = await rootPage();
  try {
    const child = await frameIn(page, false, 'denied');
    const name = await child.evaluate(async () => {
      try {
        await document.modelContext.registerTool({
          name: 'policy.denied', description: 'Must be denied by default',
          execute() { return { failed: true }; }
        });
        return 'unexpected-success';
      } catch (error) {
        return error.name;
      }
    });
    assert.equal(name, 'NotAllowedError');
    assert.equal((await page.webmcp.tools()).some(tool => tool.name === 'policy.denied'), false);
  } finally { await page.close(); }
});

test('cross-origin discovery filters tools and permits execution of the exposed tool', async () => {
  const page = await rootPage();
  try {
    const child = await frameIn(page, true, 'exposure');
    await child.evaluate(async parentOrigin => {
      const ctx = document.modelContext;
      await ctx.registerTool({
        name: 'policy.private', description: 'Not exposed across origins',
        execute() { return { private: true }; }
      });
      await ctx.registerTool({
        name: 'policy.public', description: 'Explicitly exposed read',
        inputSchema: { type: 'object', additionalProperties: false },
        execute() { return { owner: 'child', allowed: true }; }
      }, { exposedTo: [parentOrigin] });
    }, originA);
    const result = await page.evaluate(async childOrigin => {
      const ctx = document.modelContext;
      const defaultNames = (await ctx.getTools()).map(tool => tool.name);
      const explicit = await ctx.getTools({ fromOrigins: [childOrigin] });
      const publicTool = explicit.find(tool => tool.name === 'policy.public');
      return {
        defaultNames,
        explicitNames: explicit.map(tool => tool.name),
        ownerIsChild: publicTool?.window ===
          document.querySelector('iframe').contentWindow,
        origin: publicTool?.origin,
        output: publicTool ? await ctx.executeTool(publicTool, {}) : null
      };
    }, originB);
    assert.equal(result.defaultNames.includes('policy.public'), false);
    assert.equal(result.explicitNames.includes('policy.private'), false);
    assert.equal(result.explicitNames.includes('policy.public'), true);
    assert.equal(result.ownerIsChild, true);
    assert.equal(result.origin, originB);
    assert.deepEqual(JSON.parse(result.output), { owner: 'child', allowed: true });
  } finally { await page.close(); }
});

test('registration AbortSignal revokes a discoverable native tool', async () => {
  const page = await rootPage();
  try {
    const result = await page.evaluate(async () => {
      const ctx = document.modelContext;
      const lifetime = new AbortController();
      await ctx.registerTool({
        name: 'policy.temporary', description: 'Lifetime-scoped tool',
        execute() { return { alive: true }; }
      }, { signal: lifetime.signal });
      const before = (await ctx.getTools()).some(tool => tool.name === 'policy.temporary');
      lifetime.abort();
      const end = performance.now() + 3000;
      let removed = false;
      while (performance.now() < end) {
        removed = !(await ctx.getTools()).some(tool => tool.name === 'policy.temporary');
        if (removed) break;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      return { before, removed };
    });
    assert.deepEqual(result, { before: true, removed: true });
  } finally { await page.close(); }
});

test('execution cancellation rejects caller and aborts owning callback', async () => {
  const page = await rootPage();
  try {
    const result = await page.evaluate(async () => {
      const ctx = document.modelContext;
      const started = Promise.withResolvers();
      const ownerAbort = Promise.withResolvers();
      async function waitFor(promise, message, timeoutMs = 3000) {
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error(message)), timeoutMs);
        });
        try {
          return await Promise.race([promise, timeout]);
        } finally {
          clearTimeout(timer);
        }
      }
      await ctx.registerTool({
        name: 'policy.pending', description: 'Pending cancellable tool',
        execute(_input, { signal }) {
          signal.addEventListener('abort', () => {
            ownerAbort.resolve({ aborted: signal.aborted, reason: signal.reason?.name });
          }, { once: true });
          started.resolve();
          return new Promise(() => {});
        }
      });
      const tool = (await ctx.getTools()).find(item => item.name === 'policy.pending');
      const control = new AbortController();
      const pending = ctx.executeTool(tool, {}, { signal: control.signal })
        .then(() => 'unexpected-success', error => error.name);
      await waitFor(started.promise, 'tool callback did not start');
      control.abort();
      // Caller rejection and owner signal delivery use separate task queues.
      // Preserve the owner's strict two-second bound and clear both timers.
      const [rejection, owner] = await Promise.all([
        waitFor(pending, 'caller did not reject on cancellation'),
        waitFor(ownerAbort.promise, 'owner abort event was not delivered', 2000)
      ]);
      return { rejection, ownerAborted: owner.aborted, ownerReason: owner.reason };
    });
    assert.deepEqual(result, { rejection: 'AbortError', ownerAborted: true,
      ownerReason: 'AbortError' });
  } finally { await page.close(); }
});

test('navigating a delegated caller aborts pending tool in its owning frame', async () => {
  const page = await rootPage();
  try {
    const child = await frameIn(page, true, 'navigation');
    await page.evaluate(async childOrigin => {
      await document.modelContext.registerTool({
        name: 'policy.navigation', description: 'Owned by stable top document',
        execute(_args, { signal }) {
          document.body.dataset.phase = 'started';
          return new Promise(done => signal.addEventListener('abort', () => {
            document.body.dataset.phase = 'aborted';
            document.body.dataset.abortReason = signal.reason?.name ?? '';
            done({ cancelled: true });
          }, { once: true }));
        }
      }, { exposedTo: [childOrigin] });
    }, originB);
    await child.evaluate(async ownerOrigin => {
      const matches = await document.modelContext.getTools({ fromOrigins: [ownerOrigin] });
      const tool = matches.find(item => item.name === 'policy.navigation');
      if (!tool) throw Error('explicitly exposed tool not visible to delegated caller');
      void document.modelContext.executeTool(tool, {}).catch(() => {});
    }, originA);
    await page.waitForFunction(() => document.body.dataset.phase === 'started',
      null, { timeout: 5000 });
    await child.goto(originB + '/new-page');
    await page.waitForFunction(() => document.body.dataset.phase === 'aborted',
      null, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => ({
      phase: document.body.dataset.phase, reason: document.body.dataset.abortReason
    })), { phase: 'aborted', reason: 'AbortError' });
  } finally { await page.close(); }
});
