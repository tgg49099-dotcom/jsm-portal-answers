'use strict';

/**
 * verifier-blocs-entree2.js — the control script of the Devpost kit of the
 * second Codegeist entry ("JSM Portal Answers").
 *
 * WHAT IT CHECKS
 * --------------
 *   1. every block of the kit exists, and its content is under its limit;
 *   2. the table of the lengths of the blocks is printed (raw count);
 *   3. MOTS_CLES holds exactly 5 keywords;
 *   4. the two blocks that need a human gesture hold the one marker that is
 *      accepted, and no other block holds a marker;
 *   5. the text is ASCII (no accent, no typographic dash), and holds none of
 *      the forbidden words (TODO, FIXME, Lorem, compliance, compliant,
 *      conform, the ellipsis, the square brackets);
 *   6. every link of the kit is frozen on a 40-character commit SHA;
 *   7. with --http, every link of the kit answers HTTP 200.
 *
 * Usage:
 *   node tools/verifier-blocs-entree2.js [chemin-du-kit] [--http]
 * Exit code: 0 when every check passes, 1 otherwise.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const RACINE = path.resolve(__dirname, '..');
const KIT_DEFAUT = path.join(RACINE, 'docs', 'devpost', 'BLOCS-DEVPOST-22-11-ENTREE2.txt');

// The limits. LINK_INSTALLATION has none: the signed installation URL of a
// Forge app is about 1435 characters long and must never be truncated.
const LIMITES = {
  TITRE: 60,
  DESCRIPTION: 1200,
  DESCRIPTION_ETENDUE: 1200,
  CATEGORIE: 120,
  MOTS_CLES: 200,
  BONUS: 1200,
  LIENS: 4000,
  VIDEO: 1000,
  INSTALLATION: 3000,
  LINK_INSTALLATION: null,
  TECH: 1200,
  VIGNETTE_ET_GALERIE: 4000,
};

const ORDRE = [
  'TITRE',
  'DESCRIPTION',
  'DESCRIPTION_ETENDUE',
  'CATEGORIE',
  'MOTS_CLES',
  'BONUS',
  'LIENS',
  'VIDEO',
  'INSTALLATION',
  'LINK_INSTALLATION',
  'TECH',
  'VIGNETTE_ET_GALERIE',
];

const A_REMPLIR = '[[A_COMPLETER_PAR_LE_PROPRIETAIRE';
const INTERDITS = ['TODO', 'FIXME', 'Lorem', 'compliance', 'compliant', 'conform', '...', '[', ']'];

const echecs = [];
let reussies = 0;

function verifier(nom, condition, detail) {
  if (condition) {
    reussies += 1;
    console.log('  OK   ' + nom);
  } else {
    echecs.push(nom + (detail ? ' - ' + detail : ''));
    console.log('  RED  ' + nom + (detail ? ' - ' + detail : ''));
  }
}

/**
 * Read the blocks of the kit.
 *
 * @param {string} chemin
 * @returns {Map<string, string>}
 */
function lireBlocs(chemin) {
  const texte = fs.readFileSync(chemin, 'utf8');
  const blocs = new Map();
  const motif = /=== DEBUT ([A-Z_]+) ===\n([\s\S]*?)\n=== FIN \1 ===/g;
  let m = motif.exec(texte);
  while (m !== null) {
    blocs.set(m[1], m[2]);
    m = motif.exec(texte);
  }
  return blocs;
}

/**
 * Every link of a text.
 *
 * @param {string} texte
 * @returns {string[]}
 */
function liens(texte) {
  const trouve = [];
  const motif = /https?:\/\/[^\s)]+/g;
  let m = motif.exec(texte);
  while (m !== null) {
    trouve.push(m[0]);
    m = motif.exec(texte);
  }
  return trouve;
}

/**
 * The HTTP status of a URL.
 *
 * @param {string} url
 * @returns {Promise<number>}
 */
function codeHttp(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    client
      .get(url, { headers: { 'User-Agent': 'verifier-blocs-entree2' } }, (reponse) => {
        reponse.resume();
        resolve(reponse.statusCode);
      })
      .on('error', () => resolve(0));
  });
}

async function principal() {
  const args = process.argv.slice(2);
  const chemin = args.find((a) => !a.startsWith('--')) || KIT_DEFAUT;
  const avecHttp = args.includes('--http');

  console.log('Kit: ' + chemin);
  const blocs = lireBlocs(chemin);

  console.log('\n1. les 12 blocs et leur longueur');
  const lignes = [];
  for (const nom of ORDRE) {
    const contenu = blocs.get(nom);
    if (contenu === undefined) {
      verifier('bloc ' + nom + ' present', false, 'absent du kit');
      lignes.push([nom, '-', '-', 'ABSENT']);
      continue;
    }
    const n = contenu.length;
    const limite = LIMITES[nom];
    const ok = limite === null ? true : n <= limite;
    verifier(
      'bloc ' + nom + ' : ' + n + ' caracteres' + (limite === null ? ' (pas de plafond)' : ' / ' + limite),
      ok,
      ok ? '' : 'depasse de ' + (n - limite)
    );
    lignes.push([nom, String(n), limite === null ? '-' : String(limite), ok ? 'OK' : 'TROP LONG']);
  }

  console.log('\nTableau des longueurs (brut)');
  console.log('| bloc | caracteres | plafond | etat |');
  console.log('|---|---|---|---|');
  for (const l of lignes) console.log('| ' + l[0] + ' | ' + l[1] + ' | ' + l[2] + ' | ' + l[3] + ' |');

  console.log('\n2. les mots cles');
  const mots = (blocs.get('MOTS_CLES') || '').split(',').map((m) => m.trim()).filter(Boolean);
  verifier('MOTS_CLES contient exactement 5 mots cles (' + mots.length + ')', mots.length === 5, mots.join(', '));

  console.log('\n3. les deux blocs a remplir par le proprietaire');
  for (const nom of ['VIDEO', 'LINK_INSTALLATION']) {
    const contenu = blocs.get(nom) || '';
    verifier(
      nom + ' porte le seul marqueur accepte',
      contenu.startsWith(A_REMPLIR) && contenu.endsWith(']]') && contenu.split(A_REMPLIR).length === 2
    );
  }
  for (const nom of ORDRE) {
    if (nom === 'VIDEO' || nom === 'LINK_INSTALLATION') continue;
    verifier(nom + ' ne porte aucun marqueur a remplir', !(blocs.get(nom) || '').includes(A_REMPLIR));
  }
  const fichier = fs.readFileSync(chemin, 'utf8');
  const section = fichier.split('## A COMPLETER PAR LE PROPRIETAIRE')[1] || '';
  verifier(
    "la section '## A COMPLETER PAR LE PROPRIETAIRE' liste les 2 blocs",
    section.split('\n').filter((l) => l.trim().startsWith('- ')).length === 2
  );

  console.log('\n4. le texte');
  let nonAscii = [];
  let interditsTrouves = [];
  for (const nom of ORDRE) {
    const contenu = blocs.get(nom) || '';
    for (let i = 0; i < contenu.length; i++) {
      if (contenu.charCodeAt(i) > 127) {
        nonAscii.push(nom + ' @' + i + ' : ' + JSON.stringify(contenu[i]));
      }
    }
    // The sanctioned marker is removed before the search: its brackets are the
    // one allowed form of square brackets in the kit.
    const sansMarqueur = contenu.replace(/\[\[A_COMPLETER_PAR_LE_PROPRIETAIRE[^\]]*\]\]/g, '');
    for (const mot of INTERDITS) {
      if (sansMarqueur.includes(mot)) interditsTrouves.push(nom + ' : ' + mot);
    }
  }
  verifier('le texte est en ASCII pur', nonAscii.length === 0, nonAscii.slice(0, 5).join(' | '));
  verifier(
    "le texte ne contient aucun mot interdit (" + INTERDITS.join(', ') + ')',
    interditsTrouves.length === 0,
    interditsTrouves.slice(0, 5).join(' | ')
  );

  console.log('\n5. les liens figes');
  const tous = [];
  for (const nom of ORDRE) {
    for (const lien of liens(blocs.get(nom) || '')) tous.push([nom, lien]);
  }
  verifier('le kit contient des liens (' + tous.length + ')', tous.length > 0);
  const nonFiges = tous.filter(([, l]) => {
    if (!l.includes('github.com') && !l.includes('githubusercontent.com')) return false;
    if (l.includes('/tree/') || l.includes('/blob/')) return !/\/[0-9a-f]{40}(\/|$)/.test(l);
    if (l.includes('githubusercontent.com')) return !/\/[0-9a-f]{40}\//.test(l);
    return false;
  });
  verifier(
    'chaque lien du depot est fige sur un SHA de 40 caracteres',
    nonFiges.length === 0,
    nonFiges.map(([n, l]) => n + ' -> ' + l).join(' | ')
  );
  const images = tous.filter(([, l]) => l.includes('ENTREE2-IMAGES'));
  verifier('les 5 liens d\'images sont presents (' + images.length + ')', images.length === 5);

  if (avecHttp) {
    console.log('\n6. le code HTTP de chaque lien');
    for (const [nom, lien] of tous) {
      const code = await codeHttp(lien);
      verifier(nom + ' -> ' + code + ' ' + lien.slice(0, 90), code === 200);
    }
  } else {
    console.log('\n6. le code HTTP de chaque lien : non demande (option --http)');
  }

  console.log('\n' + reussies + ' controles passes, ' + echecs.length + ' en echec');
  if (echecs.length) {
    for (const e of echecs) console.log('  RED  ' + e);
    process.exit(1);
  }
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
