#!/bin/sh
# Strips ad-hoc / development signatures from embedded SPM binary frameworks
# in an .xcarchive, so the distribution step re-signs them cleanly.
#
# Invoked after the 'archive' action from cinq endroits — mais UN SEUL d'entre
# eux est inopérant, et il faut le savoir :
#
#   1. Xcode Cloud — exécute ce script automatiquement après l'action archive.
#      ⚠️ SANS AUCUN EFFET SUR LE PRODUIT LIVRÉ. Xcode Cloud lance ce hook APRÈS
#      avoir exporté ses IPA, pas entre l'archive et l'export. Mesuré sur le run
#      1742 (2026-08-04) : exports ad-hoc 19:11:06, development 19:11:07,
#      app-store 19:11:09 — ce script à 19:11:30. Il strippe donc une archive
#      dont les IPA sont déjà écrits. NE PAS compter sur lui pour Xcode Cloud ;
#      le rejet ITMS-90035 de ce run vient d'ailleurs (voir le bloc ci-dessous).
#   2. fastlane — the `build_production` lane calls it between archive and export.
#   3. Xcode GUI — the Meeshy scheme's Archive post-action runs it before the
#      archive reaches the Organizer, so "Distribute App" works directly.
#      DÉCLARÉE DANS `project.yml` (clé `schemes: Meeshy: archive: postActions`),
#      pas seulement dans le .xcscheme : ce dernier est régénéré par XcodeGen, et
#      c'est précisément ainsi que la post-action a disparu entre le 2026-05-18 et
#      le 2026-08-04, sans qu'aucun build ne devienne rouge.
#   4. `./meeshy.sh archive` — via la fonction `strip_embedded_signatures`.
#   5. `./meeshy.sh distribute` — idem, avant l'export de l'IPA de distribution.
#
# Ces chemins sont vérifiés mécaniquement par `ArchiveSignatureStripGuardTests`,
# et le PRODUIT exporté est vérifié par `ci_scripts/verify_embedded_signatures.sh`
# (branché sur meeshy.sh, la lane fastlane et ios-release.yml) — ce script-ci
# étant muet quand il ne tourne pas, c'est ce second gate qui le rend visible.
#
# ─── Le rejet ITMS-90035 du 2026-08-04 (build 1742) n'est PAS de ce ressort ───
# Ce script avait bien tourné. La cause était le binaire STUB que Xcode injecte
# dans les frameworks sans code, signé ad hoc sous l'identifier « arm64-apple »
# (le nom du fichier temporaire qui le porte). Elle est corrigée à la source par
# `fix_codeless_framework_identifiers.sh`, branché en BUILD PHASE du target
# Meeshy — donc exécuté pendant le build, avant tout export, Xcode Cloud compris.
#
# Ce script-ci reste utile comme seconde barrière sur les chemins locaux, mais
# il n'est plus le correctif principal, et il ne doit pas le redevenir : sur
# Xcode Cloud, un hook post-archive arrive toujours trop tard.
#
# After the 'archive' action, embedded SPM frameworks (FirebaseAnalytics,
# GoogleAdsOnDeviceConversion, GoogleAppMeasurement,
# GoogleAppMeasurementIdentitySupport, WebRTC, etc.) carry ad-hoc signatures
# applied by the build with CODE_SIGN_IDENTITY=- (visible as
# 'Signing Identity: "Sign to Run Locally"' in xcodebuild-archive.log).
#
# The subsequent distribution action does re-sign them with the
# Apple Distribution certificate, but the "replace existing signature"
# operation leaves residual metadata from the original ad-hoc signature.
# App Store Connect's static analyzer then rejects the upload with
# ITMS-90035 ("Invalid Signature - Code failed to satisfy specified code
# requirement(s)") on tiny Firebase/Google stub frameworks.
#
# We strip the ad-hoc signatures BEFORE the distribution step runs, so the
# re-signing is a clean operation on unsigned bundles. This forces
# xcodebuild -exportArchive to do a fresh sign rather than a replace.
#
# The script is idempotent: it acts only when CI_XCODEBUILD_ACTION=archive and
# CI_ARCHIVE_PATH points at a valid archive. Re-running it on already-stripped
# frameworks is a no-op, and simulator builds (./apps/ios/meeshy.sh) never set
# those vars, so they are unaffected.

set -eu

if [ "${CI_XCODEBUILD_ACTION:-}" != "archive" ]; then
  echo "[ci_post_xcodebuild] Action is '${CI_XCODEBUILD_ACTION:-unset}', not 'archive'; skipping signature strip."
  exit 0
fi

ARCHIVE_PATH="${CI_ARCHIVE_PATH:-}"
if [ -z "${ARCHIVE_PATH}" ] || [ ! -d "${ARCHIVE_PATH}" ]; then
  echo "[ci_post_xcodebuild] CI_ARCHIVE_PATH unset or missing ('${ARCHIVE_PATH}'); skipping."
  exit 0
fi

APP_PATH="${ARCHIVE_PATH}/Products/Applications/Meeshy.app"
if [ ! -d "${APP_PATH}" ]; then
  echo "[ci_post_xcodebuild] Meeshy.app not found at ${APP_PATH}; skipping."
  exit 0
fi

strip_framework_signatures() {
  dir="$1"
  [ -d "${dir}" ] || return 0
  for fw in "${dir}"/*.framework; do
    [ -d "${fw}" ] || continue
    fw_name=$(basename "${fw}" .framework)
    echo "[ci_post_xcodebuild]   Stripping ad-hoc signature from ${fw_name}.framework"
    rm -rf "${fw}/_CodeSignature"
    inner="${fw}/${fw_name}"
    if [ -f "${inner}" ]; then
      codesign --remove-signature "${inner}" 2>/dev/null || true
    fi
  done
}

echo "[ci_post_xcodebuild] Stripping ad-hoc signatures from embedded frameworks in ${APP_PATH}"

strip_framework_signatures "${APP_PATH}/Frameworks"

for ext in "${APP_PATH}/PlugIns"/*.appex; do
  [ -d "${ext}" ] || continue
  strip_framework_signatures "${ext}/Frameworks"
done

echo "[ci_post_xcodebuild] Strip complete. Distribution step will sign these frameworks fresh."
