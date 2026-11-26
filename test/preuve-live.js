'use strict';

/**
 * JSM Portal Answers — THE "LIVE PROOF" TEST.
 *
 * WHAT IT PROVES
 *
 * The README quotes the live runs kept in docs/devpost/preuves/ ("N GET calls,
 * all HTTP 200"). A judge who opens the JSON file next to the README must find
 * the same number. For every sentence of the README that names a proof file
 * and a number of GET calls, this test reads that file and checks:
 *
 *   1. the number of calls written in the README = the number of calls kept;
 *   2. every call kept is a GET;
 *   3. every call kept answered HTTP 200 (when the README says so).
 *   4. the Devpost kit quotes the same proofs with the same numbers, and names
 *      the same production version as the README.
 *
 * COUNTER-PROOF: the same check run on a copy of the README with the number
 * changed must FAIL. A test that passes on a wrong README proves nothing.
 *
 * USAGE: node test/preuve-live.js      EXIT CODE: 0 when every check passes.
 */

const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

function verifier(readme) {
  const erreurs = [];
  const phrases = [];
  const re = /(docs\/devpost\/preuves\/[\w.-]+\.json)`?,\s*(\d+)\s+GET calls(,\s*all HTTP 200)?/g;
  let m;
  while ((m = re.exec(readme)) !== null) phrases.push({ fichier: m[1], annonce: Number(m[2]), tous200: Boolean(m[3]) });
  if (!phrases.length) erreurs.push('the README quotes no live proof with a number of GET calls');
  for (const p of phrases) {
    const chemin = path.join(RACINE, p.fichier);
    if (!fs.existsSync(chemin)) { erreurs.push(p.fichier + ': file not found'); continue; }
    const appels = JSON.parse(fs.readFileSync(chemin, 'utf8')).appels || [];
    if (appels.length !== p.annonce) erreurs.push(p.fichier + ': README says ' + p.annonce + ' GET calls, the proof keeps ' + appels.length);
    const pasGet = appels.filter((a) => a.methode !== 'GET').length;
    if (pasGet) erreurs.push(p.fichier + ': ' + pasGet + ' call(s) are not GET');
    if (p.tous200) {
      const pas200 = appels.filter((a) => a.status !== 200).length;
      if (pas200) erreurs.push(p.fichier + ': ' + pas200 + ' call(s) did not answer HTTP 200');
    }
  }
  return { phrases, erreurs };
}

const readme = fs.readFileSync(path.join(RACINE, 'README.md'), 'utf8');
let echecs = 0;
let reussies = 0;

const reel = verifier(readme);
for (const p of reel.phrases) console.log('  proof quoted: ' + p.fichier + ' — ' + p.annonce + ' GET calls');
if (reel.erreurs.length) { echecs += reel.erreurs.length; reel.erreurs.forEach((e) => console.log('  ECHEC — ' + e)); }
else { reussies += 1; console.log('  OK — the README and the proof files say the same thing'); }

// Counter-proof: a wrong number of calls in the README must be caught.
const faux = readme.replace(/(docs\/devpost\/preuves\/[\w.-]+\.json`?,\s*)(\d+)(\s+GET calls)/, (t, a, n, b) => a + (Number(n) + 100) + b);
const contre = verifier(faux);
if (faux !== readme && contre.erreurs.length) { reussies += 1; console.log('  OK — counter-proof: a README with a wrong number of calls is caught'); }
else { echecs += 1; console.log('  ECHEC — counter-proof: a wrong number was not caught'); }

// The Devpost kit (docs/devpost/BLOCS-DEVPOST-22-11-ENTREE2.txt) is what a judge
// reads first. It must quote the same proofs with the same numbers, and name the
// same production version as the README.
const KIT = path.join(RACINE, 'docs', 'devpost', 'BLOCS-DEVPOST-22-11-ENTREE2.txt');

function verifierKit(kit, readmeTexte) {
  const erreurs = [];
  const phrases = [];
  const re = /(\d+) GET calls, all HTTP 200: https:\/\/raw\.githubusercontent\.com\/\S+?\/(docs\/devpost\/preuves\/[\w.-]+\.json)/g;
  let m;
  while ((m = re.exec(kit)) !== null) phrases.push({ fichier: m[2], annonce: Number(m[1]) });
  if (!phrases.length) erreurs.push('the Devpost kit quotes no live proof with a number of GET calls');
  for (const p of phrases) {
    const chemin = path.join(RACINE, p.fichier);
    if (!fs.existsSync(chemin)) { erreurs.push('kit: ' + p.fichier + ': file not found'); continue; }
    const appels = JSON.parse(fs.readFileSync(chemin, 'utf8')).appels || [];
    if (appels.length !== p.annonce) erreurs.push('kit: ' + p.fichier + ': the kit says ' + p.annonce + ' GET calls, the proof keeps ' + appels.length);
    if (appels.some((a) => a.methode !== 'GET' || a.status !== 200)) erreurs.push('kit: ' + p.fichier + ': a call is not a GET answered HTTP 200');
  }
  const vReadme = /\*\*production (\d+\.\d+\.\d+)\*\*/.exec(readmeTexte);
  const vKit = /The version in production is (\d+\.\d+\.\d+)/.exec(kit);
  if (!vReadme || !vKit) erreurs.push('the production version is not named in the README and in the kit');
  else if (vReadme[1] !== vKit[1]) erreurs.push('the README says production ' + vReadme[1] + ', the Devpost kit says ' + vKit[1]);
  return { phrases, erreurs, version: vKit ? vKit[1] : null };
}

const kit = fs.readFileSync(KIT, 'utf8');
const k = verifierKit(kit, readme);
for (const p of k.phrases) console.log('  proof quoted by the Devpost kit: ' + p.fichier + ' — ' + p.annonce + ' GET calls');
if (k.erreurs.length) { echecs += k.erreurs.length; k.erreurs.forEach((e) => console.log('  ECHEC — ' + e)); }
else { reussies += 1; console.log('  OK — the Devpost kit, the README and the proofs agree (production ' + k.version + ')'); }

// Counter-proofs: a wrong number of calls, or another production version, in the kit must be caught.
const kitFauxNombre = kit.replace(/(\d+)( GET calls, all HTTP 200: https:\/\/raw)/, (t, n, b) => (Number(n) + 100) + b);
if (kitFauxNombre !== kit && verifierKit(kitFauxNombre, readme).erreurs.length) { reussies += 1; console.log('  OK — counter-proof: a kit with a wrong number of calls is caught'); }
else { echecs += 1; console.log('  ECHEC — counter-proof: a wrong number in the kit was not caught'); }
const kitFausseVersion = kit.replace(/(The version in production is )(\d+)\.(\d+)\.(\d+)/, (t, a, x, y, z) => a + x + '.' + y + '.' + (Number(z) + 7));
if (kitFausseVersion !== kit && verifierKit(kitFausseVersion, readme).erreurs.length) { reussies += 1; console.log('  OK — counter-proof: a kit with another production version is caught'); }
else { echecs += 1; console.log('  ECHEC — counter-proof: another version in the kit was not caught'); }

console.log('\nJSM Portal Answers — preuve live');
console.log('  verifications reussies : ' + reussies);
console.log('  verifications en echec  : ' + echecs);
console.log('\nRESULTAT : ' + (echecs ? 'ECHEC' : 'SUCCES'));
process.exit(echecs ? 1 : 0);
