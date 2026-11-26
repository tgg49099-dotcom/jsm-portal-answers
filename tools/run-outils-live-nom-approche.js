'use strict';

/**
 * run-outils-live-nom-approche.js — run the REAL second tool against the REAL
 * portal with a request type name that is NOT exact.
 *
 * WHAT THIS SCRIPT PROVES
 * -----------------------
 * The second tool (`describe_request_type_form`) takes an id or the exact name
 * of a request type. An agent rarely has the exact name. When the name given
 * is not exact:
 *
 *   1. exactly one request type of the portals read has a name that contains
 *      it ("IT help" -> "Get IT help"): that form is described, and the answer
 *      says the name was not exact;
 *   2. several request types are close ("Request" -> "Request new hardware",
 *      "Request new software"): nothing is guessed, they are listed with
 *      their id, so the agent can ask again.
 *
 * The transport is replaced, never the code: `asUser()` is proxied to the
 * site's own REST API with the caller's own credentials, exactly as in
 * tools/run-outils-live-questions.js. The DATA is the real data of the real
 * portal.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * It never writes: every call is a GET, and `asApp()` throws.
 *
 * Usage:
 *   FORGE_EMAIL=… FORGE_API_TOKEN=… node tools/run-outils-live-nom-approche.js [site] [sortie.json]
 * Exit code: 0 when every call answered, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

const SITE = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://tgg-dev.atlassian.net';
const SORTIE = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, '..', 'docs', 'devpost', 'preuves', 'run-outils-live-nom-approche-2026-11-26.json');
const EMAIL = process.env.FORGE_EMAIL || '';
const JETON = process.env.FORGE_API_TOKEN || '';

if (!EMAIL || !JETON) {
  console.error('FORGE_EMAIL and FORGE_API_TOKEN are required.');
  process.exit(1);
}

const appels = [];

/**
 * The `route` tag, copied from @forge/api 8.5.0 (node_modules/@forge/api/out/safeUrl.js).
 */
function route(strings, ...valeurs) {
  let mode = 'path';
  let resultat = '';
  for (let i = 0; i < strings.length; i++) {
    const fragment = strings[i];
    if (fragment.includes('?') || fragment.includes('#')) mode = 'query';
    resultat += fragment;
    if (i >= valeurs.length) break;
    const v = valeurs[i];
    if (mode === 'query') {
      resultat += encodeURIComponent(String(v));
    } else {
      const brut = String(v);
      if (brut.includes('..') || brut.includes('/') || brut.includes('\\') || brut.includes('?') || brut.includes('#')) {
        throw new Error('Disallowing path manipulation attempt.');
      }
      resultat += brut;
    }
  }
  return { value: resultat };
}

/**
 * One GET to the real site, with the caller's own credentials.
 */
function getReel(chemin) {
  return new Promise((resolve, reject) => {
    const requete = https.request(
      SITE + chemin,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Basic ' + Buffer.from(EMAIL + ':' + JETON).toString('base64'),
        },
      },
      (reponse) => {
        let brut = '';
        reponse.on('data', (morceau) => {
          brut += morceau;
        });
        reponse.on('end', () => {
          let corps = null;
          try {
            corps = JSON.parse(brut);
          } catch (e) {
            corps = null;
          }
          resolve({ status: reponse.statusCode, body: corps });
        });
      }
    );
    requete.on('error', reject);
    requete.end();
  });
}

const stubForgeApi = {
  route,
  asUser() {
    return {
      async requestJira(routeur, options) {
        const chemin = typeof routeur === 'string' ? routeur : routeur && routeur.value;
        const methode = (options && options.method) || 'GET';
        const reponse = await getReel(chemin);
        appels.push({ methode, chemin, status: reponse.status });
        return {
          status: reponse.status,
          async json() {
            return reponse.body;
          },
        };
      },
    };
  },
  asApp() {
    throw new Error('asApp() must never be called by this app');
  },
};

/**
 * Load the module under test with the live proxy in place of @forge/api.
 */
function charger(fichier) {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === '@forge/api') return stubForgeApi;
    return original.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(fichier)];
    return require(fichier);
  } finally {
    Module._load = original;
  }
}

/**
 * The three calls of this run: the exact name (the control), a name that is
 * close to exactly one type, and a word that is close to several types.
 */
const CAS = [
  { cle: 'nom_exact', request_type: 'Get IT help', attendu: 'the exact form' },
  { cle: 'nom_proche_un_seul', request_type: 'IT help', attendu: 'the close form, described and said not to be exact' },
  { cle: 'nom_proche_plusieurs', request_type: 'Request', attendu: 'the close forms, listed with their id, nothing guessed' },
];

async function principal() {
  const mcp = charger(path.join(__dirname, '..', 'src', 'mcp.js'));

  const sortie = {
    quoi:
      'Run of the real second tool of "JSM Portal Answers" against the real portal, ' +
      'with request type names that are not exact',
    date: new Date().toISOString(),
    site: SITE,
    transport:
      'asUser() proxied to the REST API of the site with the caller credentials; every call is a GET, asApp() throws',
    cas: CAS.map((c) => c.cle),
    appels: [],
    outils: {},
  };

  for (const c of CAS) {
    sortie.outils[c.cle] = {
      appel: { request_type: c.request_type, portal: 'SUP' },
      attendu: c.attendu,
      reponse: await mcp.describeRequestTypeForm({ request_type: c.request_type, portal: 'SUP' }, {}),
    };
  }

  sortie.appels = appels;

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 2) + '\n', 'utf8');

  console.log('HTTP calls:');
  for (const a of appels) console.log('  ' + a.methode + ' ' + a.chemin + ' -> ' + a.status);
  console.log('written: ' + SORTIE);

  const vide = Object.entries(sortie.outils).filter(([, o]) => !o.reponse || !o.reponse.length);
  if (vide.length) {
    console.error('a tool answered nothing: ' + vide.map(([k]) => k).join(', '));
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
