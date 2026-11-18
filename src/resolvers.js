'use strict';

/**
 * JSM Portal Answers — THE RESOLVER OF THE JIRA GLOBAL PAGE.
 *
 * WHAT THIS FILE IS
 *
 * The manifest declares one `jira:globalPage` module (the page appears in
 * the "Apps" menu of the Jira navigation, at /jira/apps/{appId}/{envId}).
 * The page calls THIS resolver through the Custom UI bridge.
 *
 * ONE IMPLEMENTATION, TWO FACES
 *
 * The resolver does not have its own logic: it calls the two MCP tools of
 * src/mcp.js, which are the product of the app. The page and the MCP tools
 * therefore ALWAYS answer the same thing — there is no second version of the
 * truth to keep in sync, and no way for the page to show something the tools
 * would not show.
 *
 *   * the page asks "types" → `list_portal_request_types`
 *   * the page asks "form"  → `describe_request_typeForm`
 *
 * WHAT THE RESOLVER DOES NOT DO
 *
 *   * It writes nothing and stores nothing: the two tools only read.
 *   * It reads with the CALLER's identity (asUser, inside src/jsm.js), so the
 *     page shows the caller what the caller is allowed to see. The page is
 *     not a way to see more than the tools would show.
 *   * It never renders the answer of another site: every path the tools call
 *     is relative to the site where the app is installed.
 *
 * The identity of the caller is checked: a call that carries no account is
 * refused, so an anonymous call never reads the site.
 */

const mcp = require('./mcp.js');

/**
 * The identity of the caller.
 *
 * @forge/resolver computes the account from `backendRuntimePayload.principal.accountId`,
 * and the platform also carries it in the call context. Both are read; the
 * call is refused when neither is there.
 *
 * @param {object} req  the request the platform gives to the handler
 * @param {object} runtimePayload  the runtime payload of the platform
 * @returns {string|null} the account id, or null when there is none
 */
function identite(req, runtimePayload) {
  const principal = (runtimePayload && runtimePayload.principal) || {};
  const context = (req && req.context) || {};
  return principal.accountId || context.accountId || null;
}

const REPONSE_NON_AUTHENTIFIE = {
  ok: false,
  error: 'NOT_AUTHENTICATED',
  message:
    'This page answers the questions of a signed-in Jira user. Open the app from the Apps menu ' +
    'of Jira, while you are logged in, and ask again.',
};

const REPONSE_FONCTION_INCONNUE = {
  ok: false,
  error: 'UNKNOWN_FUNCTION',
  message: 'This app only answers the "types" and "form" functions.',
};

/**
 * The two actions of the page.
 *
 * @param {string} action
 * @returns {boolean}
 */
function actionConnue(action) {
  return action === 'types' || action === 'form';
}

/**
 * The action asked for: it travels in the payload of the call, and the name
 * of the invoked function is accepted as a second source.
 *
 * @param {object} req
 * @returns {string}
 */
function actionDemandee(req) {
  const payload = (req && req.payload) || {};
  const call = (req && req.call) || {};
  const a = typeof payload.action === 'string' ? payload.action : '';
  if (actionConnue(a)) return a;
  const k = typeof call.functionKey === 'string' ? call.functionKey : '';
  if (actionConnue(k)) return k;
  return '';
}

/**
 * The answer of the page: the answer of the tool, unchanged.
 *
 * @param {string} action  'types' or 'form'
 * @param {object} payload
 * @param {object} context
 * @returns {Promise<{ok: boolean, answer: string}>}
 */
async function repondre(action, payload, context) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const portal = typeof p.portal === 'string' ? p.portal : '';
  let answer;
  if (action === 'form') {
    answer = await mcp.describeRequestTypeForm(
      { request_type: typeof p.request_type === 'string' ? p.request_type : '', portal },
      context
    );
  } else {
    answer = await mcp.listPortalRequestTypes(
      { portal, question: typeof p.question === 'string' ? p.question : '' },
      context
    );
  }
  return { ok: true, answer: String(answer) };
}

/**
 * The handler the manifest points at (`function: resolver`).
 *
 * The platform calls it in two ways:
 *   1. when it RENDERS the page — there is no call then, and there is
 *      nothing to compute: the page asks its question itself;
 *   2. when the page calls `invoke('resolver', payload)` — there is a call
 *      with a payload, and the action is in it.
 *
 * @param {object} req  { call?, payload?, context? }
 * @param {object} runtimePayload  { principal? }
 * @returns {Promise<object>}
 */
exports.handler = async function handler(req, runtimePayload) {
  const call = req && req.call;
  if (!call || typeof call.functionKey !== 'string') {
    // The rendering call: nothing to compute.
    return {
      ok: true,
      page: 'portal',
      application: 'JSM Portal Answers',
      message:
        'Ready. Ask a question about a customer portal of this site: what a customer can ask ' +
        'for, and what they have to fill in.',
    };
  }
  const action = actionDemandee(req);
  if (!action) return Object.assign({}, REPONSE_FONCTION_INCONNUE);
  if (!identite(req, runtimePayload)) return Object.assign({}, REPONSE_NON_AUTHENTIFIE);
  try {
    return await repondre(action, (req && req.payload) || {}, (req && req.context) || {});
  } catch (e) {
    return {
      ok: false,
      error: 'READ_FAILED',
      message:
        'The Atlassian API could not be read (' +
        ((e && e.message) || 'unknown error') +
        '). Nothing was written and nothing was stored.',
    };
  }
};

// Exported for the offline test harness (no effect at runtime).
exports._actionDemandee = actionDemandee;
exports._identite = identite;
exports._repondre = repondre;
