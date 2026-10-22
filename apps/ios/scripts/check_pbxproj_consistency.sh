#!/usr/bin/env bash
# Garde de COHÉRENCE du `project.pbxproj` COMMITTÉ avec le dépôt et project.yml.
# La CI régénère le projet (xcodegen) avant de compiler et ne voit donc jamais
# le fichier committé que lisent `meeshy.sh build|run|device` et fastlane.
#  1. aucune PBXFileReference ne désigne un .swift absent du dépôt ;
#  1 bis. chaque .swift référencé se RÉSOUT, par la chaîne de ses groupes, sur un
#     fichier présent — un fichier rangé sous le mauvais groupe garde son nom
#     (le 1 reste vert) mais Xcode le cherche ailleurs et le build casse ;
#  2. les cibles d'extension portent SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated
#     (3 extensions + tests, Debug et Release = 8 occurrences).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
PBXPROJ="Meeshy.xcodeproj/project.pbxproj"
EXPECTED_NONISOLATED=8
status=0

missing=$(grep -E 'isa = PBXFileReference;.*path = [^;]*\.swift;' "$PBXPROJ" | grep -v 'sourceTree = (BUILT_PRODUCTS_DIR|SDKROOT)' \
    | sed -E 's/.*path = "?([^";]*)"?;.*/\1/' | sort -u | while read -r name; do
        [ -n "$(git ls-files -- "*/$name" "$name" | head -1)" ] || echo "$name"
    done)
if [ -n "$missing" ]; then
    echo "check_pbxproj_consistency: fichiers référencés par le pbxproj et absents du dépôt :" >&2
    echo "$missing" | sed 's/^/  • /' >&2
    status=1
fi

misplaced=$(python3 -I - "$PBXPROJ" <<'PY'
import os, re, sys

objects, current = {}, None
for line in open(sys.argv[1], encoding="utf-8").read().split("\n"):
    head = re.match(r"^\t\t([0-9A-F]{24}) (?:/\* .*? \*/ )?= \{(.*)$", line)
    if current is None and head:
        if head.group(2).endswith("};"):
            objects[head.group(1)] = head.group(2)
        else:
            current = head.group(1)
            objects[current] = head.group(2)
    elif current is not None:
        if line == "\t\t};":
            current = None
        else:
            objects[current] += "\n" + line


def field(body, key):
    found = re.search(r"\b" + key + r' = ("(?:[^"\\]|\\.)*"|[^;]+);', body)
    return found.group(1).strip('"') if found else None


parent = {}
for oid, body in objects.items():
    if "isa = PBXGroup" in body or "isa = PBXVariantGroup" in body:
        children = re.search(r"\bchildren = \((.*?)\);", body, re.S)
        for child in re.findall(r"([0-9A-F]{24})", children.group(1) if children else ""):
            parent[child] = oid


def resolved(oid):
    parts = [field(objects[oid], "path")]
    while oid in parent:
        oid = parent[oid]
        body = objects[oid]
        if field(body, "path"):
            parts.append(field(body, "path"))
        if field(body, "sourceTree") != "<group>":
            break
    return os.path.normpath(os.path.join(*reversed(parts)))


for oid, body in sorted(objects.items()):
    if "isa = PBXFileReference" not in body or field(body, "sourceTree") != "<group>":
        continue
    path = field(body, "path") or ""
    if path.endswith(".swift") and not os.path.isfile(resolved(oid)):
        print(resolved(oid))
PY
)
if [ -n "$misplaced" ]; then
    echo "check_pbxproj_consistency: .swift dont la chaîne de groupes ne mène à aucun fichier (mauvais groupe) :" >&2
    echo "$misplaced" | sed 's/^/  • /' >&2
    status=1
fi

count=$(grep -c 'SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated;' "$PBXPROJ" || true)
if [ "$count" != "$EXPECTED_NONISOLATED" ]; then
    echo "check_pbxproj_consistency: SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated trouvé $count fois, attendu $EXPECTED_NONISOLATED" >&2
    status=1
fi
exit $status
