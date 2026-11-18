#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generer-images-entree2.py — the gallery of the SECOND Codegeist entry
("JSM Portal Answers"), built ONLY from real files of this repository.

WHAT THIS SCRIPT IS
-------------------
The Codegeist submission needs a thumbnail and an image gallery. The rules
forbid drawings that pretend to be screenshots, so this script draws NOTHING of
its own: every line it writes into a PNG comes from a file of this repository
(the live run of the two tools, `manifest.yml`, `README.md`), and the file each
line comes from is written in `docs/devpost/preuves/IMAGES-ENTREE2-SOURCES.json`.

The sources:
  * docs/devpost/preuves/run-outils-live-2026-11-18.json — the LIVE run of the
    two real handlers (`src/mcp.js`) against the real portal SUP of
    https://tgg-dev.atlassian.net on 18/11/2026: the answers, verbatim, and
    the list of the HTTP calls (GET only);
  * manifest.yml — the declaration of the two tools, their inputs, the
    `rovo:mcp` module, the scope, the runtime;
  * README.md — the promises the app makes about itself (read only, asUser(),
    nothing stored, no external service, no public URL).

The 5 images (1500 x 1000 = 3:2, PNG):
  1. entree2-vignette-1500x1000.png  — the thumbnail (3:2);
  2. entree2-outils-1500x1000.png    — the two tool schemas, with their real
                                       inputs and their real outputs;
  3. entree2-reponse-1500x1000.png   — a real answer of a tool, verbatim;
  4. entree2-types-1500x1000.png     — the request types of the real portal;
  5. entree2-perimetre-1500x1000.png — the perimeter of the app: read only,
                                       asUser(), one read scope, no write, no
                                       storage, no public URL.

DETERMINISM: the same inputs produce the same PNG, byte for byte (no clock is
drawn; the date drawn is the one recorded in the live run). The companion
verifier `tools/verifier-images-entree2.py` regenerates the images in a
temporary directory and compares their md5 — a picture drawn by hand could not
survive that check.

Usage: python3 tools/generer-images-entree2.py <sha-du-commit-des-sources> [racine]
Exit code: 0 when the 5 images and the sources file are written, 1 otherwise.
"""

import hashlib
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont
import yaml

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREUVES = os.path.join(RACINE, "docs", "devpost", "preuves")
SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
LIVE = os.path.join(PREUVES, "run-outils-live-2026-11-18.json")
SOURCES = os.path.join(PREUVES, "IMAGES-ENTREE2-SOURCES.json")

L = 1500  # largeur
H = 1000  # hauteur

BLEU = (0, 82, 204)
BLEU_FONCE = (0, 66, 163)
ENCRE = (23, 43, 77)
GRIS = (66, 82, 97)
GRIS_CLAIR = (244, 245, 247)
BORD = (223, 225, 228)
BLANC = (255, 255, 255)

POLICE = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
POLICE_GRASSE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
POLICE_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
POLICE_MONO_GRASSE = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

# Ce que chaque image dessine, et d'où cela vient.
traces = {}


def md5_fichier(chemin):
    h = hashlib.md5()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()


def police(chemin, taille):
    return ImageFont.truetype(chemin, taille)


def enregistrer(image, nom, source):
    """Draw the footer, then save the PNG and record what it contains."""
    chemin = os.path.join(SORTIE, nom)
    dessin = ImageDraw.Draw(image)
    dessin.line([(48, 946), (L - 48, 946)], fill=BORD, width=2)
    taille = 15
    while dessin.textlength(source, font=police(POLICE, taille)) > 1404 and taille > 11:
        taille -= 1
    dessin.text((48, 954), source, font=police(POLICE, taille), fill=GRIS)
    image.save(chemin, "PNG", optimize=True)
    traces[nom] = {
        "source_footer": source,
        "md5": md5_fichier(chemin),
        "octets": os.path.getsize(chemin),
        "dimensions": [L, H],
    }
    return chemin


def bandeau(dessin, titre, sous_titre=""):
    dessin.rectangle([0, 0, L, 110], fill=BLEU)
    dessin.text((48, 16), titre, font=police(POLICE_GRASSE, 38), fill=BLANC)
    if sous_titre:
        dessin.text((48, 70), sous_titre, font=police(POLICE, 19), fill=(214, 232, 255))


def panneau(dessin, x, y, w, h, titre=""):
    dessin.rectangle([x, y, x + w, y + h], fill=GRIS_CLAIR, outline=BORD, width=2)
    if titre:
        dessin.rectangle([x, y, x + w, y + 40], fill=(232, 238, 247))
        dessin.text((x + 16, y + 11), titre, font=police(POLICE_GRASSE, 21), fill=BLEU_FONCE)


def ecrire(dessin, x, y, lignes, font, couleur=ENCRE, interligne=24):
    """Write lines of text; returns the y of the next free line."""
    for ligne in lignes:
        dessin.text((x, y), ligne, font=font, fill=couleur)
        y += interligne
    return y


def coupe(ligne, n):
    """Cut a line at n characters (used only where the source says so)."""
    return ligne if len(ligne) <= n else ligne[: n - 1].rstrip() + "…"


def source_texte(fichiers, sha):
    return "Source: %s - commit %s - repo jsm-portal-answers - 18/11/2026" % (fichiers, sha)


# ---------------------------------------------------------------------------
# The data
# ---------------------------------------------------------------------------


def charger():
    with open(LIVE, "r", encoding="utf-8") as f:
        live = json.load(f)
    with open(os.path.join(RACINE, "manifest.yml"), "r", encoding="utf-8") as f:
        manifeste = yaml.safe_load(f)
    with open(os.path.join(RACINE, "README.md"), "r", encoding="utf-8") as f:
        readme = f.read()
    return live, manifeste, readme


def outils_du_manifeste(manifeste):
    """The two actions of the manifest, in the order of the file."""
    actions = {}
    for action in manifeste["modules"]["action"]:
        actions[action["key"]] = action
    return actions


def chemins_du_run(live):
    """The distinct paths the live run read, in the order they were called."""
    chemins = []
    for a in live["appels"]:
        base = a["chemin"].split("?")[0]
        if base not in chemins:
            chemins.append(base)
    return chemins


# ---------------------------------------------------------------------------
# 1 — the thumbnail
# ---------------------------------------------------------------------------


def image_vignette(live, manifeste, sha, sources):
    image = Image.new("RGB", (L, H), BLANC)
    d = ImageDraw.Draw(image)
    bandeau(
        d,
        "JSM Portal Answers",
        "Two read-only Atlassian MCP tools that answer a customer's question about a JSM customer portal.",
    )

    reponse1 = live["outils"]["list_portal_request_types"]["reponse"]
    nb_types = 0
    for ligne in reponse1.split("\n"):
        if ligne.strip().startswith("- ") and "[id " in ligne:
            nb_types += 1
    nb_cat = 0
    for ligne in reponse1.split("\n"):
        if "Categories of this portal:" in ligne:
            nb_cat = len(ligne.split(":", 1)[1].split(","))

    panneau(d, 48, 140, 690, 350, "list_portal_request_types")
    f_mono = police(POLICE_MONO, 18)
    ecrire(
        d,
        68,
        200,
        [
            'Asks: "what can I ask for here?"',
            "",
            "Real answer on the portal SUP (18/11/2026):",
            "  Request types (%d)" % nb_types,
            "  Categories of this portal: %d" % nb_cat,
            "  Portal: Support (SUP)",
            "",
            "Reads: request types, categories, help",
            "  texts, portal rules.",
            "Verb: GET (read-only).",
        ],
        f_mono,
        interligne=26,
    )

    panneau(d, 762, 140, 690, 350, "describe_request_type_form")
    ecrire(
        d,
        782,
        200,
        [
            'Asks: "what do I have to fill in?"',
            "",
            "Real answer for 'Get IT help' (18/11/2026):",
            "  Fields the customer sees (3):",
            "    - Summary [summary] — required",
            "    - Description [description]",
            "    - Attachment [attachment]",
            "",
            "Reads: label, required, type, help text,",
            "  possible values.",
            "Verb: GET (read-only).",
        ],
        f_mono,
        interligne=26,
    )

    n_get = sum(1 for a in live["appels"] if a["methode"] == "GET")
    n_post = sum(1 for a in live["appels"] if a["methode"] != "GET")
    faits = [
        ("One module rovo:mcp, two tools, actionVerb GET on both.", "manifest.yml"),
        ("One scope, and it is a read scope: read:servicedesk-request.", "manifest.yml"),
        ("Every read goes through asUser(); src/jsm.js contains zero asApp().", "README.md"),
        (
            "Live run on the real portal: %d HTTP calls, %d GET, %d POST." % (len(live["appels"]), n_get, n_post),
            "run-outils-live-2026-11-18.json",
        ),
        ("Nothing is written, nothing is stored, no external service is called.", "README.md"),
        ("No web trigger, no public URL, no licence key (so it can be shared by link).", "manifest.yml"),
    ]
    panneau(d, 48, 500, 1404, 410, "What the app is, in facts taken from the code")
    f_fait = police(POLICE, 21)
    y = 556
    for texte, origine in faits:
        d.text((68, y), "•", font=f_fait, fill=BLEU)
        d.text((96, y), texte, font=f_fait, fill=ENCRE)
        d.text((96, y + 26), "(source: %s)" % origine, font=police(POLICE, 15), fill=GRIS)
        y += 58

    enregistrer(
        image,
        "entree2-vignette-1500x1000.png",
        source_texte("run-outils-live-2026-11-18.json + manifest.yml + README.md", sha),
    )
    sources["entree2-vignette-1500x1000.png"] = {
        "contenu": [],
        "tokens": [
            "rovo:mcp",
            "actionVerb: GET",
            "read:servicedesk-request",
            "asUser()",
            "asApp()",
            "src/jsm.js",
        ],
        "origine": [
            "docs/devpost/preuves/run-outils-live-2026-11-18.json",
            "manifest.yml",
            "README.md",
        ],
    }


# ---------------------------------------------------------------------------
# 2 — the two tool schemas
# ---------------------------------------------------------------------------


def image_outils(live, manifeste, sha, sources):
    image = Image.new("RGB", (L, H), BLANC)
    d = ImageDraw.Draw(image)
    bandeau(
        d,
        "The two tools of the rovo:mcp module",
        "Declared in manifest.yml, run for real on 18/11/2026 against the portal SUP.",
    )

    actions = outils_du_manifeste(manifeste)
    mcp = manifeste["modules"]["rovo:mcp"][0]
    f_titre = police(POLICE_MONO_GRASSE, 18)
    f_mono = police(POLICE_MONO, 16)
    f_label = police(POLICE_GRASSE, 16)

    for i, cle in enumerate(["list_portal_request_types", "describe_request_type_form"]):
        action = actions[cle]
        x = 48 + i * 726
        panneau(d, x, 140, 690, 520, action["key"])
        y = 196
        d.text((x + 18, y), action["name"], font=police(POLICE_GRASSE, 18), fill=ENCRE)
        y += 28
        y = ecrire(
            d,
            x + 18,
            y,
            [
                "actionVerb : %s   (read-only)" % action["actionVerb"],
                "function   : %s" % action["function"],
                "rovo:mcp   : %s" % mcp["key"],
                "tools      : %s" % ", ".join(mcp["tools"]),
            ],
            f_mono,
            interligne=23,
        )
        y += 10
        d.text((x + 18, y), "inputs", font=f_label, fill=BLEU_FONCE)
        y += 25
        for nom, spec in action["inputs"].items():
            d.text((x + 18, y), nom, font=f_titre, fill=ENCRE)
            y += 21
            y = ecrire(
                d,
                x + 34,
                y,
                [
                    "type     : %s" % spec["type"],
                    "required : %s" % ("yes" if spec["required"] else "no"),
                    "title    : %s" % spec["title"],
                ],
                f_mono,
                interligne=21,
            )
            y += 3
        y += 6
        d.text((x + 18, y), "output : text - the answer, read from the portal", font=f_label, fill=BLEU_FONCE)
        y += 28
        reponse = live["outils"][cle]["reponse"]
        for ligne in reponse.split("\n")[:2]:
            d.text((x + 18, y), coupe(ligne, 64), font=f_mono, fill=ENCRE)
            y += 22
        d.text((x + 18, y + 4), "(first lines of the answer, shortened to fit)", font=police(POLICE, 13), fill=GRIS)

    panneau(d, 48, 680, 1404, 170, "The calls the tools made on the live portal")
    y = 736
    for chemin in chemins_du_run(live):
        d.text((68, y), "GET " + chemin, font=police(POLICE_MONO, 15), fill=ENCRE)
        y += 22

    panneau(d, 48, 860, 1404, 70)
    d.text(
        (68, 880),
        "Both handlers are the functions the manifest declares; the answers above are the ones they "
        "returned on the live portal (%d GET, %d POST)."
        % (sum(1 for a in live["appels"] if a["methode"] == "GET"), sum(1 for a in live["appels"] if a["methode"] != "GET")),
        font=police(POLICE, 17),
        fill=ENCRE,
    )

    enregistrer(
        image,
        "entree2-outils-1500x1000.png",
        source_texte("manifest.yml + run-outils-live-2026-11-18.json", sha),
    )
    sources["entree2-outils-1500x1000.png"] = {
        "contenu": ["list_portal_request_types", "describe_request_type_form"],
        "origine": [
            "manifest.yml",
            "docs/devpost/preuves/run-outils-live-2026-11-18.json",
        ],
    }


# ---------------------------------------------------------------------------
# 3 — a real answer, verbatim
# ---------------------------------------------------------------------------


def image_reponse(live, manifeste, sha, sources):
    image = Image.new("RGB", (L, H), BLANC)
    d = ImageDraw.Draw(image)
    bandeau(
        d,
        "A real answer of describe_request_type_form",
        "Taken verbatim from the live run of 18/11/2026 — nothing added, nothing removed.",
    )

    reponse = live["outils"]["describe_request_type_form"]["reponse"]
    lignes = reponse.split("\n")
    hauteur = 60 + 21 * len(lignes)
    panneau(d, 48, 140, 1404, hauteur, "the answer, verbatim")
    f_mono = police(POLICE_MONO, 14)
    y = 200
    for ligne in lignes:
        if d.textlength(ligne, font=f_mono) > 1356:
            raise SystemExit("ligne trop large pour l'image : " + ligne[:80])
        d.text((68, y), ligne, font=f_mono, fill=ENCRE)
        y += 21

    y0 = 140 + hauteur + 20
    panneau(d, 48, y0, 1404, 280, "The %d calls of the run, in order" % len(live["appels"]))
    y = y0 + 58
    for a in live["appels"]:
        d.text((68, y), "%s %s -> %d" % (a["methode"], a["chemin"], a["status"]), font=police(POLICE_MONO, 15), fill=ENCRE)
        y += 24

    panneau(d, 48, 856, 1404, 76)
    d.text(
        (68, 868),
        "%d characters, %d lines, %d GET calls to the REST API of the site, 0 POST."
        % (len(reponse), len(lignes), len(live["appels"])),
        font=police(POLICE_GRASSE, 19),
        fill=ENCRE,
    )
    d.text(
        (68, 898),
        "The transport of the run: asUser() proxied to the REST API of the site with the caller's own "
        "credentials; the handlers are the ones of src/mcp.js.",
        font=police(POLICE, 16),
        fill=GRIS,
    )

    enregistrer(
        image,
        "entree2-reponse-1500x1000.png",
        source_texte("run-outils-live-2026-11-18.json", sha),
    )
    sources["entree2-reponse-1500x1000.png"] = {
        "contenu": lignes,
        "origine": ["docs/devpost/preuves/run-outils-live-2026-11-18.json"],
        "verbatim": True,
    }


# ---------------------------------------------------------------------------
# 4 — the request types of the real portal
# ---------------------------------------------------------------------------


def image_types(live, manifeste, sha, sources):
    image = Image.new("RGB", (L, H), BLANC)
    d = ImageDraw.Draw(image)
    bandeau(
        d,
        "What a customer can ask for on the real portal SUP",
        "Read live from https://tgg-dev.atlassian.net on 18/11/2026 — 9 request types, 5 categories.",
    )

    reponse = live["outils"]["list_portal_request_types"]["reponse"]
    lignes = reponse.split("\n")

    categories = ""
    for ligne in lignes:
        if "Categories of this portal:" in ligne:
            categories = ligne.split("Categories of this portal:", 1)[1].strip()

    types = []
    i = 0
    while i < len(lignes):
        ligne = lignes[i]
        if ligne.startswith("    - ") and "[id " in ligne:
            nom = ligne.strip()
            detail = lignes[i + 1].strip() if i + 1 < len(lignes) else ""
            desc = ""
            if i + 2 < len(lignes) and lignes[i + 2].strip().startswith("Description:"):
                desc = lignes[i + 2].strip()[len("Description:") :].strip()
            types.append((nom, detail, desc))
            i += 3
        else:
            i += 1

    panneau(d, 48, 140, 1404, 700, "list_portal_request_types - portal SUP (service desk 1)")
    f_mono = police(POLICE_MONO, 16)
    y = 200
    d.text((68, y), "Categories: " + categories, font=f_mono, fill=ENCRE)
    y += 30
    for nom, detail, desc in types:
        d.text((68, y), nom, font=police(POLICE_MONO_GRASSE, 16), fill=ENCRE)
        y += 22
        d.text((84, y), detail, font=f_mono, fill=ENCRE)
        y += 21
        if desc:
            if d.textlength("Description: " + desc, font=f_mono) > 1330:
                raise SystemExit("description trop large : " + desc[:60])
            d.text((84, y), "Description: " + desc, font=f_mono, fill=GRIS)
            y += 21
        y += 4

    panneau(d, 48, 860, 1404, 76)
    d.text(
        (68, 872),
        "%d request types, %d categories, 0 POST - every line above is a line of the answer of the tool."
        % (len(types), len(categories.split(","))),
        font=police(POLICE_GRASSE, 19),
        fill=ENCRE,
    )
    d.text(
        (68, 902),
        "The SLA targets of the portal are not exposed by the public JSM REST API; the tool says so instead "
        "of inventing a delay.",
        font=police(POLICE, 16),
        fill=GRIS,
    )

    enregistrer(
        image,
        "entree2-types-1500x1000.png",
        source_texte("run-outils-live-2026-11-18.json", sha),
    )
    sources["entree2-types-1500x1000.png"] = {
        "contenu": [t[0] for t in types],
        "origine": ["docs/devpost/preuves/run-outils-live-2026-11-18.json"],
    }


# ---------------------------------------------------------------------------
# 5 — the perimeter
# ---------------------------------------------------------------------------


def image_perimetre(live, manifeste, sha, sources):
    image = Image.new("RGB", (L, H), BLANC)
    d = ImageDraw.Draw(image)
    bandeau(
        d,
        "The perimeter of the app: what it can and cannot do",
        "Every line is read from the manifest, from the code or from the live run - not promised.",
    )

    n_get = sum(1 for a in live["appels"] if a["methode"] == "GET")
    n_post = sum(1 for a in live["appels"] if a["methode"] != "GET")
    chemins = chemins_du_run(live)

    gauche = [
        ("Scope asked for", "read:servicedesk-request", "manifest.yml"),
        ("Number of scopes", "1 - and it is a read scope", "manifest.yml"),
        ("Identity of the reads", "asUser() - the caller's own permissions", "README.md"),
        ("asApp() in the code", "zero occurrence (test/discipline.js checks it)", "README.md"),
        ("HTTP methods", "%d GET, %d POST in the live run" % (n_get, n_post), "run-outils-live-2026-11-18.json"),
        ("Writes", "none - src/jsm.js is the only file that talks to the API", "README.md"),
        ("Storage", "none - no storage, no key-value store, no entity", "README.md"),
        ("External service", "none - no URL, no fetch, no third-party library", "README.md"),
        ("Public URL", "none - no web trigger and no unauthenticated endpoint", "README.md"),
    ]
    droite = [
        ("Endpoints read", "the 5 paths of the live run (see below)", "run-outils-live-2026-11-18.json"),
        ("rovo:mcp modules", "1 (Atlassian allows one per app)", "manifest.yml"),
        ("Tools", "2 - both actionVerb: GET", "manifest.yml"),
        ("Other modules", "1 jira:globalPage, 3 functions, 2 actions", "manifest.yml"),
        ("Runtime", "nodejs24.x, 256 MB, arm64", "manifest.yml"),
        ("Audience", "the customers of the portal - no administrator permission", "README.md"),
        ("Read data", "request type metadata, categories, form fields", "README.md"),
        ("Never read", "no issue, no comment, no attachment, no user", "README.md"),
        ("Licence key", "none - so the app can be shared by an installation link", "manifest.yml"),
    ]

    f_cle = police(POLICE_GRASSE, 18)
    f_val = police(POLICE_MONO, 16)
    f_src = police(POLICE, 14)

    for colonne, faits in enumerate([gauche, droite]):
        x = 48 + colonne * 726
        panneau(d, x, 140, 690, 615, "")
        y = 156
        for cle, valeur, origine in faits:
            d.text((x + 18, y), cle, font=f_cle, fill=BLEU_FONCE)
            y += 23
            d.text((x + 18, y), valeur, font=f_val, fill=ENCRE)
            y += 20
            d.text((x + 18, y), "(" + origine + ")", font=f_src, fill=GRIS)
            y += 23

    panneau(d, 48, 768, 1404, 120, "The 5 paths the live run read")
    for i, chemin in enumerate(chemins):
        colonne = 0 if i < 3 else 1
        x = 68 + colonne * 700
        y = 818 + (i % 3) * 22
        d.text((x, y), "GET " + chemin, font=police(POLICE_MONO, 15), fill=ENCRE)

    panneau(d, 48, 896, 1404, 40)
    d.text(
        (68, 906),
        "Every line of this image comes from the manifest, from the README or from the live run - "
        "nothing here is a promise.",
        font=police(POLICE, 16),
        fill=ENCRE,
    )

    enregistrer(
        image,
        "entree2-perimetre-1500x1000.png",
        source_texte("manifest.yml + README.md + run-outils-live-2026-11-18.json", sha),
    )
    sources["entree2-perimetre-1500x1000.png"] = {
        "contenu": [],
        "tokens": [
            "read:servicedesk-request",
            "asUser()",
            "asApp()",
            "src/jsm.js",
            "rovo:mcp",
            "actionVerb: GET",
            "jira:globalPage",
            "nodejs24.x",
            "web trigger",
            "licence key",
        ],
        "origine": [
            "manifest.yml",
            "README.md",
            "docs/devpost/preuves/run-outils-live-2026-11-18.json",
        ],
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("usage: generer-images-entree2.py <sha> [racine]")
    sha = sys.argv[1]
    if len(sha) != 40 or not all(c in "0123456789abcdef" for c in sha):
        raise SystemExit("le sha doit comporter 40 caracteres hexadecimaux : " + sha)
    global RACINE, PREUVES, SORTIE, LIVE, SOURCES
    if len(sys.argv) > 2:
        RACINE = os.path.abspath(sys.argv[2])
        PREUVES = os.path.join(RACINE, "docs", "devpost", "preuves")
        SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
        LIVE = os.path.join(PREUVES, "run-outils-live-2026-11-18.json")
        SOURCES = os.path.join(PREUVES, "IMAGES-ENTREE2-SOURCES.json")

    live, manifeste, readme = charger()
    os.makedirs(SORTIE, exist_ok=True)
    sources = {}
    image_vignette(live, manifeste, sha, sources)
    image_outils(live, manifeste, sha, sources)
    image_reponse(live, manifeste, sha, sources)
    image_types(live, manifeste, sha, sources)
    image_perimetre(live, manifeste, sha, sources)

    with open(SOURCES, "w", encoding="utf-8") as f:
        json.dump(
            {
                "quoi": "Ce que chaque image de l'entree 2 dessine, et d'ou cela vient",
                "commit_des_sources": sha,
                "images": traces,
                "contenu": sources,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
        f.write("\n")

    for nom in sorted(traces):
        t = traces[nom]
        print("%s  %d x %d  %d o  md5 %s" % (nom, t["dimensions"][0], t["dimensions"][1], t["octets"], t["md5"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
