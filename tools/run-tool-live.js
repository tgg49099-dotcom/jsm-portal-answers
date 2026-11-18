'use strict';

/**
 * run-tool-live.js — run the TWO REAL TOOLS against the REAL portal.
 *
 * WHAT THIS SCRIPT IS
 * -------------------
 * The Codegeist gallery must show real answers, not drawings. This script
 * calls the very handlers the manifest declares (`mcp.listPortalRequestTypes`
 * and `mcp.describeRequestTypeForm`) — the same functions, the same code, the
 * same text — and lets them read the live Jira Service Management portal.
 *
 * The only thing replaced is the TRANSPORT: `asUser()` is proxied to the
 * site's own REST API with the caller's own credentials (the owner's API
 * token), because the Forge runtime that would normally carry the caller's
 * consent token does not exist outside a deployed function. The DATA the
 * tools see is therefore the real data of the real portal, read with the real
 * identity, through the real endpoints of src/jsm.js.
 *
 * WHAT IT NEVER DOES
 * ------------------
 * It never writes: every call it makes is a GET, and `asApp()` throws.
 *
 * Usage:
 *   FORGE_EMAIL=… FORGE_API_TOKEN=… node tools/run-tool-live.js [site] [sortie.json]
 * Exit code: 0 when both tools answered, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

const SITE = process.argv[2] && process.argv[2].startsWith('http') ? process.argv[2] : 'https://tgg-dev.atlassian.net';
const SORTIE = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'docs', 'devpost', 'preuves', 'run-outils-live-2026-11-18.json');
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
 *
 * @param {string} chemin  the path built by `route`
 * @returns {Promise<{status: number, body: any}>}
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
 *
 * @param {string} fichier
 * @returns {any}
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

async function principal() {
  const mcp = charger(path.join(__dirname, '..', 'src', 'mcp.js'));

  const sortie = {
    quoi: 'Run of the two real tools of "JSM Portal Answers" against the real portal',
    date: new Date().toISOString(),
    site: SITE,
    transport:
      'asUser() proxied to the REST API of the site with the caller credentials (the Forge runtime is not available outside a deployed function); every call is a GET, asApp() throws',
    appels: [],
    outils: {},
  };

  sortie.outils.list_portal_request_types = {
    appel: { portal: 'SUP' },
    reponse: await mcp.listPortalRequestTypes({ portal: 'SUP' }, {}),
  };
  sortie.outils.describe_request_type_form = {
    appel: { request_type: 'Get IT help', portal: 'SUP' },
    reponse: await mcp.describeRequestTypeForm({ request_type: 'Get IT help', portal: 'SUP' }, {}),
  };
  sortie.appels = appels;

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(sortie, null, 2) + '\n', 'utf8');

  console.log('HTTP calls:');
  for (const a of appels) console.log('  ' + a.methode + ' ' + a.chemin + ' -> ' + a.status);
  console.log('written: ' + SORTIE);
  const vide = Object.values(sortie.outils).filter((o) => !o.reponse || !o.reponse.length);
  if (vide.length) {
    console.error('a tool answered nothing');
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
