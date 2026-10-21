#!/usr/bin/env bash
# Garde de COHÉRENCE du `project.pbxproj` COMMITTÉ avec le dépôt et project.yml.
# La CI régénère le projet (xcodegen) avant de compiler et ne voit donc jamais
# le fichier committé que lisent `meeshy.sh build|run|device` et fastlane.
#  1. aucune PBXFileReference ne désigne un .swift absent du dépôt ;
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

count=$(grep -c 'SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated;' "$PBXPROJ" || true)
if [ "$count" != "$EXPECTED_NONISOLATED" ]; then
    echo "check_pbxproj_consistency: SWIFT_DEFAULT_ACTOR_ISOLATION = nonisolated trouvé $count fois, attendu $EXPECTED_NONISOLATED" >&2
    status=1
fi
exit $status
