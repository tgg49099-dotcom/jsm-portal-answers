# Privacy policy — JSM Portal Answers

**Last updated: 18 November 2026.**

## What this app reads

This app is a set of two read-only tools for the Atlassian MCP server. When a tool is called, it
reads the metadata of the **Jira Service Management customer portal of the site where it is
installed**:

* the list of customer portals (service desk id, project key, project name);
* the categories of a portal (request type groups);
* the request types of a portal: id, name, description, help text, category, whether the caller may
  raise them, and their restriction status;
* the fields of the create form of a request type: label, required or not, type, help text, possible
  values, default values.

## What this app does **not** do

* It **stores nothing**. There is no storage, no key-value store and no entity: no answer, no
  question and no identifier is written anywhere, and nothing survives between two calls.
* It **writes nothing**. Every call to the Atlassian API is a read (`GET`). No request is created,
  no field is changed, no comment is posted.
* It **sends nothing to any third party**. It calls no external service: no analytics, no tracking,
  no logging to an outside system, no e-mail.
* It **does not read** issues, comments, attachments, users or organisations.
* It **does not read another tenant**. The Atlassian platform binds the app to the site where it is
  installed, and every path the app calls is relative to that site.

## Whose data is shown, and to whom

Every read is made with the **identity of the person who called the tool** (`asUser()`), never with
the identity of the app. A tool can therefore only show what that person is already allowed to see
in Jira Service Management — for example, a customer of the portal sees the request types they are
allowed to raise. Nothing is exposed to anyone who could not already read it in Jira.

## The only data that leaves your site

The answer produced by a tool is returned to the MCP client that asked for it, and may then be
displayed by that client or by the assistant connected to it. Once the answer is in the hands of the
MCP client, it is governed by the privacy policy of that client and of the assistant's provider.
The app itself neither keeps a copy nor forwards it anywhere.

## Consent

The first call may require you to grant the app access to Jira Service Management on your site
(the platform asks for consent). Until you accept it, the tools answer with an explicit refusal
message instead of an empty list, and read nothing.

## Contact

Questions about this policy: open an issue on the repository of the app.
