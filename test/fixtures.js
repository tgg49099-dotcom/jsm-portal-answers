'use strict';

/**
 * JSM Portal Answers — THE FIXTURES.
 *
 * WHERE THEY COME FROM
 *
 * They are not invented. They are the ANSWERS OF THE JSM CLOUD REST API,
 * captured LIVE on 18/11/2026 on the Jira Service Management site of the
 * project, with the Atlassian API token of the owner:
 *
 *   GET /rest/servicedeskapi/info                                        -> 200
 *   GET /rest/servicedeskapi/servicedesk                                 -> 200
 *   GET /rest/servicedeskapi/servicedesk/1/requesttypegroup             -> 200
 *   GET /rest/servicedeskapi/servicedesk/1/requesttype                   -> 200
 *   GET /rest/servicedeskapi/servicedesk/1/requesttype/1/field          -> 200
 *   GET /rest/servicedeskapi/servicedesk/1/requesttype/4/field          -> 200
 *
 * The raw captures are kept in /work/proofs/jsm-live/. Two things were
 * removed from them, and only these two: the icons (they carry the host of
 * the site) and the example personal name of the default "Onboard new
 * employees" template. NOTHING that identifies a person is in this file.
 *
 * WHY THEY EXIST
 *
 * To run the two tools OFFLINE, with no network and no Atlassian account,
 * and to be able to change them to prove that the tools follow the API
 * instead of repeating a hardcoded text. A test that always answers the
 * same thing proves nothing; a test that answers something else proves
 * that the code reads the answer.
 *
 * THE SCENARIOS
 *
 *   * 'principal' — the site above, as captured.
 *   * 'autre'     — another site, another portal, other request types and
 *                   other fields: the tools must follow it.
 *   * 'refus'     — the platform answers 401 everywhere.
 *   * 'jsmInactif'— the site has no Jira Service Management.
 */

const PORTAIL_ID = '1';

/** GET /rest/servicedeskapi/info */
const info = {
  version: '16bb250ea884137f4703b3fbb48ab436cd7c478a',
  platformVersion: '16bb250ea884137f4703b3fbb48ab436cd7c478a',
  isLicensedForUse: true,
};

/** GET /rest/servicedeskapi/servicedesk */
const servicedesks = [
  {
    id: PORTAIL_ID,
    projectId: '10002',
    projectName: 'Support',
    projectKey: 'SUP',
    projectTypeKey: 'service_desk',
  },
];

/** GET /rest/servicedeskapi/servicedesk/1/requesttypegroup */
const groupes = [
  { id: '1', name: 'Common Requests' },
  { id: '2', name: 'Computers' },
  { id: '3', name: 'Logins and Accounts' },
  { id: '4', name: 'Applications' },
  { id: '5', name: 'Servers and Infrastructure' },
];

/** GET /rest/servicedeskapi/servicedesk/1/requesttype */
const types = [
  {
    id: '1',
    name: 'Get IT help',
    description: 'Get assistance for general IT problems and questions.',
    helpText: '',
    groupIds: ['1', '2'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '4',
    name: 'Onboard new employees',
    description: 'Request access for new employees.',
    helpText: '',
    groupIds: ['3'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '8',
    name: 'Report a system problem',
    description:
      "Let us know if something isn't working properly and we'll aim to get it back up and running quickly.",
    helpText: '',
    groupIds: ['1', '4', '5'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '9',
    name: 'Report broken hardware',
    description:
      'Report hardware that might be faulty or broken e.g. a broken computer screen or a damaged server.',
    helpText: '',
    groupIds: ['1', '2', '5'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '3',
    name: 'Request a new account',
    description: 'Request a new account for a system.',
    helpText: '',
    groupIds: ['1', '3'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '2',
    name: 'Request admin access',
    description: 'For example, if you need to administer Jira.',
    helpText: '',
    groupIds: ['3'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '6',
    name: 'Request new hardware',
    description: 'For example, a new mouse or monitor.',
    helpText: '',
    groupIds: ['2'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '5',
    name: 'Request new software',
    description: 'If you need a software license, raise a request here.',
    helpText: '',
    groupIds: ['2', '4'],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '7',
    name: 'Emailed request',
    description: 'Request received from your email support channel.',
    helpText: '',
    groupIds: [],
    portalId: PORTAIL_ID,
    serviceDeskId: PORTAIL_ID,
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
];

/** GET /rest/servicedeskapi/servicedesk/1/requesttype/1/field */
const formulaireType1 = {
  requestTypeFields: [
    {
      fieldId: 'summary',
      name: 'Summary',
      description: '',
      required: true,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string', system: 'summary' },
      visible: true,
    },
    {
      fieldId: 'description',
      name: 'Description',
      description: '',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string', system: 'description' },
      visible: true,
    },
    {
      fieldId: 'attachment',
      name: 'Attachment',
      description: '',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'array', items: 'attachment', system: 'attachment' },
      visible: true,
    },
  ],
  canRaiseOnBehalfOf: true,
  canAddRequestParticipants: true,
};

/**
 * GET /rest/servicedeskapi/servicedesk/1/requesttype/4/field
 * The example personal name of the default template was replaced by a
 * neutral text; nothing else was touched.
 */
const formulaireType4 = {
  requestTypeFields: [
    {
      fieldId: 'summary',
      name: 'Summary',
      description: 'e.g. <name of the new employee> starts on <date>',
      required: true,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string', system: 'summary' },
      visible: true,
    },
    {
      fieldId: 'duedate',
      name: 'Employee start date',
      description: 'If you are not sure of the exact date, put in a tentative one.',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'date', system: 'duedate' },
      visible: true,
    },
    {
      fieldId: 'description',
      name: 'Description',
      description: '',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string', system: 'description' },
      visible: true,
    },
    {
      fieldId: 'attachment',
      name: 'Attachment',
      description: '',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'array', items: 'attachment', system: 'attachment' },
      visible: true,
    },
  ],
  canRaiseOnBehalfOf: true,
  canAddRequestParticipants: true,
};

// ---------------------------------------------------------------------------
// The second scenario: another site, to prove nothing is hardcoded.
// ---------------------------------------------------------------------------

const autrePortail = {
  id: '3',
  projectId: '10009',
  projectName: 'Support Center',
  projectKey: 'HELP',
  projectTypeKey: 'service_desk',
};

const autreGroupes = [{ id: '20', name: 'Hardware' }];

const autreTypes = [
  {
    id: '77',
    name: 'Laptop replacement',
    description: 'Ask for a new laptop when yours is broken.',
    helpText: 'The IT team answers within 3 days.',
    groupIds: ['20'],
    portalId: '3',
    serviceDeskId: '3',
    restrictionStatus: 'OPEN',
    canCreateRequest: true,
  },
  {
    id: '78',
    name: 'Change of address',
    description: 'Ask for a change of address.',
    helpText: '',
    groupIds: [],
    portalId: '3',
    serviceDeskId: '3',
    restrictionStatus: 'RESTRICTED',
    canCreateRequest: false,
  },
];

const autreFormulaire = {
  requestTypeFields: [
    {
      fieldId: 'numeroSerie',
      name: 'Serial number',
      description: 'The serial number is under the keyboard.',
      required: true,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string' },
      visible: true,
    },
    {
      fieldId: 'raison',
      name: 'Reason',
      description: 'Choose the closest reason.',
      required: false,
      defaultValues: [{ label: 'Broken on arrival', value: 'doa' }],
      validValues: [
        { label: 'Broken on arrival', value: 'doa' },
        {
          label: 'Stolen',
          value: 'stolen',
          children: [{ label: 'Stolen abroad', value: 'stolen-abroad' }],
        },
      ],
      jiraSchema: { type: 'select' },
      visible: true,
    },
    {
      fieldId: 'notesInternes',
      name: 'Internal notes',
      description: '',
      required: false,
      defaultValues: [],
      validValues: [],
      jiraSchema: { type: 'string' },
      visible: false,
    },
  ],
  canRaiseOnBehalfOf: false,
  canAddRequestParticipants: true,
};

// ---------------------------------------------------------------------------
// The answers
// ---------------------------------------------------------------------------

/**
 * The scenario in use.
 *
 * @param {string} nom
 * @returns {(chemin: string, query: URLSearchParams) => {status: number, body: any}}
 */
function scenario(nom) {
  if (nom === 'jsmInactif') {
    return (chemin) => {
      if (chemin === '/rest/servicedeskapi/info') {
        return {
          status: 200,
          body: {
            version: '16bb250ea884137f4703b3fbb48ab436cd7c478a',
            isLicensedForUse: false,
          },
        };
      }
      return { status: 404, body: { errorMessages: ['not found'] } };
    };
  }

  if (nom === 'refus') {
    return () => ({
      status: 401,
      body: { errorMessages: ['Authentication Required'] },
    });
  }

  if (nom === 'autre') {
    return (chemin, query) => {
      if (chemin === '/rest/servicedeskapi/info') {
        return { status: 200, body: { version: 'x', isLicensedForUse: true } };
      }
      if (chemin === '/rest/servicedeskapi/servicedesk') {
        return { status: 200, body: { size: 1, isLastPage: true, values: [autrePortail] } };
      }
      if (chemin === '/rest/servicedeskapi/servicedesk/3/requesttypegroup') {
        return { status: 200, body: { size: 1, isLastPage: true, values: autreGroupes } };
      }
      if (chemin === '/rest/servicedeskapi/servicedesk/3/requesttype') {
        const valeurs = filtrer(autreTypes, query);
        return { status: 200, body: { size: valeurs.length, isLastPage: true, values: valeurs } };
      }
      if (chemin === '/rest/servicedeskapi/servicedesk/3/requesttype/77/field') {
        return { status: 200, body: autreFormulaire };
      }
      return { status: 404, body: { errorMessages: ['no such endpoint: ' + chemin] } };
    };
  }

  return (chemin, query) => {
    if (chemin === '/rest/servicedeskapi/info') {
      return { status: 200, body: info };
    }
    if (chemin === '/rest/servicedeskapi/servicedesk') {
      return { status: 200, body: { size: 1, isLastPage: true, values: servicedesks } };
    }
    if (chemin === '/rest/servicedeskapi/servicedesk/' + PORTAIL_ID + '/requesttypegroup') {
      return { status: 200, body: { size: groupes.length, isLastPage: true, values: groupes } };
    }
    if (chemin === '/rest/servicedeskapi/servicedesk/' + PORTAIL_ID + '/requesttype') {
      const valeurs = filtrer(types, query);
      return { status: 200, body: { size: valeurs.length, isLastPage: true, values: valeurs } };
    }
    if (chemin === '/rest/servicedeskapi/servicedesk/' + PORTAIL_ID + '/requesttype/1/field') {
      return { status: 200, body: formulaireType1 };
    }
    if (chemin === '/rest/servicedeskapi/servicedesk/' + PORTAIL_ID + '/requesttype/4/field') {
      return { status: 200, body: formulaireType4 };
    }
    return { status: 404, body: { errorMessages: ['no such endpoint: ' + chemin] } };
  };
}

/**
 * The `searchQuery` filter, the way the real endpoint applies it (the server
 * filters — measured on the site, 18/11/2026: `searchQuery=account` answers
 * one request type, `searchQuery=hardware` answers two).
 *
 * @param {any[]} liste
 * @param {URLSearchParams} query
 * @returns {any[]}
 */
function filtrer(liste, query) {
  const q = query && query.get('searchQuery') ? query.get('searchQuery').toLowerCase() : '';
  if (!q) return liste;
  return liste.filter((t) =>
    [t.name, t.description, t.helpText].join(' ').toLowerCase().includes(q)
  );
}

module.exports = {
  scenario,
  info,
  servicedesks,
  groupes,
  types,
  formulaireType1,
  formulaireType4,
  autrePortail,
  autreTypes,
};
