/* SPDX-License-Identifier: MIT */
'use strict';

// Runs only in an extension-owned page. Never imported into page MAIN world.
(() => {
  const byId = id => document.getElementById(id);
  const tabsSelect = byId('target-tab');
  const toolSelect = byId('target-tool');
  const jsonInput = byId('input-json');
  const preview = byId('approval-preview');
  const status = byId('status');
  const output = byId('output');
  const description = byId('tool-description');
  const discoverButton = byId('discover-tools');
  const reviewButton = byId('review-once');
  const executeButton = byId('execute-once');
  const permission = new WebMcpOneShotGrant();
  const adapter = new WebMcpPageToolAdapter(chrome, request => permission.authorize(request));
  let candidates = new Map();
  let tools = [];
  let current = null;
  let prepared = null;
  let busy = false;
  let reviewEpoch = 0;

  function announce(message) { status.textContent = message; }
  function clearOptions(select, message) {
    select.replaceChildren(new Option(message, ''));
  }
  function forget() {
    reviewEpoch++;
    permission.revoke();
    tools = [];
    current = null;
    prepared = null;
    clearOptions(toolSelect, 'Discover tools first');
    description.textContent = '';
    preview.textContent = 'No operation reviewed.';
    output.textContent = '';
    reviewButton.disabled = true;
    executeButton.disabled = true;
  }
  function invalidateReview() {
    reviewEpoch++;
    permission.revoke();
    prepared = null;
    preview.textContent = 'Arguments changed; review again before execution.';
    executeButton.disabled = true;
  }
  function setBusy(value) {
    busy = value;
    byId('list-tabs').disabled = value;
    tabsSelect.disabled = value;
    discoverButton.disabled = value || !current;
    toolSelect.disabled = value;
    jsonInput.disabled = value;
    reviewButton.disabled = value || tools.length === 0;
    executeButton.disabled = value || !prepared;
  }
  function tabOrigin(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' ||
          (parsed.protocol === 'http:' &&
            ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname))) {
        return parsed.origin;
      }
    } catch { /* invalid/privileged URL: omit */ }
    return null;
  }
  async function listTabs() {
    forget();
    current = null;
    setBusy(true);
    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      candidates = new Map(tabs.filter(t => Number.isInteger(t.id) && tabOrigin(t.url))
        .map(t => [String(t.id), { tabId: t.id, origin: tabOrigin(t.url),
          title: t.title || '(untitled)', url: t.url }]));
      clearOptions(tabsSelect, 'Select a tab');
      for (const [key, tab] of candidates) {
        const opt = new Option(tab.origin + ' — ' + tab.title, key);
        tabsSelect.add(opt);
      }
      announce('Choose a tab, then explicitly request discovery.');
    } catch (error) {
      announce('Cannot enumerate tabs: ' + error.message);
    } finally { setBusy(false); }
  }
  function chooseTab() {
    forget();
    current = candidates.get(tabsSelect.value) || null;
    discoverButton.disabled = busy || !current;
    announce(current ? 'Selected ' + current.origin + '; discovery requires a separate click.'
      : 'Select a target tab.');
  }
  async function discover() {
    if (busy || !current) return;
    const target = current;
    forget();
    current = target; // Reset stale tool state, but retain the user-selected tab.
    setBusy(true);
    try {
      permission.armDiscover({ tabId: target.tabId, origin: target.origin });
      tools = await adapter.discover({ tabId: target.tabId, expectedOrigin: target.origin });
      clearOptions(toolSelect, tools.length ? 'Choose a page tool' : 'No accessible tools');
      tools.forEach((tool, index) => toolSelect.add(new Option(tool.name, String(index))));
      announce('Discovered ' + tools.length + ' tools. Names, schemas and hints are untrusted.');
    } catch (error) {
      announce('Discovery denied or failed: ' + error.message);
    } finally {
      permission.revoke();
      setBusy(false);
    }
  }
  function chooseTool() {
    invalidateReview();
    const index = Number(toolSelect.value);
    const tool = toolSelect.value === '' ? null : tools[index];
    if (!tool) {
      description.textContent = '';
      reviewButton.disabled = true;
      return;
    }
    description.textContent = 'Name: ' + tool.name + '\nOrigin: ' + tool.origin +
      '\nDescription from page: ' + tool.description +
      '\nRead-only hint from page (NOT permission): ' + String(tool.readOnlyHint) +
      '\nDocument ID: ' + tool.documentId;
    reviewButton.disabled = busy;
  }
  function review() {
    if (busy || !current) return;
    const tool = tools[Number(toolSelect.value)];
    if (!tool || toolSelect.value === '') return;
    invalidateReview();
    try {
      const input = JSON.parse(jsonInput.value);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Arguments must be a JSON object.');
      }
      const inputJson = JSON.stringify(input);
      if (new TextEncoder().encode(inputJson).length > 64 * 1024) {
        throw new Error('Arguments exceed the 64 KiB limit.');
      }
      // Refuse unsupported schemas before even displaying the approval button.
      const metadata = JSON.parse(tool.signature);
      if (!metadata.inputSchema) throw new Error('This tool has no supported input schema.');
      WebMcpSchema.validateSchemaValue(input, metadata.inputSchema);
      if (metadata.outputSchema) {
        WebMcpSchema.validateSchemaDefinition(metadata.outputSchema);
      }
      // The executor repeats these checks just before the authorized execution.
      prepared = { tabId: current.tabId, origin: current.origin,
        documentId: tool.documentId, name: tool.name, signature: tool.signature,
        inputJson, input, reviewEpoch, rawInput: jsonInput.value,
        toolChoice: toolSelect.value };
      const reviewJson = inputJson.replace(/\p{Bidi_Control}/gu,
        char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'));
      preview.textContent = 'Target: ' + current.origin + '\nTool: ' + tool.name +
        '\nExact arguments:\n' + reviewJson +
        '\n\nThis page operation may have side effects. Execution is not reversible.' +
        '\nClick Approve and execute once to grant precisely one call.';
      executeButton.disabled = false;
      announce('Reviewed. No tool has executed yet.');
    } catch (error) {
      announce('Cannot review arguments: ' + error.message);
    }
  }
  async function executeOnce() {
    if (busy || !prepared || !current) return;
    const action = prepared;
    prepared = null;
    executeButton.disabled = true;
    setBusy(true);
    try {
      const deadlineEpochMs = performance.timeOrigin + performance.now() + permission.ttlMs;
      permission.armExecute(action);
      // The approval can expire or be revoked while the tab lookup is pending.
      const tab = await chrome.tabs.get(action.tabId);
      // An asynchronous tab query must not turn an invalidated review into
      // permission. This guards even programmatic changes to the trusted UI.
      if (reviewEpoch !== action.reviewEpoch ||
          jsonInput.value !== action.rawInput ||
          toolSelect.value !== action.toolChoice) {
        throw new Error('review_invalidated');
      }
      if (tabOrigin(tab.url) !== action.origin ||
          current?.tabId !== action.tabId) throw new Error('Target tab changed.');
      const result = await adapter.execute({
        tabId: action.tabId, expectedOrigin: action.origin,
        documentId: action.documentId, name: action.name,
        signature: action.signature, input: action.input, timeoutMs: 5000, deadlineEpochMs
      });
      output.textContent = result;
      announce('The one-time tool operation returned data. Result is untrusted.');
    } catch (error) {
      output.textContent = '';
      announce('Operation denied/failed: ' + error.message +
        '. It may have had side effects; no automatic retry will occur.');
    } finally {
      permission.revoke();
      preview.textContent = 'Authorization consumed. Review again for any further call.';
      setBusy(false);
      executeButton.disabled = true;
    }
  }
  byId('list-tabs').addEventListener('click', listTabs);
  tabsSelect.addEventListener('change', chooseTab);
  discoverButton.addEventListener('click', discover);
  toolSelect.addEventListener('change', chooseTool);
  jsonInput.addEventListener('input', invalidateReview);
  reviewButton.addEventListener('click', review);
  executeButton.addEventListener('click', executeOnce);
})();
