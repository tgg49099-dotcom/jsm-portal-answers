/**
 * page.jsx — the Jira global page of JSM Portal Answers.
 *
 * UI Kit 2 (@forge/react). ONE job: let a signed-in Jira user ask a question
 * about a customer portal of the site and read the answer.
 *
 * The page is the visible face of the app; the PRODUCT of the app is the
 * pair of MCP tools it exposes to the Atlassian MCP server
 * (list_portal_request_types and describe_request_type_form). The page calls
 * the very same code — src/resolvers.js calls src/mcp.js — so the two faces
 * can never disagree.
 *
 * Rules followed here (Atlassian's own template instructions):
 *   - only components exported by @forge/react; no raw HTML tag (`<div>`,
 *     `<strong>`…) — a raw tag makes the platform replace the whole app with
 *     an error banner;
 *   - UI Kit 2 does not call our code: the bundle registers itself with
 *     ForgeReconciler.render(<App/>);
 *   - every message is in English: the judges install the app (contest rule
 *     l. 178) and the Marketplace listing is English too.
 */

import React, { useState } from "react";
import ForgeReconciler, {
  Button,
  Heading,
  SectionMessage,
  Spinner,
  Text,
  Textfield,
} from "@forge/react";
import { demanderPortail, decrireFormulaire } from "./api.js";

/**
 * UI Kit 2 reports a text change with an EVENT, not with the bare text.
 * Being liberal about it costs nothing.
 *
 * @param {any} event
 * @returns {string}
 */
function readValue(event) {
  if (typeof event === "string") return event;
  if (event && event.target && typeof event.target.value === "string") {
    return event.target.value;
  }
  return "";
}

/**
 * The message shown when the app cannot answer.
 *
 * One case deserves its own words: the user has not yet allowed the app to
 * read their Jira data. Jira then shows its own "allow access" screen (that
 * screen appears because the app lets the error reach the platform — see
 * src/jsm.js), and the user only has to allow it and ask again.
 *
 * @param {any} e
 * @returns {string}
 */
function messageErreur(e) {
  const message = (e && e.message) || String(e);
  if (/authentication required/i.test(message)) {
    return (
      "Jira has not allowed this app to read your data yet. If Jira shows an " +
      "\"Allow access\" prompt, accept it, then ask your question again."
    );
  }
  return message;
}

/**
 * The answer, one line per row: a raw string with "\n" would be collapsed
 * by the renderer.
 *
 * @param {string} texte
 * @returns {any}
 */
function lignes(texte) {
  const parts = String(texte || "").split("\n");
  return parts.map((ligne, i) => (
    <Text key={"l-" + i}>{ligne || " "}</Text>
  ));
}

function App() {
  const [portal, setPortal] = useState("");
  const [question, setQuestion] = useState("");
  const [requestType, setRequestType] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  /**
   * Ask the app, and show what it answers.
   *
   * @param {function} fn  the call of api.js
   * @param {object} payload
   */
  async function run(fn, payload) {
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const resultat = await fn(payload);
      setAnswer((resultat && resultat.answer) || "(the app answered nothing)");
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Heading size="medium">JSM Portal Answers</Heading>

      <Text>
        Ask a question about a customer portal of this site — what a customer
        can ask for here, and what they have to fill in. The app reads only:
        the request types of the portal, their categories and the fields of
        their create forms. It writes nothing, stores nothing and calls no
        external service.
      </Text>

      <SectionMessage appearance="information" title="What this app is">
        <Text>
          These are the same two tools the app exposes to the Atlassian MCP
          server: list_portal_request_types and describe_request_type_form.
          The page calls them with your own Jira permissions, so you see what
          you are allowed to see. The public JSM REST API does not expose the
          SLA targets of a portal — the app says so instead of guessing.
        </Text>
      </SectionMessage>

      <Textfield
        label="Portal (service desk id or project key, e.g. SUP)"
        placeholder="SUP"
        value={portal}
        onChange={(event) => setPortal(readValue(event))}
      />

      <Textfield
        label="Your question (optional — the words are filtered by the server)"
        placeholder="how do I request a new account?"
        value={question}
        onChange={(event) => setQuestion(readValue(event))}
      />

      <Button
        appearance="primary"
        isDisabled={busy}
        onClick={() => run(demanderPortail, { portal: portal, question: question })}
      >
        Ask about the portal
      </Button>

      <Textfield
        label="Request type (id or exact name, e.g. Get IT help)"
        placeholder="Get IT help"
        value={requestType}
        onChange={(event) => setRequestType(readValue(event))}
      />

      <Button
        appearance="primary"
        isDisabled={busy}
        onClick={() =>
          run(decrireFormulaire, {
            request_type: requestType,
            portal: portal,
          })
        }
      >
        Describe the form of this request type
      </Button>

      {busy ? <Spinner /> : null}

      {error ? (
        <SectionMessage appearance="error" title="The app could not answer">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      {answer ? (
        <SectionMessage appearance="success" title="Answer">
          {lignes(answer)}
        </SectionMessage>
      ) : null}
    </>
  );
}

ForgeReconciler.render(<App />);
