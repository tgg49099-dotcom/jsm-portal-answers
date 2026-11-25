'use strict';

/**
 * JSM Portal Answers — THE READ-ONLY JSM CLIENT.
 *
 * WHY THIS FILE EXISTS
 *
 * The app answers one kind of question: "what can a customer ask for on this
 * Jira Service Management customer portal, and what would they have to fill
 * in?" Every answer is built from the metadata of the request types of a
 * portal. This file is the ONLY place where the Atlassian REST API is
 * called, so the set of endpoints of the app can be read in one screen — and
 * so the "read only" promise can be checked mechanically:
 *
 *   * every call below is a GET;
 *   * every call is made with `asUser()` — the CALLER's own identity, never
 *     the app's own identity (`asApp()`), so a tool can never read what the
 *     person calling it cannot read themselves;
 *   * nothing is written, nothing is stored, no other tenant is ever read.
 *
 * THE ENDPOINTS (Jira Service Management Cloud REST API v3)
 *
 * The paths and the response fields used below are taken from the OFFICIAL
 * OpenAPI document of the JSM Cloud REST API (swagger.v3.json, published by
 * Atlassian at https://developer.atlassian.com/cloud/jira/service-desk/swagger.v3.json,
 * read on 18/11/2026). Each line below cites the operation it comes from:
 *
 *   | call                                   | operation             | scope                  |
 *   |----------------------------------------|-----------------------|------------------------|
 *   | GET /rest/servicedeskapi/info          | getInfo               | (none)                 |
 *   | GET /rest/servicedeskapi/servicedesk   | getServiceDesks       | read:servicedesk-request|
 *   | GET .../servicedesk/{id}/requesttype   | getRequestTypes       | read:servicedesk-request|
 *   | GET .../requesttype/{id}/field         | getRequestTypeFields  | read:servicedesk-request|
 *   | GET .../servicedesk/{id}/requesttypegroup | getRequestTypeGroups| read:servicedesk-request|
 *
 * Two facts from that same document are used by the code:
 *
 *   1. `getInfo` answers `isLicensedForUse`. When it is false, Jira Service
 *      Management is not active on the site: there is no portal to read, and
 *      the tools must say that instead of returning an empty list that would
 *      look like a portal without any request type.
 *   2. `getRequestTypes` accepts `searchQuery` (filter on the request types)
 *      and `restrictionStatus` (`open` or `restricted`); `getRequestTypes`
 *      and `getRequestTypeFields` are the two calls that describe WHAT A
 *      CUSTOMER SEES on the portal.
 *
 * WHAT IS DELIBERATELY NOT READ
 *
 * The SLA targets of a portal are NOT exposed by the public JSM REST API: the
 * only SLA endpoints of the API are `GET /rest/servicedeskapi/request/
 * {issueIdOrKey}/sla`, which describe ONE ALREADY CREATED REQUEST, not the
 * rules of a portal. The tools therefore never claim to know the SLA of a
 * portal; when the create form of a request type carries an SLA line, it is
 * reported as a field of the form, because that is what the API really says.
 * The app also never reads issues, comments, attachments, users or
 * organisations: it reads request type metadata and nothing else.
 */

const api = require('@forge/api');
const { route } = require('@forge/api');

const JSM_HDRS = { Accept: 'application/json' };

/**
 * The identifiers that go into a path are checked before they are used.
 * The `route` tag of @forge/api refuses `..`, `/`, `?` and `#` in a path
 * parameter, but a value that is not a path segment must not reach the URL
 * at all: an id that is not `[A-Za-z0-9_-]` is refused here, with a message,
 * instead of being sent.
 */
const MOT_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * @param {unknown} valeur
 * @returns {boolean} true when the value can be used as a path segment
 */
function idValide(valeur) {
  return typeof valeur === 'string' && MOT_ID.test(valeur.trim());
}

/**
 * Is this the error that means "the user has not granted access to the app"?
 *
 * THE RULE, AS WRITTEN BY ATLASSIAN
 * (developer.atlassian.com/platform/forge/apis-reference/fetch-api-product.requestjira/,
 * read on 19 November 2026):
 *
 *   "If the API returns a 401 and there isn't a valid Authorization header,
 *    then an Error is thrown."
 *   "If this error isn't caught, the user is prompted to grant access to the
 *    app."
 *   "If the user grants access, the app is re-initialized."
 *
 * So THIS error must NOT be caught here: catching it would leave the user
 * with no way to grant access to the app at all — the page would only say
 * that "the API could not be read", and the app would look broken to the
 * person who installs it. Every OTHER error is still handled here, and still
 * answered in words.
 *
 * @param {unknown} e
 * @returns {boolean}
 */
function erreurAutorisation(e) {
  if (!e) return false;
  if (typeof e.name === 'string' && e.name === 'NEEDS_AUTHENTICATION_ERR') return true;
  return typeof e.message === 'string' && /authentication required/i.test(e.message);
}

/**
 * One GET, with the caller's own identity.
 *
 * The answer is always an object with the same shape, so the callers never
 * have to guess what a failure looks like: `{ok, status, body, erreur}`.
 * `ok` is true only for a 2xx answer.
 *
 * @param {object} routeur  the `route` built by the caller
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
async function get(routeur) {
  let res = null;
  try {
    res = await api.asUser().requestJira(routeur, { headers: JSM_HDRS });
  } catch (e) {
    // The one error that must reach the platform: it is what makes Jira
    // offer the user the "allow access" screen. See erreurAutorisation().
    if (erreurAutorisation(e)) throw e;
    return {
      ok: false,
      status: 0,
      body: null,
      erreur: e && e.message ? e.message : String(e),
    };
  }
  const status = res && typeof res.status === 'number' ? res.status : 0;
  let body = null;
  try {
    body = await res.json();
  } catch (e) {
    body = null;
  }
  return { ok: status >= 200 && status < 300, status, body, erreur: null };
}

/**
 * Every page of a paged answer, not only the first one.
 *
 * The JSM REST API pages its lists (`start`, `limit`, `isLastPage`), and the
 * server may return FEWER items than `limit` asks for. Reading only the first
 * page would make a tool answer "Request types (50)" on a portal that has 60,
 * and answer "no request type was found" for a type that sits on page 2. So
 * the pages are followed while the API says `isLastPage: false`, up to
 * PAGES_MAX pages; past that, the answer says it is incomplete
 * (`tronque: true`) instead of pretending to be the whole list.
 *
 * @param {(start: string) => object} construire  builds the `route` of one page
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
const PAGES_MAX = 20;

async function toutesLesPages(construire) {
  const tout = [];
  let start = 0;
  for (let page = 0; page < PAGES_MAX; page++) {
    const rep = await get(construire(String(start)));
    if (!rep.ok) {
      // The first page decides; a later failure keeps what was read, marked incomplete.
      if (page === 0) return rep;
      return { ok: true, status: rep.status, body: { values: tout, size: tout.length, isLastPage: false, tronque: true }, erreur: null };
    }
    const vals = valeurs(rep.body);
    for (const v of vals) tout.push(v);
    if (!rep.body || rep.body.isLastPage !== false || vals.length === 0) {
      return { ok: true, status: rep.status, body: { values: tout, size: tout.length, isLastPage: true }, erreur: null };
    }
    start += vals.length;
  }
  return { ok: true, status: 200, body: { values: tout, size: tout.length, isLastPage: false, tronque: true }, erreur: null };
}

/**
 * Is Jira Service Management active (and licensed) on this site?
 *
 * `GET /rest/servicedeskapi/info` needs no scope. Its `isLicensedForUse`
 * field is the difference between "the portal has no request type" and
 * "there is no portal on this site".
 *
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
function etatJsm() {
  return get(route`/rest/servicedeskapi/info`);
}

/**
 * The customer portals of the site (JSM calls them service desks).
 *
 * `GET /rest/servicedeskapi/servicedesk` -> `ServiceDeskDTO[]`:
 * `id`, `projectId`, `projectKey`, `projectName`, `projectTypeKey`.
 *
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
function portails() {
  return toutesLesPages((start) => route`/rest/servicedeskapi/servicedesk?start=${start}&limit=100`);
}

/**
 * The categories ("request type groups") of a portal.
 *
 * `GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttypegroup`
 * -> `RequestTypeGroupDTO[]`: `id`, `name`.
 *
 * @param {string} serviceDeskId
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
function groupes(serviceDeskId) {
  if (!idValide(serviceDeskId)) {
    return Promise.resolve({ ok: false, status: 0, body: null, erreur: 'identifiant invalide' });
  }
  return toutesLesPages((start) => route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttypegroup?start=${start}&limit=100`);
}

/**
 * The request types of a portal — what a customer can ask for.
 *
 * `GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype`
 * -> `RequestTypeDTO[]`: `id`, `name`, `description`, `helpText`, `groupIds`,
 * `portalId`, `serviceDeskId`, `practice`, `restrictionStatus` (open or
 * restricted), `canCreateRequest`.
 *
 * @param {string} serviceDeskId
 * @param {string} [recherche]  words of the customer's question, used as the
 *   `searchQuery` filter of the endpoint
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
function typesDeDemande(serviceDeskId, recherche) {
  if (!idValide(serviceDeskId)) {
    return Promise.resolve({ ok: false, status: 0, body: null, erreur: 'identifiant invalide' });
  }
  const q = typeof recherche === 'string' ? recherche.trim() : '';
  if (!q) {
    return toutesLesPages((start) => route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype?start=${start}&limit=100`);
  }
  // The query parameter is encoded by the `route` tag itself (it switches to
  // query mode after the `?` and applies encodeURIComponent to the values).
  return toutesLesPages((start) => route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype?start=${start}&limit=100&searchQuery=${q}`);
}

/**
 * The create form of a request type — what a customer has to fill in.
 *
 * `GET /rest/servicedeskapi/servicedesk/{serviceDeskId}/requesttype/
 * {requestTypeId}/field` -> `CustomerRequestCreateMetaDTO`:
 * `requestTypeFields[]` (each one: `fieldId`, `name`, `description`,
 * `required`, `visible`, `jiraSchema`, `validValues[]`, `defaultValues[]`),
 * plus the two rules of the portal: `canRaiseOnBehalfOf` and
 * `canAddRequestParticipants`.
 *
 * @param {string} serviceDeskId
 * @param {string} requestTypeId
 * @returns {Promise<{ok: boolean, status: number, body: any, erreur: string|null}>}
 */
function champsDuFormulaire(serviceDeskId, requestTypeId) {
  if (!idValide(serviceDeskId) || !idValide(requestTypeId)) {
    return Promise.resolve({ ok: false, status: 0, body: null, erreur: 'identifiant invalide' });
  }
  return get(
    route`/rest/servicedeskapi/servicedesk/${serviceDeskId}/requesttype/${requestTypeId}/field`
  );
}

/**
 * The list carried by a paged answer (`values`).
 *
 * @param {any} body
 * @returns {any[]}
 */
function valeurs(body) {
  if (body && Array.isArray(body.values)) return body.values;
  return [];
}

/**
 * Did the API stop before the end of the list (see toutesLesPages)?
 *
 * @param {any} body
 * @returns {boolean}
 */
function incomplet(body) {
  return Boolean(body && body.tronque === true);
}

module.exports = {
  etatJsm,
  portails,
  groupes,
  typesDeDemande,
  champsDuFormulaire,
  valeurs,
  incomplet,
  idValide,
  PAGES_MAX,
  erreurAutorisation,
};
