#!/usr/bin/env bash
# OUVRIR UNE CONVERSATION, SANS DOIGT (#6213 bis) — retour porteur 2026-09-12 :
# « Il faut quand tu lances tester l'ouverture de conversation ! »
#
# CE QUE CETTE SONDE FERME. Le crash à l'ouverture d'une conversation a été
# annoncé corrigé trois fois sur la foi d'un build vert et d'un lancement qui
# ne plantait pas. Or l'app ne plante PAS au lancement : elle plante quand on
# OUVRE une conversation — un geste qu'aucune commande de déploiement ne fait,
# et que seul le porteur faisait. La boucle de vérification s'arrêtait donc
# systématiquement un geste avant le défaut.
#
# LE GESTE EST PILOTABLE, et il l'était depuis toujours : l'app déclare le
# schéma `meeshy://` (`Info.plist`) et `DeepLinkParser` route
# `meeshy://conversation/<id>` (`MeeshyTests/Unit/Navigation/DeepLinkTests.swift`).
# `devicectl … --payload-url` le remet à l'app au lancement. Aucune
# accessibilité, aucun robot : la porte d'entrée normale du produit.
#
# L'IDENTIFIANT VIENT DE L'APPAREIL, jamais d'une constante : la base GRDB de
# l'app (`Library/Application Support/Database/meeshy.sqlite`) porte le cache
# des conversations du compte RÉELLEMENT connecté. Une conversation codée en
# dur ici serait fausse sur tout autre appareil que celui qui l'a écrite.
#
# Usage :
#   scripts/probe-conversation-open.sh                 # 1re conversation du cache
#   scripts/probe-conversation-open.sh <id|motif>      # un id, ou un motif de titre
set -euo pipefail

BUNDLE="me.meeshy.app"
WANTED="${1:-}"
WORK="${TMPDIR:-/tmp}/meeshy-probe-$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

# L'UUID par sa FORME, jamais par sa colonne : la colonne du modèle contient
# des espaces (« iPhone 16 Pro Max (iPhone17,2) »), donc tout comptage de champs
# depuis la fin rend un morceau du modèle — mesuré : « 16 ».
DEVICE=$(xcrun devicectl list devices 2>/dev/null \
  | grep -E "iPhone|iPad" | grep -v Simulator | grep -v unavailable \
  | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' | head -1)
[ -n "$DEVICE" ] || { echo "Aucun appareil physique disponible."; exit 1; }
echo "Appareil : $DEVICE"

pull() {
  xcrun devicectl device copy from --device "$DEVICE" \
    --domain-type appDataContainer --domain-identifier "$BUNDLE" --user mobile \
    --source "$1" --destination "$2" >/dev/null 2>&1 || true
}

pull "Library/Application Support/Database/meeshy.sqlite" "$WORK/db.sqlite"
[ -s "$WORK/db.sqlite" ] || { echo "Base de l'app illisible — l'app a-t-elle déjà tourné ?"; exit 1; }

if [ -z "$WANTED" ]; then
  ROW=$(sqlite3 "$WORK/db.sqlite" "SELECT c0 || '|' || c1 FROM conversations_fts_content LIMIT 1;")
elif [[ "$WANTED" =~ ^[0-9a-f]{24}$ ]]; then
  ROW="$WANTED|(id fourni)"
else
  ROW=$(sqlite3 "$WORK/db.sqlite" "SELECT c0 || '|' || c1 FROM conversations_fts_content WHERE c1 LIKE '%${WANTED//\'/}%' LIMIT 1;")
fi
[ -n "$ROW" ] || { echo "Aucune conversation ne correspond à « $WANTED »."; exit 1; }
CID="${ROW%%|*}"
CNAME="${ROW#*|}"
echo "Conversation : $CNAME  ($CID)"

# LA DATE DE LA TRACE EST RELEVÉE AVANT LE TIR, et c'est un faux positif déjà
# payé : le Release n'embarque pas `CrashStackDumper` (`#if DEBUG`), donc aucune
# trace neuve n'est écrite — et la trace du tir PRÉCÉDENT se lisait comme le
# verdict du tir courant, avec la même `si_addr` au bit près. Un fichier qu'on
# ne peut pas effacer à distance se DATE ; le verdict, lui, ne vient jamais de
# la trace mais de la console.
AVANT=$(xcrun devicectl device info files --device "$DEVICE" \
  --domain-type appDataContainer --domain-identifier "$BUNDLE" --username mobile \
  --subdirectory Documents 2>/dev/null | grep segv_backtrace | awk '{print $(NF-1), $NF}')
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing "$BUNDLE" >/dev/null 2>&1 || true
sleep 2
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing \
  --console --payload-url "meeshy://conversation/$CID" "$BUNDLE" > "$WORK/console.log" 2>&1 &
LAUNCH=$!
sleep 22
kill "$LAUNCH" 2>/dev/null || true

echo
if grep -q "terminated due to signal" "$WORK/console.log"; then
  echo "PLANTÉ : $(grep 'terminated due to signal' "$WORK/console.log" | head -1)"
  APRES=$(xcrun devicectl device info files --device "$DEVICE" \
    --domain-type appDataContainer --domain-identifier "$BUNDLE" --username mobile \
    --subdirectory Documents 2>/dev/null | grep segv_backtrace | awk '{print $(NF-1), $NF}')
  if [ -n "$APRES" ] && [ "$APRES" != "$AVANT" ]; then
    pull "Documents/segv_backtrace.txt" "./segv_backtrace.txt"
    echo "Trace NEUVE : ./segv_backtrace.txt"
    head -1 ./segv_backtrace.txt
  else
    echo "(aucune trace neuve — build Release, ou dumper absent : le verdict vient de la console)"
  fi
  exit 1
fi
echo "OUVERTE sans crash — la conversation « $CNAME » s'est affichée."
tail -6 "$WORK/console.log"
