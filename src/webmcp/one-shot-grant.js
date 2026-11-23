/* SPDX-License-Identifier: MIT */
'use strict';

// One user event arms at most one exact, short-lived request. No persistent grants.
// This is an extension-owned callback; do not expose it in the page MAIN world.
class WebMcpOneShotGrant {
  constructor({ now = () => performance.now(), ttlMs = 8000 } = {}) {
    if (typeof now !== 'function' || !Number.isSafeInteger(ttlMs) ||
        ttlMs < 1 || ttlMs > 15000) throw new TypeError('invalid_grant_config');
    this.now = now;
    this.ttlMs = ttlMs;
    this.pending = null;
  }

  armDiscover({ tabId, origin }) {
    this.arm({ kind: 'discover', tabId, origin });
  }

  armExecute({ tabId, origin, documentId, name, signature, inputJson }) {
    this.arm({ kind: 'execute', tabId, origin, documentId, name, signature, inputJson });
  }

  arm(scope) {
    // Invalid replacement attempts must never leave an older ticket alive.
    this.pending = null;
    const secure = origin => {
      try {
        const u = new URL(origin);
        return u.origin === origin && (u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)));
      } catch {
        return false;
      }
    };
    if (!Number.isSafeInteger(scope?.tabId) || scope.tabId < 0 ||
        !secure(scope.origin) || !['discover', 'execute'].includes(scope.kind)) {
      throw new TypeError('invalid_grant_scope');
    }
    if (scope.kind === 'execute' && (
      typeof scope.documentId !== 'string' || scope.documentId.length < 1 ||
      scope.documentId.length > 128 || typeof scope.name !== 'string' ||
      !/^[\w.-]{1,128}$/.test(scope.name) || typeof scope.signature !== 'string' ||
      scope.signature.length < 1 || scope.signature.length > 16384 ||
      typeof scope.inputJson !== 'string' || new TextEncoder().encode(scope.inputJson).length > 65536)) {
      throw new TypeError('invalid_grant_scope');
    }
    const keys = scope.kind === 'discover'
      ? ['kind', 'tabId', 'origin']
      : ['kind', 'tabId', 'origin', 'documentId', 'name', 'signature', 'inputJson'];
    this.pending = { keys, scope: Object.fromEntries(keys.map(key => [key, scope[key]])),
      expiry: this.now() + this.ttlMs };
  }

  authorize(request) {
    // Consume the one-use grant even on a mismatched/expired attempt.
    const ticket = this.pending;
    this.pending = null;
    return !!ticket && this.now() <= ticket.expiry &&
      ticket.keys.every(key => request?.[key] === ticket.scope[key]);
  }

  revoke() {
    this.pending = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WebMcpOneShotGrant };
} else {
  globalThis.WebMcpOneShotGrant = WebMcpOneShotGrant;
}
