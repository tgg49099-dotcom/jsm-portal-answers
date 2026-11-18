'use strict';

/**
 * JSM Portal Answers — THE TRANSPORT between the page and the resolver.
 *
 * WHY THIS FILE EXISTS
 *
 * `@forge/bridge` calls `getCallBridge()` AT IMPORT TIME and throws when
 * `globalThis.__bridge` is absent. A top-level `require('@forge/bridge')`
 * would therefore crash the offline test harness (plain Node, no runtime)
 * before a single check could run. The require must be LAZY, and the
 * fallback must be keyed on the RUNTIME, never on the result of the
 * import: "the import failed, carry on offline" is exactly the failure that
 * hides a broken page.
 *
 * The documented path is `import { invoke } from '@forge/bridge'`:
 * https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/invoke/
 */

/**
 * True inside a Forge Custom UI iframe.
 *
 * @returns {boolean}
 */
function runtimeIsPresent() {
  return (
    typeof globalThis !== 'undefined' &&
    !!globalThis.__bridge &&
    typeof globalThis.__bridge.callBridge === 'function'
  );
}

/**
 * A refusal that carries everything the page needs to show it.
 *
 * @param {string} name
 * @param {string} message
 * @param {string} resolver
 * @returns {Promise<never>}
 */
function refuser(name, message, resolver) {
  return Promise.reject({ name: name, message: message, resolver: resolver });
}

/**
 * The bridge, or a bridge that refuses with a clear reason.
 *
 * @returns {{invoke: function(string, object): Promise<any>}}
 */
function createBridge() {
  if (!runtimeIsPresent()) {
    return {
      invoke(resolver, payload) {
        return refuser(
          'BRIDGE_UNAVAILABLE',
          'The Forge runtime is not available in this context. This call would normally reach ' +
            'the "' +
            resolver +
            '" resolver of the app.',
          resolver
        );
      },
    };
  }

  let invoke;
  try {
    invoke = require('@forge/bridge').invoke;
  } catch (err) {
    return {
      invoke(resolver, payload) {
        return refuser(
          'BRIDGE_LOAD_FAILED',
          'The Forge Custom UI bridge is present but @forge/bridge could not be imported: ' +
            ((err && err.message) || String(err) || '(no message)'),
          resolver
        );
      },
    };
  }
  if (typeof invoke !== 'function') {
    return {
      invoke(resolver, payload) {
        return refuser(
          'BRIDGE_LOAD_FAILED',
          '@forge/bridge is present but exports no invoke() function.',
          resolver
        );
      },
    };
  }
  return { invoke: invoke };
}

module.exports = { createBridge: createBridge, runtimeIsPresent: runtimeIsPresent };
