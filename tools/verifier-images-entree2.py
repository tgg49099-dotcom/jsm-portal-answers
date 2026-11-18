#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verifier-images-entree2.py — prove that the 5 images of the gallery are real.

WHAT IT CHECKS
--------------
  1. each PNG is 1500 x 1000 (3:2) and really is a PNG;
  2. each committed file (5 PNG + the live-proof JSON) has the md5 of the
     table printed in the kit (block VIGNETTE_ET_GALERIE), and each PNG is
     pixel-for-pixel what `tools/generer-images-entree2.py` produces from the
     files of the repository. The VERDICT is the decoded pixels, never the
     bytes: another machine, another zlib, re-compresses a PNG differently,
     so the md5 of a regenerated file is only printed as information;
  3. every string the images draw is really in the file it claims to come
     from;
  4. the footer of each image names the commit of the sources (40 hex
     characters) and the images really come from that commit (the file it
     cites is present in the tree of that commit);
  5. COUNTER-PROOF: one copy of the repository holds a PNG with ONE single
     pixel changed; this very script re-run on that copy must answer RED
     (a test that cannot fail proves nothing).

Usage: python3 tools/verifier-images-entree2.py [racine] [--sans-contre-epreuve]
Exit code: 0 when every check passes, 1 otherwise.
"""

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
SOURCES = os.path.join(RACINE, "docs", "devpost", "preuves", "IMAGES-ENTREE2-SOURCES.json")
GENERATEUR = os.path.join(RACINE, "tools", "generer-images-entree2.py")
KIT = os.path.join(RACINE, "docs", "devpost", "BLOCS-DEVPOST-22-11-ENTREE2.txt")

# The md5 of every file the kit links. Measured on 18 November 2026 (by the
# Direction and again locally); the same table stands in the kit, so the owner
# can check any download against it. A committed file whose md5 differs from
# this table is NOT the file the links promise.
MD5_ATTENDUS = {
    "docs/devpost/ENTREE2-IMAGES/entree2-vignette-1500x1000.png":
        "1eb84cd4c66111887e5b0f016b10fd6d",
    "docs/devpost/ENTREE2-IMAGES/entree2-outils-1500x1000.png":
        "8caf86233c317d06488b5f75afb4b564",
    "docs/devpost/ENTREE2-IMAGES/entree2-reponse-1500x1000.png":
        "4328b20d9314e284f5909275e041f442",
    "docs/devpost/ENTREE2-IMAGES/entree2-types-1500x1000.png":
        "772ac9dbdbd66fb1a2b2d3e22a80a96f",
    "docs/devpost/ENTREE2-IMAGES/entree2-perimetre-1500x1000.png":
        "09a41ba8cce1305900f9b62df0d333c2",
    "docs/devpost/preuves/run-outils-live-2026-11-18.json":
        "6f20b78a9bd220c502e2096813dafded",
}

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


def info(nom):
    print("  INFO " + nom)


def md5_fichier(chemin):
    h = hashlib.md5()
    with open(chemin, "rb") as f:
        for bloc in iter(lambda: f.read(65536), b""):
            h.update(bloc)
    return h.hexdigest()


def pixels_identiques(chemin_a, chemin_b):
    """True when the two DECODED images hold exactly the same pixels.

    This is the verdict of section 2: the bytes of a PNG may differ between
    machines (zlib compression) while the picture is the same.
    """
    with Image.open(chemin_a) as a, Image.open(chemin_b) as b:
        if a.mode != b.mode or a.size != b.size:
            return False
        return ImageChops.difference(a, b).getbbox() is None


def lire(chemin):
    with open(chemin, "r", encoding="utf-8") as f:
        return f.read()


def copier_depot(bac):
    """Copy what the generator and this verifier need into a sandbox."""
    for dossier in ["tools", "docs/devpost/preuves", "docs/devpost/ENTREE2-IMAGES"]:
        cible = os.path.join(bac, dossier)
        os.makedirs(cible, exist_ok=True)
        for nom in os.listdir(os.path.join(RACINE, dossier)):
            shutil.copy2(os.path.join(RACINE, dossier, nom), os.path.join(cible, nom))
    shutil.copy2(os.path.join(RACINE, "manifest.yml"), os.path.join(bac, "manifest.yml"))
    shutil.copy2(os.path.join(RACINE, "README.md"), os.path.join(bac, "README.md"))
    shutil.copy2(KIT, os.path.join(bac, "docs", "devpost", "BLOCS-DEVPOST-22-11-ENTREE2.txt"))


def contre_epreuve():
    """Re-run this script on a copy of the repository whose thumbnail has
    ONE single pixel changed: it must answer RED, and only about that."""
    print("\n5. counter-proof: one changed pixel must make the verifier RED")
    with tempfile.TemporaryDirectory(prefix="images-entree2-sabotage-") as bac:
        copier_depot(bac)
        vignette = os.path.join(bac, "docs", "devpost", "ENTREE2-IMAGES",
                                "entree2-vignette-1500x1000.png")
        # Unit check of the detector itself: change exactly one pixel.
        with Image.open(vignette) as im:
            copie = im.copy()
            original = copie.getpixel((10, 10))
            copie.putpixel((10, 10), tuple(255 - v if i == 0 else v
                                           for i, v in enumerate(original)))
            copie.save(vignette)
        reference = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES",
                                 "entree2-vignette-1500x1000.png")
        verifier("the pixel comparison detects the 1 changed pixel (unit check)",
                 not pixels_identiques(vignette, reference))
        info("the md5 changed too: " + md5_fichier(vignette) + " (expected "
             + MD5_ATTENDUS["docs/devpost/ENTREE2-IMAGES/entree2-vignette-1500x1000.png"] + ")")
        # End-to-end check: the whole verifier, re-run on the tampered copy.
        shutil.copytree(os.path.join(RACINE, ".git"), os.path.join(bac, ".git"))
        relance = subprocess.run(
            [sys.executable, os.path.join(bac, "tools", "verifier-images-entree2.py"),
             bac, "--sans-contre-epreuve"],
            capture_output=True, text=True, timeout=300,
        )
        lignes_rouges = [l.strip() for l in relance.stdout.split("\n")
                         if l.strip().startswith("RED")]
        attendues = [l for l in lignes_rouges if "entree2-vignette" in l]
        autres = [l for l in lignes_rouges if "entree2-vignette" not in l]
        verifier("the re-run on the tampered copy exits non-zero (exit "
                 + str(relance.returncode) + ")", relance.returncode != 0)
        verifier("the re-run turns RED about the tampered thumbnail",
                 len(attendues) >= 2, "; ".join(lignes_rouges[:4]))
        verifier("the re-run is RED about nothing else", not autres,
                 "; ".join(autres[:4]))
        for l in lignes_rouges:
            info("re-run output: " + l.strip())


def main():
    global RACINE, SORTIE, SOURCES, GENERATEUR, KIT
    sans_contre_epreuve = "--sans-contre-epreuve" in sys.argv
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        RACINE = os.path.abspath(sys.argv[1])
        SORTIE = os.path.join(RACINE, "docs", "devpost", "ENTREE2-IMAGES")
        SOURCES = os.path.join(RACINE, "docs", "devpost", "preuves", "IMAGES-ENTREE2-SOURCES.json")
        GENERATEUR = os.path.join(RACINE, "tools", "generer-images-entree2.py")
        KIT = os.path.join(RACINE, "docs", "devpost", "BLOCS-DEVPOST-22-11-ENTREE2.txt")

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

    # 2 — integrity of the committed files, then pixel-for-pixel determinism
    print("\n2. the committed md5, then the pixels (the verdict is the pixels)")
    for chemin_relatif in sorted(MD5_ATTENDUS):
        chemin = os.path.join(RACINE, chemin_relatif)
        if not os.path.isfile(chemin):
            verifier(chemin_relatif + " has the md5 of the kit table", False, "file missing")
            continue
        mesure = md5_fichier(chemin)
        verifier(chemin_relatif + " has the md5 of the kit table",
                 mesure == MD5_ATTENDUS[chemin_relatif],
                 "md5 is " + mesure)
    texte_kit = lire(KIT) if os.path.isfile(KIT) else ""
    for chemin_relatif in sorted(MD5_ATTENDUS):
        nom = os.path.basename(chemin_relatif)
        verifier(nom + " + its md5 stand in the kit",
                 nom in texte_kit and MD5_ATTENDUS[chemin_relatif] in texte_kit)

    with tempfile.TemporaryDirectory(prefix="images-entree2-") as bac:
        copier_depot(bac)
        resultat = subprocess.run(
            [sys.executable, os.path.join(bac, "tools", "generer-images-entree2.py"), sha, bac],
            capture_output=True, text=True,
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
                if pixels_identiques(refait, os.path.join(SORTIE, nom)):
                    verifier(nom + ": pixels identical to the regeneration", True)
                else:
                    verifier(nom + ": pixels identical to the regeneration", False,
                             "pixels differ")
                if md5_fichier(refait) == md5_fichier(os.path.join(SORTIE, nom)):
                    info(nom + ": the regeneration is byte-identical here too (same md5)")
                else:
                    info(nom + ": the regeneration compresses differently (md5 differs) "
                         "but the pixels are the ones checked above")

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
            capture_output=True, text=True,
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

    if not sans_contre_epreuve:
        contre_epreuve()

    print("\n%d checks passed, %d failed" % (reussies, len(echecs)))
    if echecs:
        for e in echecs:
            print("  RED  " + e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
