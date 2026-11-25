'use strict';

/**
 * run-outils-live-questions.js — run the REAL tools against the REAL portal,
 * with the questions a judge (or an MCP client) actually asks.
 *
 * WHAT THIS SCRIPT IS
 * -------------------
 * tools/run-tool-live.js shows that the two tools answer on the live portal.
 * This one shows the two behaviours that were added on 25 November 2026, on
 * the live portal and not only on the fixtures:
 *
 *   1. a question made of SEVERAL WORDS ("my laptop is broken") — the
 *      server-side `searchQuery` filter matches the phrase as one string and
 *      finds nothing; the fallback re-reads the portal (same GET, same
 *      identity) and lists the request types that contain at least one of the
 *      words, best match first, and says so;
 *   2. the list of every page of a list, not only the first one.
 *
 * The transport is replaced, never the code: `asUser()` is proxied to the
 * site's own REST API with the caller's own credentials, exactly as in
 * tools/run-tool-live.js. The DATA is the real data of the real portal.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * It never writes: every call is a GET, and `asApp()` throws.
 *
 * Usage:
 *   FORGE_EMAIL=… FORGE_API_TOKEN=… node tools/run-outils-live-questions.js [site] [sortie.json]
 * Exit code: 0 when every call answered, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

const SITE = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://tgg-dev.atlassian.net';
const SORTIE = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(__dirname, '..', 'docs', 'devpost', 'preuves', 'run-outils-live-questions-2026-11-25.json');
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
 * The questions of this run. The first one is the one that used to answer
 * "none found"; the second one is the plain list, for the comparison.
 */
const QUESTIONS = [
  { cle: 'plusieurs_mots', question: 'my laptop is broken' },
  { cle: 'phrase_exacte', question: 'Get IT help' },
];

async function principal() {
  const mcp = charger(path.join(__dirname, '..', 'src', 'mcp.js'));

  const sortie = {
    quoi:
      'Run of the two real tools of "JSM Portal Answers" against the real portal, ' +
      'with the questions a judge asks (several words, one phrase)',
    date: new Date().toISOString(),
    site: SITE,
    transport:
      'asUser() proxied to the REST API of the site with the caller credentials; every call is a GET, asApp() throws',
    questions: QUESTIONS.map((q) => q.cle),
    appels: [],
    outils: {},
  };

  for (const q of QUESTIONS) {
    sortie.outils[q.cle] = {
      appel: { portal: 'SUP', question: q.question },
      reponse: await mcp.listPortalRequestTypes({ portal: 'SUP', question: q.question }, {}),
    };
  }

  sortie.outils.formulaire = {
    appel: { request_type: 'Get IT help', portal: 'SUP' },
    reponse: await mcp.describeRequestTypeForm({ request_type: 'Get IT help', portal: 'SUP' }, {}),
  };

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
