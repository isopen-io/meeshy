#!/bin/bash
# Corrige l'identifier de signature des binaires « stub » que Xcode injecte dans
# les frameworks SANS CODE, avant que quoi que ce soit ne les exporte.
#
# ─── Le problème ────────────────────────────────────────────────────────────
# FirebaseAnalytics, GoogleAdsOnDeviceConversion, GoogleAppMeasurement et
# GoogleAppMeasurementIdentitySupport sont des *codeless frameworks* : tout leur
# code vit dans des bibliothèques statiques, le .framework ne porte qu'un
# Info.plist. Xcode leur fabrique donc un binaire de remplacement — le log de
# build l'annonce : « Injecting stub binary into codeless framework » :
#
#   clang -x c -c /dev/null -target arm64-apple-ios100.0 -o …/arm64-apple.o
#   clang -dynamiclib -Xlinker -adhoc_codesign -target arm64-apple-ios100.0 \
#         -o …/Data.noindex/arm64-apple …
#   lipo -create -output …/FirebaseAnalytics.framework/FirebaseAnalytics …/arm64-apple
#
# `-adhoc_codesign` signe ce stub, et codesign dérive l'identifier du NOM DU
# FICHIER temporaire : **arm64-apple**. Le binaire embarqué porte donc un
# identifier de signature qui n'a rien à voir avec son bundle.
#
# À l'export, Xcode Distribution lit cet identifier pour construire le designated
# requirement qu'il impose ensuite via `--requirements` :
#
#   =designated => anchor apple generic and identifier "arm64-apple" and …
#
# …tout en signant le bundle sous son vrai identifier
# (`--preserve-metadata=identifier` → org.cocoapods.FirebaseAnalytics). Le code
# ne satisfait alors PAS son propre requirement : c'est mot pour mot
# **ITMS-90035** (« Code failed to satisfy specified code requirement(s) »).
# Constaté sur le build Xcode Cloud 1742 (2026-08-04), rejeté sur exactement ces
# quatre frameworks — WebRTC, qui contient du vrai code et ne reçoit pas de stub,
# n'était pas dans la liste d'Apple.
#
# ─── Pourquoi ici, et pas dans ci_post_xcodebuild.sh ────────────────────────
# `ci_post_xcodebuild.sh` corrigeait le symptôme en retirant les signatures entre
# l'archive et l'export. Cela fonctionne en local, mais PAS sur Xcode Cloud, où
# ce hook s'exécute APRÈS les exports (run 1742 : exports 19:11:06→19:11:09,
# hook 19:11:30) : il nettoyait une archive dont les IPA étaient déjà écrits.
#
# Ce script-ci est une BUILD PHASE du target Meeshy : il tourne pendant le build,
# donc avant tout export, sur TOUS les chemins — Xcode Cloud compris. C'est ce
# qui rend la distribution App Store depuis Xcode Cloud possible.
#
# Il RÉ-IDENTIFIE plutôt qu'il ne strippe : le binaire reste signé (ad hoc), donc
# chargeable en développement et sur simulateur, et l'identifier lu par toute
# étape ultérieure est le bon. Les signatures de distribution posées ensuite
# (phase CodeSign locale ou remote signing Xcode Cloud) en héritent.

set -euo pipefail

FRAMEWORKS_DIR="${TARGET_BUILD_DIR:-}/${FRAMEWORKS_FOLDER_PATH:-}"

if [ ! -d "${FRAMEWORKS_DIR}" ]; then
  echo "[fix-identifiers] Aucun dossier Frameworks à ${FRAMEWORKS_DIR} ; rien à faire."
  exit 0
fi

echo "[fix-identifiers] Inspection de ${FRAMEWORKS_DIR}"

fixed=0
for framework in "${FRAMEWORKS_DIR}"/*.framework; do
  [ -d "${framework}" ] || continue

  name=$(basename "${framework}" .framework)
  binary="${framework}/${name}"
  plist="${framework}/Info.plist"

  [ -f "${binary}" ] || continue
  [ -f "${plist}" ] || continue

  bundle_id=$(/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${plist}" 2>/dev/null || true)
  [ -n "${bundle_id}" ] || continue

  # L'identifier porté par la signature actuelle du binaire (vide si non signé).
  current_id=$(codesign -dvv "${binary}" 2>&1 | grep "^Identifier=" | head -1 | cut -d= -f2- || true)

  [ "${current_id}" = "${bundle_id}" ] && continue
  [ -n "${current_id}" ] || continue

  echo "[fix-identifiers]   ${name}: « ${current_id} » → « ${bundle_id} »"
  codesign --force --sign - --identifier "${bundle_id}" "${binary}"
  fixed=$((fixed + 1))
done

if [ "${fixed}" -eq 0 ]; then
  echo "[fix-identifiers] Tous les identifiers sont déjà cohérents."
else
  echo "[fix-identifiers] ${fixed} binaire(s) ré-identifié(s) — l'export produira un designated requirement valide."
fi
