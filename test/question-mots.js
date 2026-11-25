'use strict';

/**
 * JSM Portal Answers — THE "WORDS OF THE QUESTION" TEST.
 *
 * WHAT IT PROVES
 *
 * Tool 1 passes the words of the customer's question to the server-side
 * `searchQuery` filter of the JSM API. That filter matches the words AS ONE
 * STRING (the fixtures reproduce it, measured on the site on 18/11/2026):
 * "broken laptop" finds nothing on the captured portal, whose type is
 * "Report broken hardware". An agent passes several words of the customer's
 * question, so before this fix it answered "none found" to most real
 * questions. Here, on the LIVE CAPTURES of test/fixtures.js:
 *
 *   1. "my laptop is broken" -> "Report broken hardware" is listed, and the
 *      answer says that the list comes from the word-by-word fallback;
 *   2. "new software for my team" -> "Request new software" comes FIRST
 *      (it contains 2 words), before the types that contain only "new";
 *   3. "account" (one word the server finds) -> the server answer is kept,
 *      no fallback sentence, one request type;
 *   4. words found nowhere -> "none found for the words given";
 *   5. every call is a GET made with asUser() (the stub refuses asApp());
 *   6. the small words are dropped ("How do I get a NEW laptop?" -> get, new, laptop);
 *   7. COUNTER-PROOF: a copy of src/mcp.js without the fallback must FAIL
 *      checks 1 and 2. A test that passes on broken code proves nothing.
 *
 * USAGE: node test/question-mots.js      EXIT CODE: 0 when every check passes.
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

const REPLI = 'contain at least one of the words';

async function controles(dossier) {
  const mcp = charger(dossier);
  const res = [];
  const s1 = await mcp.listPortalRequestTypes({ portal: 'SUP', question: 'my laptop is broken' }, {});
  res.push(['"my laptop is broken" : "Report broken hardware" est propose, et la reponse dit pourquoi',
    s1.includes('Report broken hardware') && s1.includes(REPLI)]);
  const s2 = await mcp.listPortalRequestTypes({ portal: 'SUP', question: 'new software for my team' }, {});
  const i1 = s2.indexOf('Request new software');
  const i2 = s2.indexOf('Request new hardware');
  res.push(['"new software for my team" : "Request new software" vient en premier',
    i1 !== -1 && (i2 === -1 || i1 < i2)]);
  return { res, mcp };
}

async function principal() {
  const echecs = [];
  const ok = [];
  const { res, mcp } = await controles(SRC);
  for (const [nom, c] of res) (c ? ok : echecs).push(nom);

  const s3 = await mcp.listPortalRequestTypes({ portal: 'SUP', question: 'account' }, {});
  const c3 = s3.includes('Request types (1):') && s3.includes('Request a new account') && !s3.includes(REPLI);
  (c3 ? ok : echecs).push('"account" : la reponse du serveur est gardee telle quelle (1 type, pas de repli)');

  const s4 = await mcp.listPortalRequestTypes({ portal: 'SUP', question: 'zzqx wplk' }, {});
  const c4 = s4.includes('none found for the words given');
  (c4 ? ok : echecs).push('des mots introuvables : "none found for the words given"');

  const c5 = appels.length > 0 && appels.every((m) => m === 'GET');
  (c5 ? ok : echecs).push('tous les appels sont des GET avec asUser() (' + appels.length + ' appels)');

  const mots = mcp._motsSignificatifs('How do I get a NEW laptop?');
  const c6 = JSON.stringify(mots) === JSON.stringify(['get', 'new', 'laptop']);
  (c6 ? ok : echecs).push('les petits mots sont retires : ' + JSON.stringify(mots));

  // 7. Counter-proof: without the fallback, checks 1 and 2 must fail.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pja-mots-'));
  fs.copyFileSync(path.join(SRC, 'jsm.js'), path.join(dir, 'jsm.js'));
  const source = fs.readFileSync(path.join(SRC, 'mcp.js'), 'utf8');
  const avant = 'if (!types.length && question) {';
  if (!source.includes(avant)) {
    echecs.push('contre-epreuve : le morceau de code a saboter est introuvable');
  } else {
    fs.writeFileSync(path.join(dir, 'mcp.js'), source.replace(avant, 'if (false) {'));
    const sabote = await controles(dir);
    const rates = sabote.res.filter(([, c]) => !c).length;
    (rates === 2 ? ok : echecs).push('contre-epreuve : une copie sans le repli echoue aux 2 controles' +
      (rates === 2 ? '' : ' — echecs: ' + rates + '/2'));
  }
  fs.rmSync(dir, { recursive: true, force: true });

  console.log('');
  console.log('JSM Portal Answers — mots de la question');
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
