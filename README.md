# JSM Portal Answers

**Two read-only Atlassian MCP tools that answer a customer's question about a Jira Service Management customer portal.**

Built for the [Codegeist 2026](https://codegeist.atlassian.com/) contest — bonus track **"Best app with Atlassian MCP"**.

A customer of a company writes to the service desk: *"can I ask for a refund here?"*, *"what do I have to
fill in the form?"*, *"which documents do I need?"*. The answers already exist in the metadata of the
JSM customer portal — the request types, their categories, their help texts and the fields of their
create forms. This app exposes that metadata through the **official `rovo:mcp` module**, so an agent
can answer the question from the real portal instead of guessing.

---

## The two tools

| Tool | Answers | Reads |
|---|---|---|
| `list_portal_request_types` | "What can I ask for on this portal?" | request types, description, help text, category, whether you may raise it, portal rules |
| `describe_request_type_form` | "What do I have to fill in?" | every field of the create form: label, required/optional, type, help text, possible values, default values |

Both tools accept a `portal` (service desk id or project key) and, for the first one, the `question`
words, which are passed to the **server-side** `searchQuery` filter of the JSM API.

Example answer of `list_portal_request_types` (a JSM site, portal `SUP`):

```
Portal: Support (SUP)
  Service desk id: 1 | project key: SUP | project type: service_desk
  Categories of this portal: Common Requests, Computers, Logins and Accounts, Applications, Servers and Infrastructure
  Request types (9):
    - Get IT help [id 1]
      you may raise it | status: OPEN | category: Common Requests, Computers
      Description: Get assistance for general IT problems and questions.
    ...
  Rules of this portal:
    - a request can be raised on behalf of another person: yes
    - participants can be added to a request: yes
```

## The page: the same answers, in the browser

The manifest also declares one `jira:globalPage` — a page in the **Apps** menu of the Jira
navigation (`/jira/apps/{appId}/{envId}`). It is the visible face of the app: a signed-in user
types a question about a customer portal and reads the answer.

The page is **not** the product and has **no logic of its own**: its resolver (`src/resolvers.js`)
calls the very same two tools, so the page and the MCP tools can never disagree. The page is not
restricted to administrators (`displayConditions` is deliberately absent): the audience of this app
is the customer of the portal, and a customer reads the answer with their own permissions.

## What it does **not** do — on purpose

* **It never writes.** Every API call is a `GET`. `src/jsm.js` is the only file that talks to the
  Atlassian API and it has no other method.
* **It never stores anything.** No storage, no key-value store, no entities.
* **It never calls an external service.** No URL, no `fetch`, no third-party library.
* **It never uses the app's own identity.** Every read goes through `asUser()`, so a tool only sees
  what the person calling it can see — a customer of the portal sees the request types they are
  allowed to see. That is the whole point of the app.
* **It never claims to know what the API does not say.** The SLA *targets* of a portal are not
  exposed by the public JSM REST API (its only SLA endpoints describe one request that already
  exists), so the tools say exactly that instead of inventing a delay.
* **It has no public URL.** There is no web trigger and no unauthenticated endpoint.

## Permissions

One scope, and it is a read scope:

```
read:servicedesk-request
```

The app reads request-type metadata, categories and form fields. It reads no issue, no comment, no
attachment, no user and no organisation.

## Privacy

The policy is kept in two places: [`PRIVACY.md`](./PRIVACY.md) in this repository, and the online
page the developer-console sharing screen asks for, published at
<https://tgg49099-dotcom.github.io/jsm-portal-answers/privacy.html> (built from
[`docs/privacy.html`](./docs/privacy.html)). Short version: the app stores nothing, sends nothing
anywhere, and shows only what the person asking already has access to.

## The demo video

The demo video of the app is in this repository, in [`docs/devpost/video/`](./docs/devpost/video):
an MP4 of **173 s** (below the 5-minute limit of the contest form), with the subtitles burned into
the picture, plus the same subtitles as a `.srt` file. It shows the real deployed page in Jira,
then the app's page re-rendered locally and running live against the customer's portal, then this
repository. [`docs/devpost/video/README.md`](./docs/devpost/video/README.md) says exactly what is
on each part of the picture.

## Install it

The app is free and has **no licence key**, so it can be shared with an installation link:

1. Open the installation link given in the contest entry.
2. Choose the Jira Service Management site and accept the `read:servicedesk-request` scope.
3. Ask your MCP client for the tools `list_portal_request_types` and
   `describe_request_type_form`.

A site administrator must enable the app in the **Atlassian MCP server** administration (external
MCP exposure is off by default) before an MCP client can reach it.

Once installed, the page is in the **Apps** menu of the Jira navigation.

## Develop it

```bash
npm install
npm run lint                      # forge lint
npm test                          # offline harness + counter-proof + static discipline
```

Deploy it to your own site:

```bash
forge register "JSM Portal Answers"     # creates the app id and the 3 environments
forge deploy -e development
forge install -e development --site your-site.atlassian.net
```

Note: `forge register` writes the new `app.id` into `manifest.yml` — keep the id in the manifest
header comment in sync.

### The tests, and why they are written that way

A test that only ever sees the same answers can be passed by code that prints a hardcoded text.
So the offline harness (`test/harnais.js`) stubs `@forge/api`, records **every** call, feeds
fixtures captured live from the real JSM REST API, and runs the tools against **two different
sites** (different portals, request types, fields, one restricted type, one hidden field). A
hardcoded answer fails there. The harness also runs the resolver of the page: the page must answer
exactly what the tools answer, a call without a signed-in account must read nothing, and an unknown
action must be refused.

And the counter-proof (`test/contre-epreuve.js`) sabotages a **copy** of the module in three
different ways — hardcoded request types, a constant answer, hardcoded fields — and requires the
harness to **fail** on each sabotage. A test that passes on broken code proves nothing.

`test/discipline.js` checks the promises mechanically: zero `asApp()`, no storage, no external URL,
only `GET`, exactly one `rovo:mcp` module with two tools, `actionVerb: GET` on every action, one
read-only scope, no licence key in the manifest.

## Layout

```
manifest.yml          one jira:globalPage, one rovo:mcp module, two read-only actions, one read scope
src/mcp.js            the two tools (the only code an MCP client reaches)
src/jsm.js            the only file that calls the Atlassian API — every call is a GET
src/resolvers.js      the resolver of the page: it calls the two tools, nothing else
src/frontend/page.jsx the page (UI Kit 2)
src/frontend/api.js   the two calls the page can make
src/frontend/bridge.js the transport to the resolver, offline-safe
test/harnais.js       the offline harness (stubbed @forge/api, live fixtures, resolver checks)
test/fixtures.js      fixtures captured live on 18/11/2026, with no personal data
test/contre-epreuve.js the counter-proof: sabotage a copy, the harness must fail
test/discipline.js    the static rules (asApp, storage, GET only, manifest shape)
docs/privacy.html     the online privacy policy (GitHub Pages)
docs/devpost/video/   the demo video (MP4 + subtitles) and what each part shows
```

## Licence

The code is published as-is for the contest. It reads a public API of your own site and stores
nothing.
