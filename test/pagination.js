'use strict';

/**
 * JSM Portal Answers — THE PAGINATION TEST.
 *
 * WHAT IT PROVES
 *
 * The JSM REST API pages its lists (`start`, `limit`, `isLastPage`) and may
 * return fewer items than `limit`. A tool that reads only the first page
 * would count the request types of a big portal wrong, and would answer
 * "no request type was found" for a type that sits on a later page.
 *
 * Here the API is a stub that serves the lists TWO items per page:
 *   1. tool 1 must list all 5 request types of the portal, and say 5;
 *   2. tool 2 must find, by its name, a request type that is on page 3;
 *   3. a portal on page 2 of the service desks must be found;
 *   4. an API that never says `isLastPage: true` must stop after PAGES_MAX
 *      pages, and the answer must say the list is INCOMPLETE;
 *   5. COUNTER-PROOF: a copy of src/jsm.js that reads only the first page
 *      must FAIL checks 1 to 3. A test that passes on broken code proves
 *      nothing.
 *
 * USAGE: node test/pagination.js         EXIT CODE: 0 when every check passes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const SRC = path.join(__dirname, '..', 'src');

function route(strings, ...valeurs) {
  let mode = 'path';
  let r = '';
  for (let i = 0; i < strings.length; i++) {
    if (strings[i].includes('?')) mode = 'query';
    r += strings[i];
    if (i < valeurs.length) r += mode === 'query' ? encodeURIComponent(String(valeurs[i])) : String(valeurs[i]);
  }
  return { value: r };
}

const PORTAILS = [
  { id: '1', projectKey: 'SUP', projectName: 'Support', projectTypeKey: 'service_desk' },
  { id: '3', projectKey: 'FAC', projectName: 'Facilities', projectTypeKey: 'service_desk' },
  { id: '7', projectKey: 'HR', projectName: 'People', projectTypeKey: 'service_desk' },
];
const TYPES = ['Get IT help', 'Request a laptop', 'Reset a password', 'Order a badge', 'Refund an invoice']
  .map((name, i) => ({ id: String(i + 1), name, description: 'about ' + name, groupIds: [], canCreateRequest: true }));

let sansFin = false;
let appels = 0;

function page(liste, query) {
  const start = Number(query.get('start') || 0);
  const vals = liste.slice(start, start + 2);
  return { size: vals.length, start, isLastPage: sansFin ? false : start + 2 >= liste.length, values: vals };
}

function repondre(base, query) {
  if (base === '/rest/servicedeskapi/info') return { isLicensedForUse: true };
  if (base === '/rest/servicedeskapi/servicedesk') return page(PORTAILS, query);
  if (/\/requesttypegroup$/.test(base)) return { size: 0, isLastPage: true, values: [] };
  if (/\/requesttype$/.test(base)) {
    if (sansFin) return { size: 1, isLastPage: false, values: [{ id: 'x' + appels, name: 'Endless ' + appels }] };
    return page(TYPES, query);
  }
  if (/\/requesttype\/[^/]+\/field$/.test(base)) {
    return { requestTypeFields: [{ fieldId: 'summary', name: 'Summary', required: true, jiraSchema: { type: 'string' } }] };
  }
  return null;
}

const stub = {
  route,
  asUser() {
    return {
      async requestJira(r) {
        appels++;
        const c = String(r.value);
        const i = c.indexOf('?');
        const base = i === -1 ? c : c.slice(0, i);
        const body = repondre(base, new URLSearchParams(i === -1 ? '' : c.slice(i + 1)));
        return { status: body ? 200 : 404, async json() { return body; } };
      },
    };
  },
  asApp() { throw new Error('asApp() must never be called'); },
};

function charger(dossier) {
  const original = Module._load;
  Module._load = function (request) {
    if (request === '@forge/api') return stub;
    return original.apply(this, arguments);
  };
  try {
    for (const f of ['jsm.js', 'mcp.js']) delete require.cache[path.join(dossier, f)];
    return require(path.join(dossier, 'mcp.js'));
  } finally {
    Module._load = original;
  }
}

async function controles(dossier) {
  const mcp = charger(dossier);
  const res = [];
  sansFin = false;
  const s1 = await mcp.listPortalRequestTypes({ portal: 'SUP' }, {});
  res.push(['outil 1 : les 5 types de demande sont lus (5 pages de 2 au plus)',
    s1.includes('Request types (5):') && TYPES.every((t) => s1.includes(t.name))]);
  const s2 = await mcp.describeRequestTypeForm({ request_type: 'Refund an invoice', portal: 'SUP' }, {});
  res.push(['outil 2 : un type de la page 3 est trouve par son nom',
    s2.includes('Request type: Refund an invoice') && s2.includes('Summary')]);
  const s3 = await mcp.listPortalRequestTypes({ portal: 'HR' }, {});
  res.push(['un portail de la page 2 des service desks est trouve', s3.includes('Portal: People (HR)')]);
  return { res, mcp };
}

async function principal() {
  const echecs = [];
  const ok = [];
  const { res, mcp } = await controles(SRC);
  for (const [nom, c] of res) (c ? ok : echecs).push(nom);

  // 4. An API that never ends: bounded, and said.
  const jsm = require(path.join(SRC, 'jsm.js'));
  sansFin = true;
  appels = 0;
  const s4 = await mcp.listPortalRequestTypes({ portal: 'SUP' }, {});
  const lusTypes = (s4.match(/Endless /g) || []).length;
  const borne = lusTypes === jsm.PAGES_MAX && /INCOMPLETE/.test(s4);
  (borne ? ok : echecs).push('une API sans fin s\'arrete a ' + jsm.PAGES_MAX + ' pages et le dit (INCOMPLETE)' +
    (borne ? '' : ' — lus: ' + lusTypes));
  sansFin = false;

  // 5. Counter-proof: a first-page-only copy must fail checks 1 to 3.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pja-pages-'));
  fs.copyFileSync(path.join(SRC, 'mcp.js'), path.join(dir, 'mcp.js'));
  const source = fs.readFileSync(path.join(SRC, 'jsm.js'), 'utf8');
  const avant = "if (!rep.body || rep.body.isLastPage !== false || vals.length === 0) {";
  if (!source.includes(avant)) {
    echecs.push('contre-epreuve : le morceau de code a saboter est introuvable');
  } else {
    fs.writeFileSync(path.join(dir, 'jsm.js'), source.replace(avant, 'if (true) {'));
    const sabote = await controles(dir);
    const rates = sabote.res.filter(([, c]) => !c).length;
    (rates === 3 ? ok : echecs).push('contre-epreuve : une copie qui ne lit que la 1re page echoue aux 3 controles' +
      (rates === 3 ? '' : ' — echecs: ' + rates + '/3'));
  }
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('');
  console.log('JSM Portal Answers — pagination');
  console.log('  verifications reussies : ' + ok.length);
  console.log('  verifications en echec  : ' + echecs.length);
  for (const e of echecs) console.log('  ECHEC — ' + e);
  console.log('');
  console.log(echecs.length ? 'RESULTAT : ECHEC' : 'RESULTAT : SUCCES');
  process.exit(echecs.length ? 1 : 0);
}

principal().catch((e) => {
  console.error('ECHEC — exception :', e && e.stack ? e.stack : e);
  process.exit(1);
});
