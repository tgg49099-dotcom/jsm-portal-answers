'use strict';

/**
 * JSM Portal Answers — THE HARNESS OF THE TWO REAL FORMS OF THE REQUEST.
 *
 * WHAT IT PROVES
 *
 * The two MCP tools (src/mcp.js) answer correctly when the Atlassian API is
 * replaced by FIXTURES captured on the real site (test/fixtures.js): the text
 * of the answer follows the answer of the API, the calls that leave the app
 * are exactly the expected read-only ones, a refusal of the platform is a
 * refusal and not an empty list, and a site without Jira Service Management
 * says so.
 *
 * PLUS THE TWO CHECKS THAT MATTER FOR THE RESOLVER OF THE PAGE
 *
 * The platform delivers the payload of `invoke()` to a BRUT handler declared
 * in the manifest (`function: resolver`) in `req.call.payload`, and NOT in
 * `req.payload`. That is what the official code of @forge/resolver 2.0.2
 * reads (`async ({ call: { functionKey, payload, jobId }, context }, ...)`),
 * and it is what the platform delivers: the production page of 18 November
 * 2026 answered {"ok":false,"error":"UNKNOWN_FUNCTION"} because the resolver
 * read `req.payload` and found nothing there.
 *
 * So this harness runs the resolver TWICE — once with the payload in
 * `req.call.payload` (the real shape of the platform), once with the payload
 * in `req.payload` (the shape @forge/resolver hands to a function written
 * with `makeResolver()`). BOTH must answer the same thing: if one of them
 * is dropped, this harness goes RED. That is the counter-proof of the fix of
 * 19 November 2026.
 *
 * HOW IT WORKS
 *
 *   1. `@forge/api` is replaced by a STUB that records EVERY call and
 *      answers from the fixtures. The real module is never loaded, so the
 *      harness needs no network and no account.
 *   2. The `route` tag of the stub behaves like the real one (a path
 *      parameter is refused when it tries to escape the path; a query
 *      parameter is encoded).
 *   3. The module under test is loaded with the stub in place, and the real
 *      tools are called.
 *
 * WHY A COUNTER-PROOF IS NEEDED
 *
 * A test that only ever sees the same answers can be passed by code that
 * prints a hardcoded text. The harness therefore also runs the tools with
 * ANOTHER set of fixtures (other portal, other request types, other fields)
 * and REQUIRES the answers to follow: a hardcoded answer fails here. The
 * companion script test/contre-epreuve.js sabotages a copy of the module
 * and requires this harness to FAIL on it.
 *
 * USAGE
 *
 *   node test/formes-plateforme.js                 # tests src/mcp.js
 *   node test/formes-plateforme.js <file>          # tests another copy
 *
 * EXIT CODE: 0 when every check passes, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const fixtures = require('./fixtures.js');

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

const echecs = [];
const succes = [];

function verifier(nom, condition, detail) {
  if (condition) succes.push(nom);
  else echecs.push(nom + (detail ? ' — ' + detail : ''));
}

function contient(texte, attendu) {
  return typeof texte === 'string' && texte.includes(attendu);
}

// ---------------------------------------------------------------------------
// The stub of @forge/api
// ---------------------------------------------------------------------------

const appels = [];

/**
 * The `route` tag, copied from the behaviour of @forge/api 8.5.0
 * (node_modules/@forge/api/out/safeUrl.js): a path parameter is refused
 * when it tries to leave the path, a query parameter is encoded.
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
      if (
        brut.includes('..') ||
        brut.includes('/') ||
        brut.includes('\\') ||
        brut.includes('?') ||
        brut.includes('#')
      ) {
        throw new Error(
          'Disallowing path manipulation attempt. For more information see: https://go.atlassian.com/product-fetch-api-route'
        );
      }
      resultat += brut;
    }
  }
  return { value: resultat };
}

let repondu = null; // the scenario in use

const stubForgeApi = {
  route,
  asUser() {
    return {
      async requestJira(routeur, options) {
        const chemin = typeof routeur === 'string' ? routeur : routeur && routeur.value;
        const methode = (options && options.method) || 'GET';
        appels.push({ chemin, methode, options: options || {} });
        const separation = String(chemin).indexOf('?');
        const base = separation === -1 ? String(chemin) : String(chemin).slice(0, separation);
        const query = new URLSearchParams(separation === -1 ? '' : String(chemin).slice(separation + 1));
        const reponse = repondu(base, query);
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
 * Load a module with the stub of @forge/api in place.
 *
 * @param {string} fichier  the absolute path of the module to load
 * @returns {any} the module
 */
function chargerAvecStub(fichier) {
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

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function principal() {
  const fichier = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '..', 'src', 'mcp.js');

  let outils;
  try {
    outils = chargerAvecStub(fichier);
  } catch (e) {
    console.error('ECHEC — le module sous test n\'a pas pu être chargé :', e && e.message);
    process.exit(1);
  }

  verifier(
    'le module exporte les deux outils',
    typeof outils.listPortalRequestTypes === 'function' &&
      typeof outils.describeRequestTypeForm === 'function',
    'exports: ' + Object.keys(outils).join(', ')
  );
  if (typeof outils.listPortalRequestTypes !== 'function') {
    return rapporter();
  }

  // --- 1. The first tool, on the site captured on 18/11/2026 ---------------
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const sortie1 = String(
    await outils.listPortalRequestTypes({ portal: 'SUP', question: '' }, {})
  );

  verifier('outil 1 : le nom du portail est dans la reponse', contient(sortie1, 'Support'));
  verifier('outil 1 : la cle du projet est dans la reponse', contient(sortie1, 'SUP'));
  verifier(
    'outil 1 : les types de demande sont dans la reponse',
    contient(sortie1, 'Get IT help') &&
      contient(sortie1, 'Request a new account') &&
      contient(sortie1, 'Emailed request')
  );
  verifier('outil 1 : la categorie est dans la reponse', contient(sortie1, 'Logins and Accounts'));
  verifier(
    'outil 1 : la reponse dit qui peut lever la demande',
    contient(sortie1, 'you may raise it')
  );
  verifier(
    'outil 1 : la description du type de demande est dans la reponse',
    contient(sortie1, 'Get assistance for general IT problems and questions.')
  );
  verifier(
    'outil 1 : les regles du portail sont dans la reponse',
    contient(sortie1, 'Rules of this portal:') &&
      contient(sortie1, 'a request can be raised on behalf of another person: yes') &&
      contient(sortie1, 'participants can be added to a request: yes')
  );
  verifier(
    'outil 1 : la reponse dit ce que l\'API ne dit pas (SLA)',
    contient(sortie1, 'SLA targets: the public JSM REST API does not expose')
  );
  verifier(
    'outil 1 : la reponse dit avec quelle identite le portail a ete lu',
    contient(sortie1, 'read with your own Jira permissions')
  );

  // --- 2. The calls that left the app --------------------------------------
  const chemins = appels.map((a) => String(a.chemin).split('?')[0]);
  const autorises = [
    '/rest/servicedeskapi/info',
    '/rest/servicedeskapi/servicedesk',
    '/rest/servicedeskapi/servicedesk/1/requesttype',
    '/rest/servicedeskapi/servicedesk/1/requesttypegroup',
    '/rest/servicedeskapi/servicedesk/1/requesttype/1/field',
  ];
  verifier(
    'les appels de l\'outil 1 sont tous des GET',
    appels.every((a) => a.methode === 'GET'),
    'methodes: ' + JSON.stringify(appels.map((a) => a.methode))
  );
  verifier(
    'les appels de l\'outil 1 ne sortent pas de la liste des endpoints attendus',
    chemins.every((c) => autorises.includes(c)),
    'chemins: ' + JSON.stringify(chemins)
  );
  verifier(
    'les appels de l\'outil 1 sont des lectures de JSM',
    chemins.every((c) => c.startsWith('/rest/servicedeskapi/')),
    'chemins: ' + JSON.stringify(chemins)
  );

  // --- 3. The second tool ---------------------------------------------------
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const sortie2 = String(
    await outils.describeRequestTypeForm({ request_type: 'Onboard new employees', portal: 'SUP' }, {})
  );

  verifier('outil 2 : le type de demande est dans la reponse', contient(sortie2, 'Onboard new employees'));
  verifier(
    'outil 2 : les champs du formulaire sont dans la reponse',
    contient(sortie2, 'Summary') &&
      contient(sortie2, 'Employee start date') &&
      contient(sortie2, 'Attachment')
  );
  verifier(
    'outil 2 : la reponse dit quels champs sont obligatoires',
    contient(sortie2, 'required') && contient(sortie2, 'optional')
  );
  verifier(
    'outil 2 : le type du champ est donne (jiraSchema)',
    contient(sortie2, 'type: string') && contient(sortie2, 'type: date')
  );
  verifier(
    'outil 2 : l\'aide du champ est dans la reponse',
    contient(sortie2, 'If you are not sure of the exact date, put in a tentative one.')
  );
  verifier(
    'outil 2 : les regles du portail sont dans la reponse',
    contient(sortie2, 'a request can be raised on behalf of another person: yes')
  );
  verifier(
    'les appels de l\'outil 2 sont tous des GET',
    appels.every((a) => a.methode === 'GET'),
    'methodes: ' + JSON.stringify(appels.map((a) => a.methode))
  );

  // --- 4. The words of the question reach the API ----------------------------
  repondu = fixtures.scenario('principal');
  const sortieFiltre = String(
    await outils.listPortalRequestTypes({ portal: 'SUP', question: 'account' }, {})
  );
  verifier(
    'les mots de la question sont filtres par l\'API (c\'est le serveur qui filtre)',
    contient(sortieFiltre, 'Request a new account') && !contient(sortieFiltre, 'Get IT help')
  );

  // --- 5. THE ANTI-HARDCODING CHECK -----------------------------------------
  // The same code, other fixtures: a hardcoded answer would answer the same
  // thing here and would fail.
  repondu = fixtures.scenario('autre');
  const sortieAutre = String(
    await outils.listPortalRequestTypes({ portal: 'HELP', question: '' }, {})
  );
  verifier(
    'la reponse suit l\'API : autre portail, autres types de demande',
    contient(sortieAutre, 'Support Center') &&
      contient(sortieAutre, 'Laptop replacement') &&
      !contient(sortieAutre, 'Get IT help')
  );
  verifier(
    'la reponse dit qu\'on ne peut pas lever une demande restreinte',
    contient(sortieAutre, 'you may NOT raise it') && contient(sortieAutre, 'Change of address')
  );

  repondu = fixtures.scenario('autre');
  const sortieAutre2 = String(
    await outils.describeRequestTypeForm({ request_type: 'Laptop replacement', portal: 'HELP' }, {})
  );
  verifier(
    'la reponse suit l\'API : autre formulaire, autres champs',
    contient(sortieAutre2, 'Serial number') && !contient(sortieAutre2, 'Employee start date')
  );
  verifier(
    'les valeurs possibles des champs sont dans la reponse',
    contient(sortieAutre2, 'Possible values:') &&
      contient(sortieAutre2, 'Broken on arrival') &&
      contient(sortieAutre2, 'Stolen abroad')
  );
  verifier(
    'le champ cache est signale comme tel',
    contient(sortieAutre2, 'NOT visible on the portal') && contient(sortieAutre2, 'Internal notes')
  );

  // --- 6. The refusal of the platform ----------------------------------------
  repondu = fixtures.scenario('refus');
  const sortieRefus = String(await outils.listPortalRequestTypes({ portal: 'SUP' }, {}));
  verifier(
    'un 401 est un refus, pas une liste vide',
    (contient(sortieRefus, '401') || contient(sortieRefus, 'consent')) &&
      !contient(sortieRefus, 'Get IT help')
  );

  // --- 7. A site without JSM --------------------------------------------------
  repondu = fixtures.scenario('jsmInactif');
  const sortieInactif = String(await outils.listPortalRequestTypes({ portal: 'SUP' }, {}));
  verifier(
    'un site sans JSM le dit, il ne renvoie pas une liste vide',
    contient(sortieInactif, 'is not active on the site') && !contient(sortieInactif, 'Get IT help')
  );

  // --- 8. A request type that does not exist ----------------------------------
  repondu = fixtures.scenario('principal');
  const sortieInconnu = String(
    await outils.describeRequestTypeForm({ request_type: 'Type qui n existe pas', portal: 'SUP' }, {})
  );
  verifier(
    'un type de demande inconnu est un refus, pas une liste vide',
    // The refusal gives the example names, so the check is that it does NOT
    // list the request types of the site.
    contient(sortieInconnu, 'No request type was found') &&
      !contient(sortieInconnu, 'Request a new account') &&
      !contient(sortieInconnu, 'Request types (')
  );

  // --- 9. THE RESOLVER OF THE PAGE — the same answers, the same code ---------
  const cheminResolver = path.join(path.dirname(fichier), 'resolvers.js');
  if (!fs.existsSync(cheminResolver)) {
    verifier('le resolver de la page existe', false, 'absent : ' + cheminResolver);
    return rapporter();
  }

  let resolver;
  try {
    resolver = chargerAvecStub(cheminResolver);
  } catch (e) {
    verifier('le resolver de la page peut etre charge', false, e && e.message);
    return rapporter();
  }
  verifier(
    'le resolver exporte un handler',
    resolver && typeof resolver.handler === 'function'
  );

  // 9.1 The page and the tools answer THE SAME THING.
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponsePage = await resolver.handler({
    call: { functionKey: 'resolver' },
    payload: { action: 'types', portal: 'SUP', question: '' },
    context: { accountId: 'compte-de-test' },
  });
  verifier(
    'la page repond comme l\'outil (une seule implementation)',
    reponsePage && reponsePage.ok === true &&
      typeof reponsePage.answer === 'string' &&
      contient(reponsePage.answer, 'Get IT help') &&
      contient(reponsePage.answer, 'Rules of this portal:')
  );

  repondu = fixtures.scenario('principal');
  const reponsePageForm = await resolver.handler({
    call: { functionKey: 'resolver' },
    payload: { action: 'form', request_type: 'Onboard new employees', portal: 'SUP' },
    context: { accountId: 'compte-de-test' },
  });
  verifier(
    'la page decrit le formulaire comme l\'outil',
    reponsePageForm && reponsePageForm.ok === true &&
      contient(reponsePageForm.answer, 'Employee start date') &&
      contient(reponsePageForm.answer, 'required')
  );

  // 9.2 A call with NO identity reads NOTHING and is refused.
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponseAnonyme = await resolver.handler({
    call: { functionKey: 'resolver' },
    payload: { action: 'types', portal: 'SUP' },
    context: {},
  });
  verifier(
    'un appel sans compte est refuse',
    reponseAnonyme && reponseAnonyme.ok === false &&
      reponseAnonyme.error === 'NOT_AUTHENTICATED'
  );
  verifier(
    'un appel sans compte ne lit RIEN du site',
    appels.length === 0,
    'appels: ' + JSON.stringify(appels.map((a) => a.chemin))
  );

  // 9.3 The rendering call (no call at all) answers without reading.
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponseRendu = await resolver.handler({}, {});
  verifier(
    'l\'affichage de la page ne lit rien',
    reponseRendu && reponseRendu.ok === true && appels.length === 0
  );

  // 9.4 An unknown action is refused, not guessed.
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponseInconnue = await resolver.handler({
    call: { functionKey: 'resolver' },
    payload: { action: 'supprimer-tout' },
    context: { accountId: 'compte-de-test' },
  });
  verifier(
    'une action inconnue est refusee, et rien n\'est lu',
    reponseInconnue && reponseInconnue.ok === false && appels.length === 0
  );

  // ===== EXTRA : les DEUX formes reelles de la requete plateforme =====
  // (1) la forme livree par la plateforme a un handler BRUT declare dans le
  //     manifest (function: resolver) : le payload de invoke() est dans
  //     req.call.payload (voir @forge/resolver 2.0.2, out/index.js :
  //     `async ({ call: { functionKey, payload, jobId }, context }, ...)`).
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponsePlateforme = await resolver.handler({
    call: { functionKey: 'resolver', payload: { action: 'types', portal: 'SUP', question: '' } },
    context: { accountId: 'compte-de-test' },
  });
  verifier(
    'FORME PLATEFORME : le payload est dans req.call.payload',
    reponsePlateforme && reponsePlateforme.ok === true &&
      typeof reponsePlateforme.answer === 'string' &&
      contient(reponsePlateforme.answer, 'Get IT help'),
    'reponse recue : ' + JSON.stringify(reponsePlateforme).slice(0, 220)
  );

  // (2) la forme NORMALISEE (@forge/resolver : { payload, context }) :
  //     c'est celle que le harnais imite aujourd'hui, et celle d'un handler
  //     ecrit avec makeResolver(). Elle doit rester marchee.
  repondu = fixtures.scenario('principal');
  appels.length = 0;
  const reponseNormalisee = await resolver.handler({
    call: { functionKey: 'resolver' },
    payload: { action: 'types', portal: 'SUP', question: '' },
    context: { accountId: 'compte-de-test' },
  });
  verifier(
    'FORME NORMALISEE : le payload est dans req.payload',
    reponseNormalisee && reponseNormalisee.ok === true &&
      typeof reponseNormalisee.answer === 'string' &&
      contient(reponseNormalisee.answer, 'Get IT help'),
    'reponse recue : ' + JSON.stringify(reponseNormalisee).slice(0, 220)
  );

  return rapporter();
}

function rapporter() {
  console.log('');
  console.log('JSM Portal Answers — harnais hors ligne');
  console.log('  fichier teste : ' + (process.argv[2] || 'src/mcp.js'));
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
  console.error('ECHEC — le harnais a leve une exception :', e && e.stack ? e.stack : e);
  process.exit(1);
});
