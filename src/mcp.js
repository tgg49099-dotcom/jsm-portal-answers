'use strict';

/**
 * JSM Portal Answers — THE TWO Rovo MCP TOOLS.
 *
 * WHAT THIS APP IS
 *
 * A customer of a company writes to the service desk: "can I ask for a refund
 * here?", "what do I have to put in the form?", "which documents do I need?".
 * The answers live in the metadata of the Jira Service Management customer
 * portal — the request types, their categories, their help texts and the
 * fields of their create forms. This app exposes THAT metadata as two
 * read-only tools of the Atlassian MCP server, so an agent can answer a
 * customer's question about the portal instead of guessing.
 *
 * THE TWO TOOLS
 *
 *   1. `list_portal_request_types` — "what can I ask for on this portal?"
 *      The request types a customer can raise, with their description, their
 *      help text, their category, whether the caller may raise them, and the
 *      rules of the portal itself (categories, restricted request types,
 *      whether a request may be raised on behalf of somebody else).
 *   2. `describe_request_type_form` — "what do I have to fill in?"
 *      Every field of the create form of a request type: label, required or
 *      not, type, help text, possible values, default values.
 *
 * WHAT THE TOOLS DO NOT DO
 *
 *   * They NEVER write. Every call is a GET (src/jsm.js is the only file that
 *     talks to the API and it has no other method).
 *   * They NEVER store anything, and they call no external service.
 *   * They NEVER read another tenant: the platform binds the app to the site
 *     where it is installed, and every path they call is relative to it.
 *   * They NEVER use the app's own identity: everything is read with
 *     `asUser()`, so a tool can only see what the person calling it can see.
 *     A customer of the portal sees the request types they are allowed to
 *     see; that is the point of the app.
 *   * They NEVER claim to know what the API does not say. In particular the
 *     SLA targets of a portal are not exposed by the public JSM REST API
 *     (the only SLA endpoints describe one already created request), so the
 *     tools say so instead of inventing a delay.
 *
 * THE ADMINISTRATOR CHECK OF THE SLOT-4 APP IS NOT HERE, ON PURPOSE
 *
 * The other app of the project (the accessibility checker) answers only to
 * Jira administrators, because a WCAG report of a whole site is an internal
 * document. This app answers a CUSTOMER's question about a portal: the
 * customer is exactly the person who must be able to read the request types
 * of the portal they use. The two apps therefore behave differently on
 * purpose, and this one declares no administrator permission at all.
 */

const jsm = require('./jsm.js');

const TITRE = 'JSM Portal Answers — read-only answers about a JSM customer portal';

// ---------------------------------------------------------------------------
// Constants — the texts the agent reads are part of the contract.
// ---------------------------------------------------------------------------

const REFUS_PORTAIL_ABSENT =
  'This app answers questions about a Jira Service Management customer portal. ' +
  'Give the portal as a service desk id or a project key (for example SUP), ' +
  'or leave it empty to get every portal of the site.';

const REFUS_TYPE_ABSENT =
  'No request type was found with that name. Give the id of a request type ' +
  '(for example 1) or its exact name (for example "Get IT help"), and ' +
  'the portal it belongs to (a service desk id or a project key, for example SUP).';

const REFUS_JSM_INACTIF =
  'Jira Service Management is not active on the site where this app is installed ' +
  '(the API answers isLicensedForUse = false), so there is no customer portal to read. ' +
  'Nothing was written and nothing was stored.';

/**
 * The refusal returned when the platform refuses the caller's own token.
 * Atlassian documents this case: an `asUser()` call can fail when the caller
 * has no consent entry for the app. The message says what to do instead of
 * hiding the failure behind an empty list.
 *
 * @param {number} status
 * @returns {string}
 */
function refusAutorisation(status) {
  return (
    'The Atlassian API refused this call (HTTP ' +
    status +
    '). The site is read with your own Jira permissions, so this app needs your ' +
    'consent for Jira Service Management on this site: open the app once in Jira, ' +
    'accept the access request, then ask again. Nothing was written and nothing was stored.'
  );
}

/**
 * The refusal returned when the platform answers something else.
 *
 * @param {number} status
 * @param {string|null} erreur
 * @returns {string}
 */
function refusLecture(status, erreur) {
  return (
    'The Atlassian API could not be read (HTTP ' +
    status +
    (erreur ? ', ' + erreur : '') +
    '). Nothing was written and nothing was stored.'
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A text cut to a readable length. The agent gets the beginning of the
 * help text, not the whole article: the tool output travels through an MCP
 * client and must stay short.
 *
 * @param {unknown} texte
 * @param {number} max
 * @returns {string}
 */
function tronquer(texte, max) {
  const t = typeof texte === 'string' ? texte.trim() : '';
  if (!t) return '';
  const plat = t.replace(/\s+/g, ' ');
  return plat.length <= max ? plat : plat.slice(0, max - 1).trimEnd() + '…';
}

/**
 * A value of a field, with its label — the JSM form shows the label, and
 * that is what the customer recognises.
 *
 * @param {any} valeur
 * @returns {string}
 */
function libelleValeur(valeur) {
  if (!valeur || typeof valeur !== 'object') return '';
  const label = typeof valeur.label === 'string' ? valeur.label.trim() : '';
  const val = typeof valeur.value === 'string' ? valeur.value.trim() : '';
  if (label && val && label !== val) return label + ' (' + val + ')';
  return label || val;
}

/**
 * The possible values of a field, flattened: JSM nests them (a "select list"
 * whose entries have children).
 *
 * @param {any[]} valeurs
 * @param {number} max
 * @returns {string[]}
 */
function valeursPossibles(valeurs, max) {
  const sortie = [];
  const parcours = (liste) => {
    for (const v of liste || []) {
      if (!v || typeof v !== 'object') continue;
      const l = libelleValeur(v);
      if (l && !sortie.includes(l)) sortie.push(l);
      if (Array.isArray(v.children)) parcours(v.children);
      if (sortie.length >= max) return;
    }
  };
  parcours(valeurs);
  return sortie.slice(0, max);
}

/**
 * The category of a request type, from the portal's request type groups.
 *
 * @param {any[]} groupes
 * @param {any[]} groupIds
 * @returns {string}
 */
function nommerGroupes(groupes, groupIds) {
  const ids = Array.isArray(groupIds) ? groupIds.map(String) : [];
  if (!ids.length) return '';
  const noms = [];
  for (const g of groupes || []) {
    if (!g || typeof g !== 'object') continue;
    if (ids.includes(String(g.id)) && g.name) noms.push(String(g.name));
  }
  return noms.join(', ');
}

/**
 * The line that says the site was read with the caller's own permissions.
 * It is repeated at the end of every answer: an agent that relays the answer
 * to a customer must say that the answer comes from the customer's own
 * portal, not from a public document.
 *
 * @returns {string}
 */
function ligneIdentite() {
  return (
    "Identity: the portal was read with your own Jira permissions, so you see the request " +
    'types you are allowed to see. Nothing was written, nothing was stored.'
  );
}

/**
 * Find the portal (service desk) that answers the request.
 *
 * @param {any[]} listePortails
 * @param {string} demande  the portal asked for (id or project key), or ''
 * @returns {any|null}
 */
/**
 * The significant words of a customer's question, for the fallback of tool 1.
 *
 * Lower case, letters and digits only, 3 characters or more, without the
 * small words that would match every request type ("the", "for", "how"...),
 * at most 8 words, each one once.
 *
 * @param {string} question
 * @returns {string[]}
 */
const MOTS_VIDES = new Set([
  'the', 'and', 'for', 'how', 'can', 'what', 'with', 'from', 'into', 'about', 'this', 'that',
  'you', 'your', 'our', 'are', 'was', 'not', 'need', 'want', 'please', 'does', 'have', 'has',
  'les', 'des', 'une', 'pour', 'avec', 'comment', 'est', 'que', 'qui', 'mon', 'mes', 'der',
  'die', 'das', 'und', 'ein', 'eine', 'ich', 'wie',
]);

function motsSignificatifs(question) {
  const t = typeof question === 'string' ? question.toLowerCase() : '';
  const mots = [];
  for (const m of t.split(/[^\p{L}\p{N}]+/u)) {
    if (m.length < 3 || MOTS_VIDES.has(m) || mots.includes(m)) continue;
    mots.push(m);
    if (mots.length >= 8) break;
  }
  return mots;
}

function trouverPortail(listePortails, demande) {
  if (!demande) return null;
  const d = demande.trim().toLowerCase();
  for (const p of listePortails || []) {
    if (!p || typeof p !== 'object') continue;
    if (String(p.id).toLowerCase() === d) return p;
    if (String(p.projectKey || '').toLowerCase() === d) return p;
    if (String(p.projectName || '').toLowerCase() === d) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool 1 — list_portal_request_types
// ---------------------------------------------------------------------------

/**
 * "What can a customer ask for on this portal?"
 *
 * @param {object} payload  { portal?, question? }
 * @param {object} context
 * @returns {Promise<string>} the answer, as text the agent can relay
 */
async function listPortalRequestTypes(payload, context) {
  const p = payload && typeof payload === 'object' ? payload : {};

  // 1. Is there a portal at all on this site? The API says so itself.
  const etat = await jsm.etatJsm();
  if (!etat.ok) {
    if (etat.status === 401 || etat.status === 403) return refusAutorisation(etat.status);
    return refusLecture(etat.status, etat.erreur);
  }
  if (etat.body && etat.body.isLicensedForUse === false) {
    return REFUS_JSM_INACTIF;
  }

  // 2. The portals of the site.
  const rep = await jsm.portails();
  if (!rep.ok) {
    if (rep.status === 401 || rep.status === 403) return refusAutorisation(rep.status);
    return refusLecture(rep.status, rep.erreur);
  }
  const tous = jsm.valeurs(rep.body);
  if (!tous.length) {
    return (
      'This site has no Jira Service Management customer portal: the API answered an empty ' +
      'list of service desks. Nothing was written and nothing was stored.'
    );
  }

  const demande = typeof p.portal === 'string' ? p.portal.trim() : '';
  let cibles = tous;
  if (demande) {
    const trouve = trouverPortail(tous, demande);
    if (!trouve) {
      return (
        'No customer portal called "' + demande + '" was found on this site. The portals of ' +
        'the site are: ' + tous.map((x) => x.projectName + ' (' + x.projectKey + ')').join(', ') +
        '. Nothing was written and nothing was stored.'
      );
    }
    cibles = [trouve];
  }

  const question = typeof p.question === 'string' ? p.question.trim() : '';

  const lignes = [];
  lignes.push(TITRE);
  lignes.push('Question: ' + (question ? '"' + tronquer(question, 160) + '"' : '(every request type)'));
  lignes.push('');

  for (const portail of cibles) {
    const sdId = portail.id;
    const nom = portail.projectName || portail.projectKey || String(sdId);
    const cle = portail.projectKey || '';

    lignes.push('Portal: ' + nom + (cle ? ' (' + cle + ')' : ''));
    lignes.push(
      '  Service desk id: ' + sdId + ' | project key: ' + (cle || '?') + ' | project type: ' +
      (portail.projectTypeKey || '?')
    );

    // The categories of the portal.
    const repGroupes = await jsm.groupes(sdId);
    const groupes = repGroupes.ok ? jsm.valeurs(repGroupes.body) : [];

    // The request types, filtered by the words of the question.
    const repTypes = await jsm.typesDeDemande(sdId, question);
    if (!repTypes.ok) {
      if (repTypes.status === 401 || repTypes.status === 403) {
        lignes.push('  The platform refused to read the request types of this portal (HTTP ' + repTypes.status + ').');
        lignes.push('  ' + refusAutorisation(repTypes.status));
        lignes.push('');
        continue;
      }
      lignes.push('  The request types of this portal could not be read (HTTP ' + repTypes.status + ').');
      lignes.push('');
      continue;
    }
    let types = jsm.valeurs(repTypes.body);
    let repTypesLus = repTypes;
    let motsRepli = [];

    // The server-side `searchQuery` filter matches the words AS ONE STRING:
    // "broken laptop" finds nothing on a portal whose type is "Report broken
    // hardware". An agent passes several words of the customer's question,
    // so an empty answer is not the end: the whole portal is read once more
    // (same GET, same identity, no filter) and the request types that
    // contain AT LEAST ONE significant word are listed, best match first,
    // and the answer says so. See motsSignificatifs() and test/question-mots.js.
    if (!types.length && question) {
      motsRepli = motsSignificatifs(question);
      if (motsRepli.length) {
        const repTous = await jsm.typesDeDemande(sdId, '');
        if (repTous.ok) {
          const classes = [];
          for (const rt of jsm.valeurs(repTous.body)) {
            const texte = [rt && rt.name, rt && rt.description, rt && rt.helpText]
              .filter((x) => typeof x === 'string')
              .join(' ')
              .toLowerCase();
            const n = motsRepli.filter((m) => texte.includes(m)).length;
            if (n > 0) classes.push({ rt, n });
          }
          classes.sort((a, b) => b.n - a.n);
          types = classes.map((c) => c.rt);
          repTypesLus = repTous;
        }
      }
    }

    if (groupes.length) {
      lignes.push('  Categories of this portal: ' + groupes.map((g) => g.name).join(', '));
    }

    if (!types.length) {
      lignes.push(
        '  Request types: none found' +
        (question ? ' for the words given' : '') +
        '. (An empty list can also mean that the request types are restricted to other groups.)'
      );
      lignes.push('');
      continue;
    }

    if (motsRepli.length) {
      lignes.push(
        '  No request type contains the words "' + tronquer(question, 160) + '" as one phrase (the ' +
        'server-side searchQuery filter). These request types contain at least one of the words ' +
        motsRepli.join(', ') + ', best match first:'
      );
    }
    lignes.push('  Request types (' + types.length + (jsm.incomplet(repTypesLus.body) ? ' read; the API has more, this list is INCOMPLETE' : '') + '):');
    for (const rt of types) {
      const categorie = nommerGroupes(groupes, rt.groupIds);
      const flags = [];
      flags.push(rt.canCreateRequest === false ? 'you may NOT raise it' : 'you may raise it');
      if (rt.restrictionStatus) flags.push('status: ' + rt.restrictionStatus);
      if (categorie) flags.push('category: ' + categorie);
      if (rt.portalId) flags.push('portal id: ' + rt.portalId);
      lignes.push('    - ' + rt.name + ' [id ' + rt.id + ']');
      lignes.push('      ' + flags.join(' | '));
      const description = tronquer(rt.description, 240);
      if (description) lignes.push('      Description: ' + description);
      const aide = tronquer(rt.helpText, 240);
      if (aide) lignes.push('      Help: ' + aide);
    }

    // The two rules of the portal that the API exposes on the create form
    // (they are properties of the portal, not of the request type).
    if (types.length) {
      const repChamps = await jsm.champsDuFormulaire(sdId, types[0].id);
      if (repChamps.ok && repChamps.body && typeof repChamps.body === 'object') {
        const regles = [];
        if (typeof repChamps.body.canRaiseOnBehalfOf === 'boolean') {
          regles.push('a request can be raised on behalf of another person: ' + (repChamps.body.canRaiseOnBehalfOf ? 'yes' : 'no'));
        }
        if (typeof repChamps.body.canAddRequestParticipants === 'boolean') {
          regles.push('participants can be added to a request: ' + (repChamps.body.canAddRequestParticipants ? 'yes' : 'no'));
        }
        if (regles.length) {
          lignes.push('  Rules of this portal:');
          for (const r of regles) lignes.push('    - ' + r);
        }
      }
    }

    lignes.push(
      '  SLA targets: the public JSM REST API does not expose the SLA targets of a portal ' +
        '(its only SLA endpoints describe one request that already exists). The fields of the ' +
        'form are described by the other tool, describe_request_type_form.'
    );
    lignes.push('');
  }

  lignes.push(ligneIdentite());
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Tool 2 — describe_request_type_form
// ---------------------------------------------------------------------------

/**
 * "What does a customer have to fill in?"
 *
 * @param {object} payload  { request_type, portal? }
 * @param {object} context
 * @returns {Promise<string>} the answer, as text the agent can relay
 */
async function describeRequestTypeForm(payload, context) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const demande = typeof p.request_type === 'string' ? p.request_type.trim() : '';
  if (!demande) return REFUS_TYPE_ABSENT;

  const etat = await jsm.etatJsm();
  if (!etat.ok) {
    if (etat.status === 401 || etat.status === 403) return refusAutorisation(etat.status);
    return refusLecture(etat.status, etat.erreur);
  }
  if (etat.body && etat.body.isLicensedForUse === false) {
    return REFUS_JSM_INACTIF;
  }

  const rep = await jsm.portails();
  if (!rep.ok) {
    if (rep.status === 401 || rep.status === 403) return refusAutorisation(rep.status);
    return refusLecture(rep.status, rep.erreur);
  }
  const tous = jsm.valeurs(rep.body);
  if (!tous.length) {
    return (
      'This site has no Jira Service Management customer portal: the API answered an empty ' +
      'list of service desks. Nothing was written and nothing was stored.'
    );
  }

  const portailDemande = typeof p.portal === 'string' ? p.portal.trim() : '';
  let cibles = tous;
  if (portailDemande) {
    const trouve = trouverPortail(tous, portailDemande);
    if (!trouve) {
      return (
        'No customer portal called "' + portailDemande + '" was found on this site. The portals ' +
        'of the site are: ' + tous.map((x) => x.projectName + ' (' + x.projectKey + ')').join(', ') +
        '. Nothing was written and nothing was stored.'
      );
    }
    cibles = [trouve];
  }

  // The request type is looked for by id first, then by exact name.
  let trouveType = null;
  let portailType = null;
  const lus = []; // every request type read, with its portal, for the fallback below
  for (const portail of cibles) {
    const repTypes = await jsm.typesDeDemande(portail.id, '');
    if (!repTypes.ok) {
      if (repTypes.status === 401 || repTypes.status === 403) return refusAutorisation(repTypes.status);
      continue;
    }
    const types = jsm.valeurs(repTypes.body);
    for (const t of types) if (t && typeof t === 'object') lus.push({ t, portail });
    const parId = types.find((t) => String(t.id) === demande);
    const parNom = types.find(
      (t) => String(t.name || '').toLowerCase() === demande.toLowerCase()
    );
    const choix = parId || parNom;
    if (choix) {
      trouveType = choix;
      portailType = portail;
      break;
    }
  }

  // An agent rarely has the EXACT name: it passes "broken hardware" for
  // "Report broken hardware", or "IT help" for "Get IT help". Before this
  // fallback, the tool answered "No request type was found" although the
  // type was on the portal. Now: when exactly ONE request type has a name
  // that contains the words given, it is described, and the answer says so;
  // when several are close, they are listed with their id and portal, so the
  // agent can ask again with an id. Nothing else is read for this: it uses
  // the lists already read above (same GETs, same identity).
  // See test/nom-approche.js.
  let ligneApproche = '';
  if (!trouveType) {
    const d = demande.toLowerCase().replace(/\s+/g, ' ');
    const contient = lus.filter(({ t }) => String(t.name || '').toLowerCase().replace(/\s+/g, ' ').includes(d));
    if (contient.length === 1) {
      trouveType = contient[0].t;
      portailType = contient[0].portail;
      ligneApproche =
        'No request type is named exactly "' + tronquer(demande, 80) + '"; the only one whose name ' +
        'contains these words is "' + trouveType.name + '", described below.';
    } else {
      let proches = contient.map((x) => ({ ...x, n: 99 }));
      if (!proches.length) {
        const mots = motsSignificatifs(demande);
        proches = lus
          .map((x) => {
            const nom = String(x.t.name || '').toLowerCase();
            return { ...x, n: mots.filter((m) => nom.includes(m)).length };
          })
          .filter((x) => x.n > 0)
          .sort((a, b) => b.n - a.n);
      }
      const liste = proches.slice(0, 10).map(
        (x) => '"' + x.t.name + '" [id ' + x.t.id + '] in ' + (x.portail.projectName || '') +
          (x.portail.projectKey ? ' (' + x.portail.projectKey + ')' : '')
      );
      return (
        REFUS_TYPE_ABSENT +
        ' The portals searched are: ' +
        cibles
          .map((x) => x.projectName + ' (' + x.projectKey + ')')
          .join(', ') +
        '.' +
        (liste.length
          ? ' The closest request types are: ' + liste.join('; ') +
            (proches.length > liste.length ? ' (and ' + (proches.length - liste.length) + ' more)' : '') +
            '. Ask again with one of these ids.'
          : '') +
        ' Nothing was written and nothing was stored.'
      );
    }
  }

  const repChamps = await jsm.champsDuFormulaire(portailType.id, trouveType.id);
  if (!repChamps.ok) {
    if (repChamps.status === 401 || repChamps.status === 403) return refusAutorisation(repChamps.status);
    return refusLecture(repChamps.status, repChamps.erreur);
  }
  const meta = repChamps.body && typeof repChamps.body === 'object' ? repChamps.body : {};
  const champs = Array.isArray(meta.requestTypeFields) ? meta.requestTypeFields : [];

  const lignes = [];
  lignes.push(TITRE + ' — the form of a request type');
  lignes.push('Portal: ' + (portailType.projectName || '') + (portailType.projectKey ? ' (' + portailType.projectKey + ')' : ''));
  if (ligneApproche) lignes.push(ligneApproche);
  lignes.push('Request type: ' + trouveType.name + ' [id ' + trouveType.id + ']');
  if (trouveType.description) lignes.push('Description: ' + tronquer(trouveType.description, 240));
  if (trouveType.helpText) lignes.push('Help: ' + tronquer(trouveType.helpText, 240));
  lignes.push('');

  const visibles = champs.filter((c) => c && c.visible !== false);
  const invisibles = champs.filter((c) => c && c.visible === false);

  lignes.push('Fields the customer sees (' + visibles.length + '):');
  if (!visibles.length) {
    lignes.push('  - none returned by the API');
  }
  for (const c of visibles) {
    const bits = [];
    bits.push(c.required ? 'required' : 'optional');
    const schema = c.jiraSchema && typeof c.jiraSchema === 'object' ? c.jiraSchema : null;
    if (schema && schema.type) bits.push('type: ' + schema.type);
    if (schema && Array.isArray(schema.items) && schema.items[0] && schema.items[0].value) {
      bits.push('values are: ' + schema.items[0].value);
    }
    lignes.push('  - ' + (c.name || c.fieldId) + ' [' + c.fieldId + '] — ' + bits.join(', '));
    const aide = tronquer(c.description, 200);
    if (aide) lignes.push('      Help: ' + aide);
    const choix = valeursPossibles(c.validValues, 20);
    if (choix.length) lignes.push('      Possible values: ' + choix.join(' | '));
    const defauts = valeursPossibles(c.defaultValues, 10);
    if (defauts.length) lignes.push('      Default: ' + defauts.join(' | '));
    const type = schema && typeof schema.type === 'string' ? schema.type : '';
    if (/sla/i.test(type) || /\bsla\b/i.test(String(c.name || ''))) {
      lignes.push('      (this field carries the SLA line of the portal)');
    }
  }

  if (invisibles.length) {
    lignes.push('');
    lignes.push('Fields the API reports as NOT visible on the portal (' + invisibles.length + '):');
    for (const c of invisibles) lignes.push('  - ' + (c.name || c.fieldId) + ' [' + c.fieldId + ']');
  }

  lignes.push('');
  lignes.push('Rules of this portal, as the API reports them:');
  if (typeof meta.canRaiseOnBehalfOf === 'boolean') {
    lignes.push('  - a request can be raised on behalf of another person: ' + (meta.canRaiseOnBehalfOf ? 'yes' : 'no'));
  }
  if (typeof meta.canAddRequestParticipants === 'boolean') {
    lignes.push('  - participants can be added to a request: ' + (meta.canAddRequestParticipants ? 'yes' : 'no'));
  }
  lignes.push(
    '  - the SLA targets of the portal are not exposed by the public JSM REST API; the SLA ' +
      'line, when the portal has one, is the field marked above.'
  );
  lignes.push('');
  lignes.push(ligneIdentite());
  return lignes.join('\n');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

// The two tools, as the manifest's `function` modules point at them.
exports.listPortalRequestTypes = listPortalRequestTypes;
exports.describeRequestTypeForm = describeRequestTypeForm;

// Exported for the offline test harness (no effect at runtime).
exports._tronquer = tronquer;
exports._valeursPossibles = valeursPossibles;
exports._nommerGroupes = nommerGroupes;
exports._trouverPortail = trouverPortail;
exports._motsSignificatifs = motsSignificatifs;
exports._refusAutorisation = refusAutorisation;
