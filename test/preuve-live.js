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

console.log('\nJSM Portal Answers — preuve live');
console.log('  verifications reussies : ' + reussies);
console.log('  verifications en echec  : ' + echecs);
console.log('\nRESULTAT : ' + (echecs ? 'ECHEC' : 'SUCCES'));
process.exit(echecs ? 1 : 0);
