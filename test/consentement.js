'use strict';

/**
 * JSM Portal Answers — THE CONSENT OF THE USER MUST NOT BE SWALLOWED.
 *
 * WHAT IT PROVES
 *
 * Atlassian's own rule (developer.atlassian.com/platform/forge/apis-reference/
 * fetch-api-product.requestjira/, read on 19 November 2026):
 *
 *   "If the API returns a 401 and there isn't a valid Authorization header,
 *    then an Error is thrown."
 *   "If this error isn't caught, the user is prompted to grant access to the
 *    app."
 *   "If the user grants access, the app is re-initialized."
 *
 * So when the platform says "this user has not granted access to the app",
 * the error MUST reach the platform. If the app catches it, the user never
 * sees the "allow access" screen and can never grant anything: the page only
 * says that "the API could not be read", and the app looks broken to the
 * person who installs it.
 *
 * These checks therefore require:
 *
 *   1. the error of the platform reaches the caller of the resolver, for the
 *      two real shapes of the request and for the two actions;
 *   2. EVERY OTHER error is still caught and answered in words — the page
 *      must never show a raw stack trace;
 *   3. a 401 that is a real ANSWER of the API (the user is signed in but is
 *      not allowed to read) is still a refusal in words, not a crash.
 *
 * THE COUNTER-PROOF: with the code of 18 November 2026 (which caught
 * everything), check 1 is RED — the resolver answers a string instead of
 * letting the error through.
 *
 * USAGE
 *
 *   node test/consentement.js
 *
 * EXIT CODE: 0 when every check passes, 1 otherwise.
 */

const Module = require('module');
const path = require('path');

const echecs = [];
const succes = [];

function verifier(nom, condition, detail) {
  if (condition) succes.push(nom);
  else echecs.push(nom + (detail ? ' — ' + detail : ''));
}

// ---------------------------------------------------------------------------
// The stub of @forge/api
// ---------------------------------------------------------------------------

let mode = 'ok'; // 'ok' | 'auth' | 'boom' | 'refus401'

const erreurs = {
  auth: Object.assign(new Error('Authentication Required'), {
    name: 'NEEDS_AUTHENTICATION_ERR',
    status: 401,
  }),
  boom: new Error('the network is on fire'),
};

const stubForgeApi = {
  route(strings, ...valeurs) {
    let resultat = '';
    for (let i = 0; i < strings.length; i++) {
      resultat += strings[i];
      if (i >= valeurs.length) break;
      resultat += encodeURIComponent(String(valeurs[i]));
    }
    return { value: resultat };
  },
  asUser() {
    return {
      async requestJira() {
        if (mode === 'auth') throw erreurs.auth;
        if (mode === 'boom') throw erreurs.boom;
        if (mode === 'refus401') {
          return {
            status: 401,
            async json() {
              return { errorMessages: ['You do not have permission'] };
            },
          };
        }
        return {
          status: 200,
          async json() {
            return {};
          },
        };
      },
    };
  },
  asApp() {
    throw new Error('asApp() must never be called by this app');
  },
};

function chargerAvecStub(fichier) {
  const original = Module._load;
  Module._load = function (request) {
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

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

async function principal() {
  const fichier = path.resolve(__dirname, '..', 'src', 'resolvers.js');
  const resolver = chargerAvecStub(fichier);
  verifier('le resolver exporte un handler', resolver && typeof resolver.handler === 'function');

  const repondre = async (req) => {
    try {
      return { leve: false, valeur: await resolver.handler(req, {}) };
    } catch (e) {
      return { leve: true, erreur: e };
    }
  };

  const contexte = { accountId: 'compte-de-test' };
  const plateforme = (action, extra) => ({
    call: { functionKey: 'resolver', payload: Object.assign({ action: action }, extra || {}) },
    context: contexte,
  });
  const normalisee = (action, extra) => ({
    call: { functionKey: 'resolver' },
    payload: Object.assign({ action: action }, extra || {}),
    context: contexte,
  });

  // --- 1. The error of the platform MUST reach the caller --------------------
  mode = 'auth';

  const r1 = await repondre(plateforme('types', { portal: 'SUP' }));
  verifier(
    "FORME PLATEFORME : l'erreur d'acces est laissee remonter (action types)",
    r1.leve && r1.erreur && r1.erreur.name === 'NEEDS_AUTHENTICATION_ERR',
    'leve: ' + r1.leve + ' — ' + (r1.erreur ? r1.erreur.name + ': ' + r1.erreur.message : JSON.stringify(r1.valeur))
  );

  const r2 = await repondre(normalisee('types', { portal: 'SUP' }));
  verifier(
    "FORME NORMALISEE : l'erreur d'acces est laissee remonter (action types)",
    r2.leve && r2.erreur && r2.erreur.name === 'NEEDS_AUTHENTICATION_ERR',
    'leve: ' + r2.leve + ' — ' + (r2.erreur ? r2.erreur.name : JSON.stringify(r2.valeur))
  );

  const r3 = await repondre(plateforme('form', { request_type: 'Get IT help', portal: 'SUP' }));
  verifier(
    "FORME PLATEFORME : l'erreur d'acces est laissee remonter (action form)",
    r3.leve && r3.erreur && r3.erreur.name === 'NEEDS_AUTHENTICATION_ERR',
    'leve: ' + r3.leve + ' — ' + (r3.erreur ? r3.erreur.name : JSON.stringify(r3.valeur))
  );

  // --- 2. Every OTHER error is still caught and answered in words ------------
  mode = 'boom';
  const r4 = await repondre(plateforme('types', { portal: 'SUP' }));
  verifier(
    "une erreur ordinaire est encore attrapee et repondue en mots",
    !r4.leve && r4.valeur && r4.valeur.ok === true && typeof r4.valeur.answer === 'string' &&
      /could not be read/i.test(r4.valeur.answer),
    'leve: ' + r4.leve + ' — ' + JSON.stringify(r4.valeur).slice(0, 220)
  );
  verifier(
    "une erreur ordinaire ne montre jamais de trace d'appel",
    !r4.leve && typeof r4.valeur.answer === 'string' && !/\n\s+at /.test(r4.valeur.answer),
    r4.leve ? 'erreur laissee remonter' : String(r4.valeur && r4.valeur.answer).slice(0, 220)
  );

  // --- 3. A 401 that is a real ANSWER of the API stays a refusal ------------
  mode = 'refus401';
  const r5 = await repondre(plateforme('types', { portal: 'SUP' }));
  verifier(
    "un 401 reellement repondu par l'API est un refus en mots, pas une exception",
    !r5.leve && r5.valeur && r5.valeur.ok === true && typeof r5.valeur.answer === 'string' &&
      /401|permission|consent/i.test(r5.valeur.answer),
    'leve: ' + r5.leve + ' — ' + JSON.stringify(r5.valeur).slice(0, 220)
  );

  // --- 4. The client of JSM keeps the rule ----------------------------------
  const jsm = chargerAvecStub(path.resolve(__dirname, '..', 'src', 'jsm.js'));
  const regle = typeof jsm.erreurAutorisation === 'function' ? jsm.erreurAutorisation : null;
  verifier('le client JSM exporte la regle de l\'erreur d\'acces', regle !== null);
  if (regle) {
    mode = 'auth';
    verifier(
      "le client JSM reconnait l'erreur d'acces",
      regle(erreurs.auth) === true &&
        regle(new Error('the network is on fire')) === false &&
        regle(null) === false
    );
  }

  // --- 5. The identity check still comes first ------------------------------
  mode = 'auth';
  const r6 = await repondre({
    call: { functionKey: 'resolver', payload: { action: 'types', portal: 'SUP' } },
    context: {},
  });
  verifier(
    "un appel sans compte est refuse SANS lire (l'erreur d'acces n'est pas levee)",
    !r6.leve && r6.valeur && r6.valeur.ok === false && r6.valeur.error === 'NOT_AUTHENTICATED',
    'leve: ' + r6.leve + ' — ' + JSON.stringify(r6.valeur)
  );

  console.log('');
  console.log('JSM Portal Answers — consentement de l\'utilisateur');
  console.log('  verifications reussies : ' + succes.length);
  console.log('  verifications en echec  : ' + echecs.length);
  if (echecs.length) {
    console.log('');
    for (const e of echecs) console.log('  ECHEC — ' + e);
    console.log('');
    console.log('RESULTAT : ECHEC');
    process.exit(1);
  }
  console.log('');
  console.log('RESULTAT : SUCCES');
  process.exit(0);
}

principal().catch((e) => {
  console.error('ECHEC — le test a leve une exception :', e && e.stack ? e.stack : e);
  process.exit(1);
});
