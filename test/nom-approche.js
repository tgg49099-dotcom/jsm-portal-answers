'use strict';

/**
 * JSM Portal Answers — THE "APPROXIMATE NAME" TEST (tool 2).
 *
 * WHAT IT PROVES
 *
 * Tool 2 (describe_request_type_form) used to accept only an id or the EXACT
 * name of a request type. An agent rarely has the exact name: it passes
 * "IT help" for "Get IT help". Before this fix the tool answered "No request
 * type was found" although the type was on the portal. Here, on the LIVE
 * CAPTURES of test/fixtures.js:
 *
 *   1. "IT help" -> the form of "Get IT help" is described, its fields are
 *      listed, and the answer says the name was not exact;
 *   2. "Request new" (two types contain it) -> nothing is guessed: both
 *      types are listed with their id, and the agent is told to ask again;
 *   3. "onboard" (one type) -> "Onboard new employees" is described, with
 *      its field "Employee start date";
 *   4. the exact name and the id still work, with no fallback sentence;
 *   5. words found nowhere -> the refusal, without a "closest" list;
 *   6. every call is a GET made with asUser() (the stub refuses asApp());
 *   7. COUNTER-PROOF: a copy of src/mcp.js without the fallback must FAIL
 *      checks 1, 2 and 3. A test that passes on broken code proves nothing.
 *
 * USAGE: node test/nom-approche.js      EXIT CODE: 0 when every check passes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const fixtures = require('./fixtures.js');

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

const repondre = fixtures.scenario('principal');
const appels = [];

const stub = {
  route,
  asUser() {
    return {
      async requestJira(r, options) {
        const c = String(r.value);
        appels.push((options && options.method) || 'GET');
        const i = c.indexOf('?');
        const base = i === -1 ? c : c.slice(0, i);
        const rep = repondre(base, new URLSearchParams(i === -1 ? '' : c.slice(i + 1)));
        return { status: rep.status, async json() { return rep.body; } };
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

const APPROCHE = 'is named exactly';
const PROCHES = 'The closest request types are:';

async function controles(dossier) {
  const mcp = charger(dossier);
  const res = [];
  const s1 = await mcp.describeRequestTypeForm({ request_type: 'IT help', portal: 'SUP' }, {});
  res.push(['"IT help" : le formulaire de "Get IT help" est decrit, et la reponse dit que le nom n\'etait pas exact',
    s1.includes('Request type: Get IT help [id 1]') && s1.includes('Fields the customer sees (') && s1.includes(APPROCHE)]);
  const s2 = await mcp.describeRequestTypeForm({ request_type: 'Request new' }, {});
  res.push(['"Request new" : rien n\'est devine, les 2 types sont proposes avec leur id',
    s2.includes(PROCHES) && s2.includes('"Request new hardware" [id ') && s2.includes('"Request new software" [id ') &&
    !s2.includes('Fields the customer sees')]);
  const s3 = await mcp.describeRequestTypeForm({ request_type: 'onboard', portal: 'SUP' }, {});
  res.push(['"onboard" : "Onboard new employees" est decrit avec "Employee start date"',
    s3.includes('Request type: Onboard new employees') && s3.includes('Employee start date') && s3.includes(APPROCHE)]);
  return { res, mcp };
}

async function principal() {
  const echecs = [];
  const ok = [];
  const { res, mcp } = await controles(SRC);
  for (const [nom, c] of res) (c ? ok : echecs).push(nom);

  const s4a = await mcp.describeRequestTypeForm({ request_type: 'Get IT help', portal: 'SUP' }, {});
  const s4b = await mcp.describeRequestTypeForm({ request_type: '1', portal: 'SUP' }, {});
  const c4 = [s4a, s4b].every((s) => s.includes('Request type: Get IT help [id 1]') && !s.includes(APPROCHE));
  (c4 ? ok : echecs).push('le nom exact et l\'id marchent comme avant, sans phrase de repli');

  const s5 = await mcp.describeRequestTypeForm({ request_type: 'zzqx wplk', portal: 'SUP' }, {});
  const c5 = s5.includes('No request type was found') && !s5.includes(PROCHES);
  (c5 ? ok : echecs).push('des mots introuvables : le refus, sans liste de types proches');

  const c6 = appels.length > 0 && appels.every((m) => m === 'GET');
  (c6 ? ok : echecs).push('tous les appels sont des GET avec asUser() (' + appels.length + ' appels)');

  // 7. Counter-proof: without the fallback, checks 1, 2 and 3 must fail.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pja-nom-'));
  fs.copyFileSync(path.join(SRC, 'jsm.js'), path.join(dir, 'jsm.js'));
  const source = fs.readFileSync(path.join(SRC, 'mcp.js'), 'utf8');
  const avant = "  let ligneApproche = '';\n  if (!trouveType) {";
  if (!source.includes(avant)) {
    echecs.push('contre-epreuve : le morceau de code a saboter est introuvable');
  } else {
    fs.writeFileSync(path.join(dir, 'mcp.js'), source.replace(avant,
      "  let ligneApproche = '';\n  if (!trouveType) return REFUS_TYPE_ABSENT;\n  if (false) {"));
    const sabote = await controles(dir);
    const rates = sabote.res.filter(([, c]) => !c).length;
    (rates === 3 ? ok : echecs).push('contre-epreuve : une copie sans le repli echoue aux 3 controles' +
      (rates === 3 ? '' : ' — echecs: ' + rates + '/3'));
  }
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('');
  console.log('JSM Portal Answers — nom approche (outil 2)');
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
