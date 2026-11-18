#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-images-entree2.py — prove that the 5 images of the gallery are real.

WHAT IT CHECKS
--------------
  1. each PNG is 1500 x 1000 (3:2) and really is a PNG;
  2. each PNG is byte-for-byte what `tools/generer-images-entree2.py` produces
     from the files of the repository — the images are regenerated in a
     sandbox and their md5 compared, so a picture drawn by hand could not
     survive this check;
  3. every string the images draw is really in the file it claims to come
     from;
  4. the footer of each image names the commit of the sources (40 hex
     characters) and the images really come from that commit (the file it
     cites is present in the tree of that commit).

Usage: python3 tools/verifier-images-entree2.py [racine]
Exit code: 0 when every check passes, 1 otherwise.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
SOURCES = os.path.join(RACINE, "docs", "devpost", "preuves", "IMAGES-ENTREE2-SOURCES.json")
GENERATEUR = os.path.join(RACINE, "tools", "generer-images-entree2.py")

echecs = []
reussies = 0


def verifier(nom, condition, detail=""):
    global reussies
    if condition:
        reussies += 1
        print("  OK   " + nom)
    else:
        echecs.append(nom + (" — " + detail if detail else ""))
        print("  RED  " + nom + (" — " + detail if detail else ""))


def md5_fichier(chemin):
    h = hashlib.md5()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()


def lire(chemin):
    with open(chemin, "r", encoding="utf-8") as f:
        return f.read()


def main():
    global RACINE, SORTIE, SOURCES, GENERATEUR
    if len(sys.argv) > 1:
        RACINE = os.path.abspath(sys.argv[1])
        SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
        SOURCES = os.path.join(RACINE, "docs", "devpost", "preuves", "IMAGES-ENTREE2-SOURCES.json")
        GENERATEUR = os.path.join(RACINE, "tools", "generer-images-entree2.py")

    if not os.path.isfile(SOURCES):
        print("sources file missing: " + SOURCES)
        return 1
    with open(SOURCES, "r", encoding="utf-8") as f:
        sources = json.load(f)
    sha = sources["commit_des_sources"]

    print("Source commit of the images: " + sha)

    # 1 — format and size
    print("\n1. format and size")
    for nom in sorted(sources["images"]):
        chemin = os.path.join(SORTIE, nom)
        if not os.path.isfile(chemin):
            verifier(nom + " exists", False, "file missing")
            continue
        with Image.open(chemin) as im:
            taille = im.size
            format_ = im.format
        verifier(
            nom + " is a PNG of 1500 x 1000",
            format_ == "PNG" and taille == (1500, 1000),
            "%s %s" % (format_, taille),
        )

    # 2 — determinism: regenerate in a sandbox and compare the md5
    print("\n2. the images are what the generator produces (byte for byte)")
    with tempfile.TemporaryDirectory(prefix="images-entree2-") as bac:
        for dossier in ["tools", "docs/devpost/preuves"]:
            cible = os.path.join(bac, dossier)
            os.makedirs(cible, exist_ok=True)
            for nom in os.listdir(os.path.join(RACINE, dossier)):
                shutil.copy2(os.path.join(RACINE, dossier, nom), os.path.join(cible, nom))
        shutil.copy2(os.path.join(RACINE, "manifest.yml"), os.path.join(bac, "manifest.yml"))
        shutil.copy2(os.path.join(RACINE, "README.md"), os.path.join(bac, "README.md"))
        shutil.copy2(GENERATEUR, os.path.join(bac, "tools", "generer-images-entree2.py"))
        resultat = subprocess.run(
            [sys.executable, os.path.join(bac, "tools", "generer-images-entree2.py"), sha, bac],
            capture_output=True,
            text=True,
        )
        if resultat.returncode != 0:
            verifier("the generator runs", False, resultat.stderr.strip()[-300:])
        else:
            verifier("the generator runs", True)
            for nom in sorted(sources["images"]):
                refait = os.path.join(bac, "docs", "devpost", "ENTREE2-IMAGES", nom)
                if not os.path.isfile(refait):
                    verifier(nom + " is regenerated", False, "missing in the sandbox")
                    continue
                verifier(
                    nom + " is regenerated identically",
                    md5_fichier(refait) == md5_fichier(os.path.join(SORTIE, nom)),
                    "md5 differ",
                )

    # 3 — every drawn string is really in the file it claims
    print("\n3. every drawn string is in the file it claims")
    for nom in sorted(sources["contenu"]):
        entree = sources["contenu"][nom]
        for origine in entree["origine"]:
            chemin = os.path.join(RACINE, origine)
            if not os.path.isfile(chemin):
                verifier(nom + ": " + origine + " exists", False, "file missing")
                continue
            texte = lire(chemin)
            manque = []
            for ligne in entree["contenu"]:
                if not isinstance(ligne, str):
                    continue
                if ligne not in texte:
                    manque.append(ligne[:60])
            verifier(
                nom + ": its %d lines are in %s" % (len(entree["contenu"]), origine),
                not manque,
                "not found: " + "; ".join(manque[:3]),
            )

        # The paraphrased facts are checked by their identifiers: each token
        # must really be in one of the files the image cites.
        jetons = entree.get("tokens", [])
        if jetons:
            textes = "".join(lire(os.path.join(RACINE, o)) for o in entree["origine"])
            absents = [t for t in jetons if t not in textes]
            verifier(
                nom + ": its %d identifiers are in the cited files" % len(jetons),
                not absents,
                "not found: " + ", ".join(absents[:3]),
            )

    # 4 — the commit named in the footer really holds the cited files
    print("\n4. the commit named in the footers really holds the sources")
    try:
        listing = subprocess.run(
            ["git", "-C", RACINE, "ls-tree", "-r", "--name-only", sha],
            capture_output=True,
            text=True,
        )
        if listing.returncode != 0:
            verifier("the commit " + sha + " exists", False, listing.stderr.strip()[-200:])
        else:
            fichiers = set(listing.stdout.split("\n"))
            verifier("the commit " + sha + " exists", True)
            cites = set()
            for nom in sources["contenu"]:
                cites.update(sources["contenu"][nom]["origine"])
            for origine in sorted(cites):
                verifier(origine + " is in the commit " + sha[:8], origine in fichiers, "not in the tree")
    except FileNotFoundError:
        verifier("git is available", False)

    print("\n%d checks passed, %d failed" % (reussies, len(echecs)))
    if echecs:
        for e in echecs:
            print("  RED  " + e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
