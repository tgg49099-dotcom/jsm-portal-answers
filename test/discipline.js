'use strict';

/**
 * JSM Portal Answers — THE DISCIPLINE (the static checks).
 *
 * These checks read the source and the manifest, and count what they must
 * NOT contain. They are the mechanical version of the promises the manifest
 * makes:
 *
 *   * the app reads with the caller's identity and never with the app's own
 *     identity (zero `asApp()`);
 *   * the app writes nothing and stores nothing (no storage, no KVS, no
 *     entity);
 *   * the app calls no external service (no absolute URL in the code);
 *   * the app only ever READS the Atlassian API (every call is a GET);
 *   * the manifest declares exactly ONE `rovo:mcp` module, with the two
 *     read-only tools, and no scope that could write anything;
 *   * the manifest carries NO licence key — an app with a licence cannot be
 *     shared with an installation link, and the judges need the link.
 *
 * EXIT CODE: 0 when every rule holds, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const RACINE = path.resolve(__dirname, '..');

const echecs = [];
let reussies = 0;

function verifier(nom, condition, detail) {
  if (condition) reussies += 1;
  else echecs.push(nom + (detail ? ' — ' + detail : ''));
}

// ---------------------------------------------------------------------------
// The source code
// ---------------------------------------------------------------------------

const fichiersSource = fs
  .readdirSync(path.join(RACINE, 'src'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ nom: f, texte: fs.readFileSync(path.join(RACINE, 'src', f), 'utf8') }));

/**
 * The code without its comments: a URL quoted in a comment is documentation,
 * a URL in the code is a call to an external service.
 *
 * @param {string} texte
 * @returns {string}
 */
function sansCommentaires(texte) {
  return texte
    .split('\n')
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join('\n');
}

const code = sansCommentaires(fichiersSource.map((f) => f.texte).join('\n'));

verifier(
  'le code n\'appelle JAMAIS asApp()',
  !code.includes('asApp('),
  'occurrences: ' + (code.match(/asApp\(/g) || []).length
);
verifier(
  'le code n\'ecrit rien : ni storage, ni kvs, ni entity',
  !/\bstorage\b|\bkvs\b|\bentity\b/.test(code),
  'occurrences: ' + (code.match(/\bstorage\b|\bkvs\b|\bentity\b/g) || []).join(', ')
);
verifier(
  'le code n\'appelle aucun service externe (aucune URL absolue dans le code)',
  !/https?:\/\//.test(code),
  'occurrences: ' + (code.match(/https?:\/\//g) || []).length
);
verifier(
  'le code n\'appelle aucune autre API que requestJira',
  !/\bfetch\s*\(|require\(['"]https?['"]\)|axios/.test(code)
);
const fichiersAvecRequestJira = fichiersSource
  .filter((f) => f.texte.includes('requestJira'))
  .map((f) => f.nom);
verifier(
  'toutes les lectures de l\'API passent par src/jsm.js',
  fichiersAvecRequestJira.length === 1 && fichiersAvecRequestJira[0] === 'jsm.js',
  'fichiers: ' + fichiersAvecRequestJira.join(', ')
);
const codeJsm = sansCommentaires(
  fichiersSource.filter((f) => f.nom === 'jsm.js').map((f) => f.texte).join('\n')
);
verifier(
  'aucune ecriture : le client JSM ne demande que la methode GET',
  !/method\s*:/.test(codeJsm),
  'occurrences de "method:": ' + (codeJsm.match(/method\s*:/g) || []).length
);
verifier(
  'aucune ecriture : aucune suppression, aucune mise a jour dans le client JSM',
  !/\.delete\(|\.put\(|\.post\(|\.patch\(/.test(codeJsm)
);

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

const manifeste = yaml.load(fs.readFileSync(path.join(RACINE, 'manifest.yml'), 'utf8'));
const modules = manifeste.modules || {};

const modulesMcp = modules['rovo:mcp'];
verifier(
  'le manifeste declare UN SEUL module rovo:mcp',
  Array.isArray(modulesMcp) && modulesMcp.length === 1,
  'declares: ' + JSON.stringify(modulesMcp)
);

const outilsMcp = modulesMcp && modulesMcp[0] && modulesMcp[0].tools;
verifier(
  'le module rovo:mcp expose DEUX outils',
  Array.isArray(outilsMcp) && outilsMcp.length === 2,
  'outils: ' + JSON.stringify(outilsMcp)
);

const actions = modules.action || [];
verifier(
  'chaque outil du module rovo:mcp est une action declaree',
  Array.isArray(outilsMcp) && outilsMcp.every((t) => actions.some((a) => a.key === t))
);
verifier(
  'chaque action est en LECTURE SEULE (actionVerb: GET)',
  actions.length > 0 && actions.every((a) => a.actionVerb === 'GET'),
  JSON.stringify(actions.map((a) => a.key + ':' + a.actionVerb))
);
verifier(
  'chaque action declare une fonction qui existe dans le manifeste',
  actions.every((a) => (modules.function || []).some((f) => f.key === a.function))
);

// The handlers of the `function` modules must exist in the source.
for (const f of modules.function || []) {
  const [fichier, fn] = String(f.handler).split('.');
  const chemin = path.join(RACINE, 'src', fichier + '.js');
  const existe = fs.existsSync(chemin);
  let exporte = false;
  if (existe) {
    const texte = fs.readFileSync(chemin, 'utf8');
    exporte = new RegExp('exports\\.' + fn + '\\b').test(texte);
  }
  verifier('le handler ' + f.handler + ' existe et est exporte', existe && exporte);
}

const scopes = (manifeste.permissions && manifeste.permissions.scopes) || [];
verifier(
  'le manifeste ne declare QUE des scopes de lecture',
  scopes.length > 0 && scopes.every((s) => s.startsWith('read:')),
  'scopes: ' + scopes.join(', ')
);
verifier(
  'le manifeste declare le scope JSM en lecture',
  scopes.includes('read:servicedesk-request'),
  'scopes: ' + scopes.join(', ')
);
verifier(
  'le manifeste ne contient AUCUNE cle license (le lien d\'installation doit rester possible)',
  !Object.prototype.hasOwnProperty.call(manifeste, 'license') &&
    !JSON.stringify(manifeste).includes('"license"')
);
verifier(
  'le manifeste declare un app.id de la forme attendue',
  /^ari:cloud:ecosystem::app\/[0-9a-f-]{36}$/.test(String((manifeste.app || {}).id || '')),
  String((manifeste.app || {}).id)
);
verifier(
  'le manifeste ne declare aucun module public (webtrigger)',
  !Object.keys(modules).some((k) => k.includes('webtrigger'))
);

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

console.log('');
console.log('JSM Portal Answers — discipline');
console.log('  regles verifiees : ' + reussies);
console.log('  regles en echec  : ' + echecs.length);
if (echecs.length) {
  console.log('');
  for (const e of echecs) console.log('  ECHEC — ' + e);
  console.log('');
  console.log('DISCIPLINE : ECHEC');
  process.exit(1);
}
console.log('');
console.log('DISCIPLINE : SUCCES');
process.exit(0);
