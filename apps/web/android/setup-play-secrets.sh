#!/usr/bin/env bash
# Pose les secrets GitHub de la release Android (#9843) depuis un dossier tenu
# HORS du dépôt, après avoir vérifié que la clé s'ouvre et que son empreinte
# est bien celle publiée dans assetlinks.json. Puis, avec --run, lance le
# workflow « Android Release (coque apps/web) ».
#
#   apps/web/android/setup-play-secrets.sh [--dir <dossier>] [--run <piste>] [--ref <branche>]
#
# Le dossier (défaut ~/.meeshy-secrets/android-release) contient :
#   meeshy-release.p12        la clé d'importation (PKCS#12)
#   keystore.properties       storePassword=… keyAlias=… keyPassword=…
#   google-services.json      l'app Android me.meeshy.app du projet Firebase
#   play-service-account.json (facultatif) le compte de service invité dans la Play Console
set -euo pipefail

DIR="$HOME/.meeshy-secrets/android-release"
TRACK=""
REF="main"
REPO="isopen-io/meeshy"

while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --run) TRACK="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    *) echo "option inconnue : $1" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ASSETLINKS="$ROOT/apps/web/public/.well-known/assetlinks.json"
KEYSTORE="$DIR/meeshy-release.p12"
PROPS="$DIR/keystore.properties"
GOOGLE_SERVICES="$DIR/google-services.json"
PLAY_ACCOUNT="$DIR/play-service-account.json"

fail() { echo "✗ $1" >&2; exit 1; }
prop() { sed -n "s/^$1=//p" "$PROPS"; }

[ -f "$KEYSTORE" ] || fail "clé absente : $KEYSTORE"
[ -f "$PROPS" ] || fail "propriétés absentes : $PROPS"
[ -f "$GOOGLE_SERVICES" ] || fail "google-services.json absent : $GOOGLE_SERVICES"
jq -e '.client[].client_info.android_client_info | select(.package_name=="me.meeshy.app")' "$GOOGLE_SERVICES" >/dev/null \
  || fail "google-services.json ne déclare pas me.meeshy.app"

export MEESHY_STORE_PASSWORD="$(prop storePassword)"
KEY_ALIAS="$(prop keyAlias)"
KEY_PASSWORD="$(prop keyPassword)"
[ -n "$MEESHY_STORE_PASSWORD" ] && [ -n "$KEY_ALIAS" ] && [ -n "$KEY_PASSWORD" ] || fail "keystore.properties incomplet"

FINGERPRINT="$(openssl pkcs12 -in "$KEYSTORE" -passin env:MEESHY_STORE_PASSWORD -nokeys 2>/dev/null \
  | openssl x509 -noout -fingerprint -sha256 | sed 's/.*=//')"
[ -n "$FINGERPRINT" ] || fail "la clé ne s'ouvre pas avec ce mot de passe"
jq -e --arg fp "$FINGERPRINT" \
  '.[] | select(.target.package_name=="me.meeshy.app") | .target.sha256_cert_fingerprints | index($fp)' \
  "$ASSETLINKS" >/dev/null || fail "empreinte $FINGERPRINT absente d'assetlinks.json — ce n'est pas la clé de Meeshy"
echo "✓ clé vérifiée ($FINGERPRINT)"

base64 < "$KEYSTORE" | tr -d '\n' | gh secret set MEESHY_ANDROID_KEYSTORE_BASE64 --repo "$REPO"
printf '%s' "$MEESHY_STORE_PASSWORD" | gh secret set MEESHY_ANDROID_STORE_PASSWORD --repo "$REPO"
printf '%s' "$KEY_ALIAS" | gh secret set MEESHY_ANDROID_KEY_ALIAS --repo "$REPO"
printf '%s' "$KEY_PASSWORD" | gh secret set MEESHY_ANDROID_KEY_PASSWORD --repo "$REPO"
base64 < "$GOOGLE_SERVICES" | tr -d '\n' | gh secret set MEESHY_ANDROID_GOOGLE_SERVICES_JSON_BASE64 --repo "$REPO"
unset MEESHY_STORE_PASSWORD

if [ -f "$PLAY_ACCOUNT" ]; then
  jq -e '.type=="service_account"' "$PLAY_ACCOUNT" >/dev/null || fail "play-service-account.json n'est pas une clé de compte de service"
  gh secret set MEESHY_PLAY_SERVICE_ACCOUNT_JSON --repo "$REPO" < "$PLAY_ACCOUNT"
  echo "✓ secrets posés, publication automatique active"
else
  echo "✓ secrets de signature posés (sans play-service-account.json : l'.aab reste en artefact)"
fi

if [ -n "$TRACK" ]; then
  gh workflow run android-shell-release.yml --repo "$REPO" --ref "$REF" -f track="$TRACK" -f status=draft
  echo "✓ workflow lancé sur $REF, piste $TRACK (brouillon)"
fi
