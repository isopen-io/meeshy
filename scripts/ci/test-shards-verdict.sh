#!/usr/bin/env bash
# Verdict d'une suite iOS exécutée en tranches [#9692] — partagé par `ios.yml`
# et `sdk-tests.yml`.
#
# Rouge si la compilation ou une tranche n'est pas verte (une tranche ANNULÉE
# n'est jamais un vert), s'il manque un résumé de tranche, ou si une tranche
# n'a exécuté AUCUN test (sélection vide = faute de répartition).
#
# Entrées (environnement) : BUILD_RESULT, SHARDS_RESULT, EXPECTED_SHARDS (JSON
# des indices), PLAN_RESULT (facultatif), GH_TOKEN ; les résumés des tranches
# dans ./summaries (shard-N.json, timings-N.json). Sorties : le résumé du run,
# et ./timings.json (union des durées mesurées par classe).
set -uo pipefail

TITLE="${1:-Suite en tranches}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/stdout}"
mkdir -p summaries

shopt -s nullglob
SHARD_FILES=(summaries/shard-*.json)
TIMING_FILES=(summaries/timings-*.json)
if [ "${#SHARD_FILES[@]}" -gt 0 ]; then jq -s 'sort_by(.shard)' "${SHARD_FILES[@]}" > all.json; else echo '[]' > all.json; fi
if [ "${#TIMING_FILES[@]}" -gt 0 ]; then jq -s 'add // {}' "${TIMING_FILES[@]}" > timings.json; else echo '{}' > timings.json; fi

if [ -n "${GH_TOKEN:-}" ] && [ -n "${GITHUB_RUN_ID:-}" ]; then
  gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT:-1}/jobs?per_page=100" \
    --jq '.jobs[] | select(.started_at != null and .completed_at != null) | ((.completed_at | fromdateiso8601) - (.started_at | fromdateiso8601)) as $d | "\(.name)\t\(.conclusion // "?")\t\($d / 60 | floor) min \($d % 60) s"' \
    > jobs.tsv 2>/dev/null || : > jobs.tsv
else
  : > jobs.tsv
fi

{
  echo "## ${TITLE}"
  echo ''
  echo "Compilation : **${BUILD_RESULT:-?}** · tranches : **${SHARDS_RESULT:-?}**"
  echo ''
  echo '| tranche | résultat | tests | réussis | échecs | ignorés | simulateur | exécution |'
  echo '|---|---|---|---|---|---|---|---|'
  jq -r '.[] | "| \(.shard) | \(.result) | \(.total) | \(.passed) | \(.failed) | \(.skipped) | \(.provision_s) s | \(.tests_s) s |"' all.json
  echo ''
  echo "**Total exécuté : $(jq '[.[].total] | add // 0' all.json) test(s), $(jq '[.[].failed] | add // 0' all.json) échec(s).**"
  echo ''
  echo '| job | conclusion | durée |'
  echo '|---|---|---|'
  sed 's/\t/ | /g; s/^/| /; s/$/ |/' jobs.tsv
} >> "$SUMMARY_FILE"
[ "$SUMMARY_FILE" = /dev/stdout ] || cat "$SUMMARY_FILE"

FAULT=0
if [ -n "${PLAN_RESULT:-}" ] && [ "$PLAN_RESULT" != "success" ]; then echo "::error title=Verdict::répartition ${PLAN_RESULT}"; FAULT=1; fi
[ "${BUILD_RESULT:-}" = "success" ] || { echo "::error title=Verdict::compilation ${BUILD_RESULT:-absente}"; FAULT=1; }
[ "${SHARDS_RESULT:-}" = "success" ] || { echo "::error title=Verdict::tranches ${SHARDS_RESULT:-absentes}"; FAULT=1; }
EXPECTED=$(printf '%s' "${EXPECTED_SHARDS:-[]}" | jq 'length' 2>/dev/null || echo 0)
GOT=$(jq 'length' all.json)
[ "$GOT" = "$EXPECTED" ] && [ "$EXPECTED" != "0" ] || { echo "::error title=Verdict::${GOT} résumé(s) de tranche sur ${EXPECTED}"; FAULT=1; }
EMPTY=$(jq -r '[.[] | select(.total == 0) | .shard] | join(",")' all.json)
[ -z "$EMPTY" ] || { echo "::error title=Verdict::tranche(s) sans aucun test exécuté : ${EMPTY}"; FAULT=1; }
exit "$FAULT"
