#!/usr/bin/env python3
"""Vérifie qu'une release minifiée par R8 garde ce que Retrofit et kotlinx.serialization lisent à l'exécution (#13404).

Deux défauts que seul l'artefact minifié montre (#13400, correctif 9863555c45) :
- une méthode Retrofit dont la SIGNATURE GÉNÉRIQUE a perdu un argument de type (ApiResponse<Object>), d'où
  « Serializer for class 'Any' is not found » à l'appel ;
- un modèle @Serializable retiré en entier par R8 (son $$serializer figure dans usage.txt comme classe retirée).

Entrées : l'APK ou l'AAB (dexdump est lancé sur chacun de ses .dex) ou une sortie `dexdump -a` déjà produite,
plus usage.txt et mapping.txt du dossier build/outputs/mapping/release. Échoue fermé : une sortie dexdump sans
aucune méthode Retrofit, ou un mapping sans aucun $$serializer de l'application, ne prouve rien.
"""
import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

APP_PACKAGE = "me.meeshy."
HEADER = re.compile(r"^Annotations on (method|field|class)")
QUOTED = re.compile(r'"((?:[^"\\]|\\.)*)"')
OBJECT = "Ljava/lang/Object;"


def _blocks(dump):
    title, lines = None, []
    for raw in dump.splitlines():
        line = raw.rstrip()
        if HEADER.match(line) or line.startswith("Class #"):
            if title is not None:
                yield title, lines
            title, lines = (line if HEADER.match(line) else None), []
            continue
        if title is not None:
            lines.append(line)
    if title is not None:
        yield title, lines


def _object_type_argument(signature):
    depth, index = 0, 0
    while index < len(signature):
        char = signature[index]
        if char == "<":
            depth += 1
        elif char == ">":
            depth -= 1
        elif char in "LT":
            end = signature.find(";", index)
            stop = signature.find("<", index)
            if stop != -1 and stop < end:
                depth += 1
                index = stop + 1
                continue
            if depth > 0 and signature[index:end + 1] == OBJECT:
                return True
            index = end + 1 if end != -1 else len(signature)
            continue
        index += 1
    return False


def erased_retrofit_signatures(dump):
    erased, retrofit_methods = [], 0
    for title, lines in _blocks(dump):
        if not title.startswith("Annotations on method") or title.endswith(" parameters"):
            continue
        if not any("Lretrofit2/http/" in line for line in lines):
            continue
        retrofit_methods += 1
        for line in lines:
            if "Ldalvik/annotation/Signature;" in line:
                signature = "".join(QUOTED.findall(line))
                if _object_type_argument(signature):
                    erased.append(f"{title} : {signature}")
    return erased, retrofit_methods


def removed_serializers(usage):
    return [
        line.strip() for line in usage.splitlines()
        if line and not line[0].isspace() and not line.rstrip().endswith(":")
        and line.startswith(APP_PACKAGE) and line.strip().endswith("$$serializer")
    ]


def kept_serializer_count(mapping):
    return sum(
        1 for line in mapping.splitlines()
        if line.startswith(APP_PACKAGE) and line.split(" -> ")[0].endswith("$$serializer")
    )


def _dexdump_binary():
    found = shutil.which("dexdump")
    if found:
        return found
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or ""
    candidates = sorted(glob.glob(os.path.join(sdk, "build-tools", "*", "dexdump")))
    if not candidates:
        sys.exit("dexdump introuvable : ni sur le PATH, ni sous $ANDROID_HOME/build-tools")
    return candidates[-1]


def dump_artifact(artifact):
    binary = _dexdump_binary()
    with tempfile.TemporaryDirectory() as tmp, zipfile.ZipFile(artifact) as archive:
        dexes = [name for name in archive.namelist() if re.search(r"(^|/)classes\d*\.dex$", name)]
        if not dexes:
            sys.exit(f"aucun .dex dans {artifact}")
        outputs = []
        for index, name in enumerate(dexes):
            path = os.path.join(tmp, f"{index}.dex")
            with open(path, "wb") as handle:
                handle.write(archive.read(name))
            outputs.append(subprocess.run([binary, "-a", path], check=True, capture_output=True, encoding="utf-8", errors="replace").stdout)
        return "\n".join(outputs)


def _read(path):
    with open(path, encoding="utf-8", errors="replace") as handle:
        return handle.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--artifact", help="APK ou AAB minifié")
    source.add_argument("--dexdump-output", help="sortie de `dexdump -a` déjà produite")
    parser.add_argument("--usage", required=True, help="build/outputs/mapping/release/usage.txt")
    parser.add_argument("--mapping", required=True, help="build/outputs/mapping/release/mapping.txt")
    args = parser.parse_args()

    dump = dump_artifact(args.artifact) if args.artifact else _read(args.dexdump_output)
    erased, retrofit_methods = erased_retrofit_signatures(dump)
    removed = removed_serializers(_read(args.usage))
    kept = kept_serializer_count(_read(args.mapping))

    failures = []
    if retrofit_methods == 0:
        failures.append("aucune méthode Retrofit lue dans la sortie dexdump : le contrôle ne prouve rien")
    if kept == 0:
        failures.append("aucun $$serializer de l'application dans mapping.txt : le contrôle ne prouve rien")
    failures += [f"signature générique effacée : {item}" for item in erased]
    failures += [f"modèle @Serializable retiré par R8 : {item}" for item in removed]

    print(f"{retrofit_methods} méthode(s) Retrofit, {len(erased)} signature(s) effacée(s) ; "
          f"{kept} sérialiseur(s) gardé(s), {len(removed)} retiré(s)")
    for failure in failures:
        print(f"::error title=R8 release::{failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
