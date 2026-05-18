#!/bin/sh
# Strips ad-hoc / development signatures from embedded SPM binary frameworks
# in an .xcarchive, so the distribution step re-signs them cleanly.
#
# Invoked after the 'archive' action from THREE places:
#   1. Xcode Cloud — auto-runs ci_scripts/ci_post_xcodebuild.sh after each action.
#   2. fastlane — the `build_production` lane calls it between archive and export.
#   3. Xcode GUI — the Meeshy scheme's Archive post-action runs it before the
#      archive reaches the Organizer, so "Distribute App" works directly.
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
