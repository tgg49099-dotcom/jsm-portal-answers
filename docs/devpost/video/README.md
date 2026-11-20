# The demo video of this app

Two files, the exact bytes of the ones delivered for the Codegeist 2026 submission (entry 2):

| file | md5 | size |
|---|---|---|
| `VIDEO-ENTREE2-JSM-PORTAL-ANSWERS.mp4` | `eef5192b4cc8c6eee718db1a8e50659e` | 11 517 026 bytes |
| `VIDEO-ENTREE2-SOUS-TITRES.srt` | `09bd23562b2a460605f164f484b7fb0f` | 2 093 bytes |

The MP4: 1920x1080, 25 i/s, h264 (High) / yuv420p, 4 325 frames, **173.000 s** (2 min 53 s) — below
the 5-minute limit of the contest form. The subtitles are **burned into the picture** (a band at the
bottom of the frame), so the video is silent on purpose and needs no audio track. The `.srt` file is
the same subtitle file in text form: it is the one to import in YouTube Studio if the video is
published there.

## What the video shows, in order

1. **0:00 - 0:17** — title cards: what the app is, and the question it answers.
2. **0:17 - 0:31** — the **real deployed page** of the app, opened in Jira on an Atlassian cloud
   site: the `Apps` menu, `JSM Portal Answers`.
3. **0:31 - 0:45** — the question `SUP` is typed in the page and `Ask about the portal` is clicked.
4. **0:45 - 1:23** — the answer is read: the **9 request types** of the portal `SUP` and their
   **5 categories**, then the rules of the portal.
5. **1:23 - 1:58** — the second tool: `Get IT help` is typed, then
   `Describe the form of this request type`, and the **3 fields** of the create form are shown
   (`Summary` required, `Description` optional, `Attachment` optional).
6. **1:58 - 2:39** — the two MCP tools of the app (`rovo:mcp`): `list_portal_request_types` and
   `describe_request_type_form`; the page calls the same tools; every call is a `GET`.
7. **2:39 - 2:53** — this public repository: source, tests, and the proof of the live run.

## What is honest about it

Step 2 shows the **deployed page on a live Atlassian cloud site**. Steps 3, 4, 5 and 6 show the
app's page **re-rendered locally**, running **live against the customer's portal** with the very
code of this repository (`src/mcp.js`): the answers in the picture are the answers the tools
returned at that moment, not a drawing and not a script. The footer of every frame of that part
says so, in these words:

> This is the app's page, re-rendered locally for this video (the app itself is deployed on an
> Atlassian cloud site). The answers come from the app's own tools (src/mcp.js), running live
> against the customer's portal with read-only GET calls — 19 November 2026.

The video never claims to show a deployed page answering: on a site where the app has not been
granted access yet, Atlassian shows its standard *Allow access* screen, and that is what a
first-time visitor sees.

No account, no password and no captcha were used to make it: the session was obtained from the
Atlassian API and injected into the browser on every request of the site.
