'use strict';

/**
 * JSM Portal Answers — THE TWO CALLS the page can make.
 *
 * The transport is `createBridge()` from bridge.js (offline-safe: it never
 * throws at import time). Each function resolves with the answer of the
 * resolver, or rejects with a structured error — the page turns a rejection
 * into a message on the screen, never into a silent empty page.
 *
 * The resolver is the one declared in the manifest (`function: resolver`).
 * The action travels in the payload: 'types' or 'form'.
 */

const { createBridge } = require('./bridge.js');

/**
 * "What can I ask for on this portal?"
 *
 * @param {object} payload  { portal?, question? }
 * @returns {Promise<object>} the resolver's answer
 */
function demanderPortail(payload) {
  return createBridge().invoke('resolver', Object.assign({ action: 'types' }, payload || {}));
}

/**
 * "What do I have to fill in?"
 *
 * @param {object} payload  { request_type, portal? }
 * @returns {Promise<object>} the resolver's answer
 */
function decrireFormulaire(payload) {
  return createBridge().invoke('resolver', Object.assign({ action: 'form' }, payload || {}));
}

module.exports = { demanderPortail: demanderPortail, decrireFormulaire: decrireFormulaire };
