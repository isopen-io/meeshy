#!/usr/bin/env bash
# Garde d'INSCRIPTION — un fichier de test présent sur disque mais absent du
# `project.pbxproj` COMMITTÉ ne s'exécute nulle part, et rien ne rougit (#6839).
#
# Pourquoi cette garde EN PLUS de `verify_test_classes_are_compiled` (meeshy.sh) :
# celle-là confronte les classes déclarées au bundle `.xctest` RÉELLEMENT PRODUIT
# — elle est juste, mais elle juge APRÈS le build, et le contrôle de fraîcheur de
# `meeshy.sh` a déjà régénéré le `pbxproj` SANS le committer. Au moment où elle
# lit le bundle, le fichier est compilé : elle rend vert, l'arbre porte un
# `pbxproj` modifié que personne ne remarque, et le dépôt garde une référence
# manquante. Elle mesure l'artefact LOCAL ; celle-ci mesure l'artefact COMMITTÉ.
#
# Mesuré le 2026-09-16 : `GallerySceneBackdropUnicityTests.swift` (le témoin de
# #6791, 148 lignes, 6 cas) n'était inscrit sur AUCUNE ref — ni sur les deux
# branches qui l'ont écrit, ni sur dev. Jamais compilé, jamais joué.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
PBXPROJ="Meeshy.xcodeproj/project.pbxproj"

# Le pbxproj tel que GIT le porte, jamais celui de l'arbre de travail : c'est
# précisément l'écart entre les deux que cette garde existe pour voir.
committed=$(mktemp)
trap 'rm -f "$committed"' EXIT
if ! git show "HEAD:apps/ios/$PBXPROJ" > "$committed" 2>/dev/null; then
    echo "check_test_registration: $PBXPROJ introuvable dans HEAD — garde sautée" >&2
    exit 0
fi

orphans=()
scanned=0
while IFS= read -r source; do
    scanned=$((scanned + 1))
    base=$(basename "$source")
    grep -qF "$base" "$committed" || orphans+=("$source")
done < <(find MeeshyTests MeeshyUITests -name '*.swift' -type f 2>/dev/null | sort)

if [ ${#orphans[@]} -eq 0 ]; then
    echo "check_test_registration: $scanned fichiers de test, tous inscrits au projet committé."
    exit 0
fi

# La leçon de méthode : une absence lue depuis une recherche BORNÉE n'est pas
# une absence. On dit donc toujours ce qu'on a balayé, vert comme rouge.
echo "check_test_registration: $scanned fichiers de test balayés, ${#orphans[@]} ABSENT(S) du $PBXPROJ committé —" >&2
echo "leurs cas ne s'exécutent JAMAIS, et aucune suite ne rougit :" >&2
printf '  • %s\n' "${orphans[@]}" >&2
echo "Corriger : (cd apps/ios && xcodegen generate) puis COMMITTER le pbxproj." >&2
exit 1
