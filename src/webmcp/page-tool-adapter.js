/* SPDX-License-Identifier: MIT */
'use strict';

// This is an opt-in extension-side consumer, not an MCP server or an LLM provider.
// No extension capabilities or credentials are exported into page MAIN world.
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_RESULT_BYTES = 256 * 1024;
const MAX_TOOL_METADATA = 16 * 1024;
const MAX_TOOLS = 64;
const schemaValidation = typeof module !== 'undefined' && module.exports
  ? require('./tool-schema.js') : globalThis.WebMcpSchema;

function secureOrigin(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

// Must be self-contained: chrome.scripting.executeScript serializes this function
// into the untrusted page MAIN world, without closures or extension privileges.
async function pageDiscover(expectedOrigin) {
  if (!globalThis.isSecureContext || location.origin !== expectedOrigin) {
    return { ok: false, error: 'origin_or_context_denied' };
  }
  const context = document.modelContext;
  if (!context || typeof context.getTools !== 'function') {
    return { ok: false, error: 'webmcp_unavailable' };
  }
  try {
    const tools = await context.getTools({ fromOrigins: [] });
    if (!Array.isArray(tools) || tools.length > 64) {
      return { ok: false, error: 'tool_limit_exceeded' };
    }
    const result = [];
    for (const tool of tools) {
      if (!tool || tool.origin !== expectedOrigin) continue;
      if (typeof tool.name !== 'string' || !/^[\w.-]{1,128}$/.test(tool.name) ||
          typeof tool.description !== 'string') return { ok: false, error: 'invalid_tool' };
      // Tool identity stays in the page; signature is a change detector, not an ID.
      const signature = JSON.stringify({ name: tool.name, origin: tool.origin,
        description: tool.description, inputSchema: tool.inputSchema ?? null,
        outputSchema: tool.outputSchema ?? null });
      if (signature.length > 16384) return { ok: false, error: 'metadata_limit_exceeded' };
      result.push({ name: tool.name, origin: tool.origin,
        description: tool.description.slice(0, 4096), signature,
        readOnlyHint: tool.annotations?.readOnlyHint === true });
    }
    if (new Set(result.map(tool => tool.name)).size !== result.length) {
      return { ok: false, error: 'ambiguous_tool_name' };
    }
    return { ok: true, tools: result };
  } catch {
    return { ok: false, error: 'discovery_failed' };
  }
}

// A fresh descriptor is discovered and executed in ONE page script invocation.
// No name-only descriptor is transmitted across realms or cached in the worker.
async function pageExecute(expectedOrigin, name, signature, inputJson, timeoutMs) {
  if (!globalThis.isSecureContext || location.origin !== expectedOrigin) {
    return { ok: false, error: 'origin_or_context_denied' };
  }
  const context = document.modelContext;
  if (!context || typeof context.getTools !== 'function' ||
      typeof context.executeTool !== 'function') {
    return { ok: false, error: 'webmcp_unavailable' };
  }
  try {
    const tools = await context.getTools({ fromOrigins: [] });
    if (!Array.isArray(tools) || tools.length > 64) {
      return { ok: false, error: 'tool_limit_exceeded' };
    }
    const matches = tools.filter(tool => tool && tool.origin === expectedOrigin && tool.name === name);
    if (matches.length !== 1) return { ok: false, error: 'tool_not_unique' };
    const tool = matches[0];
    const current = JSON.stringify({ name: tool.name, origin: tool.origin,
      description: tool.description, inputSchema: tool.inputSchema ?? null,
      outputSchema: tool.outputSchema ?? null });
    if (current !== signature) return { ok: false, error: 'tool_metadata_changed' };
    const input = JSON.parse(inputJson);
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'invalid_arguments' };
    }
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const outputJson = await context.executeTool(tool, input, { signal: controller.signal });
      if (controller.signal.aborted) return { ok: false, error: 'deadline_exceeded' };
      if (typeof outputJson !== 'string') return { ok: false, error: 'incompatible_result_version' };
      if (new TextEncoder().encode(outputJson).length > 262144) {
        return { ok: false, error: 'result_limit_exceeded' };
      }
      // Caller must treat output as untrusted data, not instructions or authorization.
      return { ok: true, outputJson };
    } catch {
      return { ok: false, error: controller.signal.aborted ? 'deadline_exceeded' : 'tool_failed' };
    } finally {
      clearTimeout(deadline);
    }
  } catch {
    return { ok: false, error: 'execution_failed' };
  }
}

class WebMcpPageToolAdapter {
  constructor(chromeApi, authorize) {
    if (!chromeApi?.tabs?.get || !chromeApi?.scripting?.executeScript) {
      throw new TypeError('Chrome tab and scripting APIs required');
    }
    this.chrome = chromeApi;
    // Deny by default: authorization is extension-owned, never page-owned.
    this.authorize = typeof authorize === 'function' ? authorize : () => false;
  }

  async checkTab(tabId, expectedOrigin) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || !expectedOrigin ||
        secureOrigin(expectedOrigin) !== expectedOrigin) throw new Error('invalid_target');
    const tab = await this.chrome.tabs.get(tabId);
    if (secureOrigin(tab?.url) !== expectedOrigin) throw new Error('tab_origin_changed');
  }

  async runScript(tabId, func, args, expectedOrigin, expectedDocumentId = null) {
    const target = { tabId, allFrames: false };
    if (expectedDocumentId !== null) target.documentIds = [expectedDocumentId];
    const responses = await this.chrome.scripting.executeScript({
      target, world: 'MAIN', func, args
    });
    // Check navigation after injection and never return data from a replaced tab.
    await this.checkTab(tabId, expectedOrigin);
    if (!Array.isArray(responses) || responses.length !== 1 ||
        !responses[0] || responses[0].frameId !== 0 ||
        typeof responses[0].documentId !== 'string' ||
        responses[0].documentId.length < 1 || responses[0].documentId.length > 128 ||
        (expectedDocumentId !== null && responses[0].documentId !== expectedDocumentId) ||
        typeof responses[0].result !== 'object') {
      throw new Error('invalid_injection_result');
    }
    const result = responses[0].result;
    if (!result.ok) throw new Error(result.error || 'page_error');
    return { ...result, documentId: responses[0].documentId };
  }

  async discover({ tabId, expectedOrigin }) {
    await this.checkTab(tabId, expectedOrigin);
    if ((await this.authorize({ kind: 'discover', tabId, origin: expectedOrigin })) !== true) {
      throw new Error('extension_permission_denied');
    }
    const result = await this.runScript(tabId, pageDiscover, [expectedOrigin], expectedOrigin);
    if (!Array.isArray(result.tools) || result.tools.length > MAX_TOOLS) {
      throw new Error('invalid_discovery_result');
    }
    return result.tools.map(tool => ({ ...tool, documentId: result.documentId }));
  }

  async execute({ tabId, expectedOrigin, name, signature, documentId, input = {}, timeoutMs = 5000 }) {
    if (typeof documentId !== 'string' || documentId.length < 1 || documentId.length > 128 ||
        typeof name !== 'string' || !/^[\w.-]{1,128}$/.test(name) ||
        typeof signature !== 'string' || signature.length > MAX_TOOL_METADATA ||
        !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
      throw new Error('invalid_call');
    }
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('invalid_arguments');
    }
    const inputJson = JSON.stringify(input);
    if (typeof inputJson !== 'string' || BufferOrTextBytes(inputJson) > MAX_INPUT_BYTES) {
      throw new Error('input_limit_exceeded');
    }
    const descriptor = JSON.parse(signature);
    if (descriptor.name !== name || descriptor.origin !== expectedOrigin ||
        !descriptor.inputSchema || !schemaValidation) throw new Error('unsupported_tool_schema');
    schemaValidation.validateSchemaValue(JSON.parse(inputJson), descriptor.inputSchema);
    await this.checkTab(tabId, expectedOrigin);
    if ((await this.authorize({ kind: 'execute', tabId, origin: expectedOrigin, name,
      signature, inputJson })) !== true) {
      throw new Error('extension_permission_denied');
    }
    const result = await this.runScript(tabId, pageExecute,
      [expectedOrigin, name, signature, inputJson, timeoutMs], expectedOrigin, documentId);
    if (typeof result.outputJson !== 'string' ||
        BufferOrTextBytes(result.outputJson) > MAX_RESULT_BYTES) {
      throw new Error('invalid_result');
    }
    if (descriptor.outputSchema) {
      let output;
      try { output = JSON.parse(result.outputJson); }
      catch { throw new Error('invalid_json_output'); }
      schemaValidation.validateSchemaValue(output, descriptor.outputSchema);
    }
    return result.outputJson;
  }
}

function BufferOrTextBytes(value) { return new TextEncoder().encode(value).length; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebMcpPageToolAdapter, pageDiscover, pageExecute, secureOrigin };
} else {
  globalThis.WebMcpPageToolAdapter = WebMcpPageToolAdapter;
}
