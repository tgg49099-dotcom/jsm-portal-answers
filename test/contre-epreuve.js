'use strict';

/**
 * JSM Portal Answers — THE COUNTER-PROOF (the contre-epreuve).
 *
 * THE RULE
 *
 * A test that has never been seen RED proves nothing. This script takes a
 * COPY of the module under test, breaks it on purpose, and REQUIRES the
 * harness (test/harnais.js) to fail on the broken copy. If the harness
 * still says "SUCCES" on a sabotaged module, the harness is worthless and
 * the whole test suite must be rewritten.
 *
 * THE SABOTAGES
 *
 *   A. The request types are hardcoded: the answer no longer follows the
 *      API (this is exactly the failure the accessibility checker of the
 *      other slot had: a resolver that answered a hardcoded value and
 *      passed every test).
 *   B. The whole answer is a constant string.
 *   C. The fields of the form are hardcoded.
 *
 * The copy of the module is loaded FROM ITS OWN DIRECTORY, with its own
 * copy of jsm.js: the sabotage must be the ONLY difference with the code
 * that is deployed.
 *
 * EXIT CODE: 0 when every sabotage is caught, 1 otherwise.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RACINE = path.resolve(__dirname, '..');
const HARNais = path.join(__dirname, 'harnais.js');

/**
 * Copy the module, its sibling and the resolver of the page into a temporary
 * directory. The resolver is copied too, because it calls the module under
 * test: a sabotage that only breaks the tools must also break the page.
 *
 * @returns {string} the path of the copy of mcp.js
 */
function preparerCopie() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pja-sabotage-'));
  fs.copyFileSync(path.join(RACINE, 'src', 'mcp.js'), path.join(dir, 'mcp.js'));
  fs.copyFileSync(path.join(RACINE, 'src', 'jsm.js'), path.join(dir, 'jsm.js'));
  fs.copyFileSync(path.join(RACINE, 'src', 'resolvers.js'), path.join(dir, 'resolvers.js'));
  return path.join(dir, 'mcp.js');
}

/**
 * Replace a piece of source. It FAILS LOUDLY when the piece is not found:
 * a sabotage that did not happen would prove nothing.
 *
 * @param {string} source
 * @param {string} avant
 * @param {string} apres
 * @returns {string} the new source
 */
function saboter(source, avant, apres) {
  if (!source.includes(avant)) {
    throw new Error(
      'La contre-epreuve ne peut pas saboter : le morceau de code attendu est introuvable ->\n' + avant
    );
  }
  return source.replace(avant, apres);
}

/**
 * Run the harness on a file and return its exit code and output.
 *
 * @param {string} fichier
 * @returns {{code: number, sortie: string}}
 */
function lancerHarnais(fichier) {
  try {
    const sortie = execFileSync(process.execPath, [HARNais, fichier], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, sortie };
  } catch (e) {
    return {
      code: typeof e.status === 'number' ? e.status : 1,
      sortie: (e.stdout || '') + (e.stderr || ''),
    };
  }
}

const sabotages = [
  {
    nom: 'A — les types de demande sont codes en dur',
    appliquer(source) {
      return saboter(
        source,
        'const types = jsm.valeurs(repTypes.body);',
        "const types = [{ id: '999', name: 'Hardcoded request type', canCreateRequest: true }];"
      );
    },
  },
  {
    nom: 'B — la reponse entiere est une constante',
    appliquer(source) {
      return saboter(
        source,
        "  lignes.push(ligneIdentite());\n  return lignes.join('\\n');",
        "  lignes.push(ligneIdentite());\n  return 'JSM Portal Answers — everything is fine.';"
      );
    },
  },
  {
    nom: 'C — les champs du formulaire sont codes en dur',
    appliquer(source) {
      return saboter(
        source,
        'const champs = Array.isArray(meta.requestTypeFields) ? meta.requestTypeFields : [];',
        "const champs = [{ fieldId: 'x', name: 'Hardcoded field', required: true, visible: true }];"
      );
    },
  },
];

const echecs = [];

console.log('');
console.log('JSM Portal Answers — contre-epreuve');
console.log('');

// 0. The harness must PASS on the real code. Otherwise there is nothing to
//    prove: a harness that fails on the real code proves nothing either.
const reference = lancerHarnais(path.join(RACINE, 'src', 'mcp.js'));
if (reference.code !== 0) {
  console.log('ECHEC — le harnais ne passe meme pas sur le code reel :');
  console.log(reference.sortie);
  process.exit(1);
}
console.log('  reference : le harnais passe sur le code reel (exit 0) — bien.');

for (const sabotage of sabotages) {
  const fichier = preparerCopie();
  const source = fs.readFileSync(fichier, 'utf8');
  let sabote;
  try {
    sabote = sabotage.appliquer(source);
  } catch (e) {
    console.log('  ECHEC — ' + sabotage.nom + ' : ' + e.message);
    echecs.push(sabotage.nom);
    continue;
  }
  fs.writeFileSync(fichier, sabote);

  const resultat = lancerHarnais(fichier);
  if (resultat.code !== 0) {
    const lignesEchec = resultat.sortie
      .split('\n')
      .filter((l) => l.includes('ECHEC —'))
      .slice(0, 3)
      .map((l) => l.trim());
    console.log('  OK — ' + sabotage.nom + ' : le harnais a bien ECHOUE (exit ' + resultat.code + ')');
    for (const l of lignesEchec) console.log('        ' + l);
  } else {
    console.log('  ECHEC — ' + sabotage.nom + ' : le harnais a reussi sur le code sabote (exit 0)');
    echecs.push(sabotage.nom);
  }
}

console.log('');
if (echecs.length) {
  console.log('CONTRE-EPREUVE : ECHEC (' + echecs.length + ' sabotage(s) non detecte(s))');
  process.exit(1);
}
console.log('CONTRE-EPREUVE : SUCCES — chaque sabotage a bien rendu le harnais ROUGE.');
process.exit(0);
