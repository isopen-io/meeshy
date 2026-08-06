#!/bin/bash
# Vérifie qu'un produit EXPORTÉ (.ipa, .app ou .xcarchive) porte des signatures
# de distribution valides sur tous ses frameworks embarqués.
#
# Pourquoi ce script existe
# -------------------------
# `ci_post_xcodebuild.sh` retire les signatures de développement des frameworks
# SPM binaires entre l'archive et l'export, sans quoi App Store Connect rejette
# l'upload : ITMS-90035 « Invalid Signature — Code failed to satisfy specified
# code requirement(s) » sur FirebaseAnalytics, GoogleAppMeasurement,
# GoogleAppMeasurementIdentitySupport et GoogleAdsOnDeviceConversion.
#
# Ce garde-fou n'a AUCUN signal propre : quand il ne tourne pas, le build
# réussit, l'export réussit, l'IPA se produit — et le rejet arrive par courriel
# d'Apple des heures plus tard. C'est ce qui s'est produit : la post-action
# d'archive du scheme, ajoutée en 2026-05-18, a été effacée par la migration
# XcodeGen, et `meeshy.sh archive` / `meeshy.sh distribute` ne l'ont jamais
# appelée. Ce script ferme la boucle en jugeant le PRODUIT et non le câblage.
#
# Usage : ./ci_scripts/verify_embedded_signatures.sh <chemin .ipa|.app|.xcarchive>
# Sortie : 0 si tous les frameworks embarqués sont signés en distribution et
#          satisfont leur designated requirement ; 1 sinon, avec la liste.

set -eu

TARGET="${1:-}"

if [ -z "${TARGET}" ] || [ ! -e "${TARGET}" ]; then
  echo "[verify_signatures] Usage: $0 <chemin .ipa|.app|.xcarchive>" >&2
  exit 2
fi

WORKDIR=""
# `return 0` explicite : sans lui, un WORKDIR vide fait échouer le `[ -n … ]`,
# dernière commande du trap, et ce statut devient le code de sortie du script —
# le garde-fou refusait alors TOUS les IPA, y compris les corrects.
cleanup() {
  [ -n "${WORKDIR}" ] && rm -rf "${WORKDIR}"
  return 0
}
trap cleanup EXIT

# Le dézippage vit ICI et non dans une fonction : `VAR=$(fonction)` évalue la
# fonction dans un SOUS-SHELL, où l'affectation de WORKDIR ne remonterait pas —
# le répertoire temporaire fuiterait et le nettoyage ne verrait rien.
case "${TARGET}" in
  *.ipa)
    WORKDIR=$(mktemp -d)
    unzip -q "${TARGET}" -d "${WORKDIR}"
    APP_PATH=$(find "${WORKDIR}/Payload" -maxdepth 1 -name "*.app" -type d | head -1)
    ;;
  *.xcarchive)
    APP_PATH=$(find "${TARGET}/Products/Applications" -maxdepth 1 -name "*.app" -type d | head -1)
    ;;
  *.app)
    APP_PATH="${TARGET}"
    ;;
  *)
    APP_PATH=""
    ;;
esac

if [ -z "${APP_PATH}" ] || [ ! -d "${APP_PATH}" ]; then
  echo "[verify_signatures] Aucune .app trouvée dans '${TARGET}'." >&2
  exit 2
fi

echo "[verify_signatures] Inspection de ${APP_PATH}"

FAILURES=0
CHECKED=0

check_framework() {
  fw="$1"
  name=$(basename "${fw}")
  CHECKED=$((CHECKED + 1))

  # `codesign -dvv` écrit sur stderr — l'absence totale de signature y sort
  # « code object is not signed at all », qui doit compter comme un échec.
  info=$(codesign -dvv "${fw}" 2>&1 || true)

  # Ni une signature ad hoc ni une absence de signature ne portent de ligne
  # `Authority=` — les distinguer rend le diagnostic actionnable : ad hoc =
  # « Sign to Run Locally » laissé par l'archive, absente = strip sans export.
  if ! printf '%s' "${info}" | grep -q "^Authority="; then
    if printf '%s' "${info}" | grep -q "^Signature=adhoc"; then
      echo "  ✗ ${name} — signature AD HOC (« Sign to Run Locally »)"
    else
      echo "  ✗ ${name} — AUCUNE signature"
    fi
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Une archive de distribution doit porter « Apple Distribution » (ou l'ancien
  # libellé « iPhone Distribution »). Un « Apple Development » résiduel est
  # exactement ce qu'ITMS-90035 sanctionne.
  authority=$(printf '%s' "${info}" | grep "^Authority=" | head -1 | cut -d= -f2-)
  case "${authority}" in
    "Apple Distribution:"*|"iPhone Distribution:"*)
      ;;
    *)
      echo "  ✗ ${name} — signé « ${authority} » au lieu d'Apple Distribution"
      FAILURES=$((FAILURES + 1))
      return
      ;;
  esac

  if ! codesign --verify --strict "${fw}" >/dev/null 2>&1; then
    echo "  ✗ ${name} — signature invalide (codesign --verify --strict)"
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Cohérence identifier ↔ designated requirement.
  #
  # C'EST LE CONTRÔLE QUI ATTRAPE LE REJET RÉEL. Le build Xcode Cloud 1742 a
  # passé tous les tests ci-dessus — signature Apple Distribution, `--verify
  # --strict` vert — et a pourtant été refusé par Apple : le designated
  # requirement des 4 frameworks Google/Firebase exigeait
  # `identifier "arm64-apple"` alors que leur CodeDirectory s'identifiait
  # `org.cocoapods.FirebaseAnalytics`. Le code ne satisfait alors pas son PROPRE
  # requirement — c'est mot pour mot le libellé d'ITMS-90035 (« Code failed to
  # satisfy specified code requirement(s) »).
  #
  # `arm64-apple` est le nom du fichier temporaire produit par le `lipo -create`
  # qui « thinne » les XCFrameworks multi-architectures. Seuls les frameworks
  # passant par ce slicing sont touchés — WebRTC y échappe, et c'est exactement
  # pourquoi il ne figure pas dans le courriel de rejet.
  #
  # `codesign --verify` ne le voit PAS : il valide le requirement tel quel.
  cd_identifier=$(printf '%s' "${info}" | grep "^Identifier=" | head -1 | cut -d= -f2-)
  dr_identifier=$(codesign -d -r- "${fw}" 2>/dev/null | grep "^designated" | sed -n 's/.*identifier "\([^"]*\)".*/\1/p')

  if [ -n "${dr_identifier}" ] && [ "${dr_identifier}" != "${cd_identifier}" ]; then
    echo "  ✗ ${name} — designated requirement incohérent : exige « ${dr_identifier} », le bundle s'identifie « ${cd_identifier} »"
    FAILURES=$((FAILURES + 1))
    return
  fi

  # Identifier du binaire interne. Sur un framework SANS CODE, Xcode injecte un
  # stub signé ad hoc sous « arm64-apple » ; c'est CETTE valeur que Xcode
  # Distribution lit pour bâtir le requirement de l'export. La corriger pendant
  # le build (fix_codeless_framework_identifiers.sh) est le vrai correctif ;
  # cette assertion vérifie qu'il a bien tourné, y compris sur une .xcarchive
  # examinée avant tout export.
  inner_id=$(codesign -dvv "${fw}/${name}" 2>&1 | grep "^Identifier=" | head -1 | cut -d= -f2- || true)
  if [ -n "${inner_id}" ] && [ "${inner_id}" != "${cd_identifier}" ]; then
    echo "  ✗ ${name} — binaire interne signé « ${inner_id} » au lieu de « ${cd_identifier} » (stub non ré-identifié)"
    FAILURES=$((FAILURES + 1))
    return
  fi

  echo "  ✓ ${name}"
}

scan_frameworks_dir() {
  dir="$1"
  [ -d "${dir}" ] || return 0
  for fw in "${dir}"/*.framework; do
    [ -d "${fw}" ] || continue
    check_framework "${fw}"
  done
}

scan_frameworks_dir "${APP_PATH}/Frameworks"

for ext in "${APP_PATH}/PlugIns"/*.appex; do
  [ -d "${ext}" ] || continue
  scan_frameworks_dir "${ext}/Frameworks"
done

if [ "${CHECKED}" -eq 0 ]; then
  echo "[verify_signatures] Aucun framework embarqué trouvé — rien à vérifier." >&2
  echo "[verify_signatures] Ce cas est suspect pour Meeshy (Firebase + WebRTC sont embarqués)." >&2
  exit 1
fi

if [ "${FAILURES}" -gt 0 ]; then
  echo "[verify_signatures] ÉCHEC : ${FAILURES}/${CHECKED} framework(s) mal signé(s)." >&2
  echo "[verify_signatures] Cet IPA serait rejeté par App Store Connect (ITMS-90035)." >&2
  echo "[verify_signatures] Causes connues :" >&2
  echo "  · « signature AD HOC / AUCUNE / Apple Development » → ci_post_xcodebuild.sh n'a pas" >&2
  echo "    tourné entre l'archive et l'export (chemin d'archive non câblé)." >&2
  echo "  · « designated requirement incohérent » → export produit par Xcode Cloud, dont le" >&2
  echo "    remote signing dérive le requirement du fichier de slice lipo (arm64-apple)." >&2
  echo "    Le strip n'y peut RIEN : sur Xcode Cloud il s'exécute APRÈS l'export." >&2
  echo "    Livrer par ./meeshy.sh distribute, la lane fastlane build_production ou" >&2
  echo "    ios-release.yml — ces trois chemins produisent des IPA acceptés." >&2
  exit 1
fi

echo "[verify_signatures] OK — ${CHECKED} framework(s) embarqué(s) signés en distribution."
