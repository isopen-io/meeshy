#!/bin/bash
# Refuse une poignée de commandes shell irréversibles (AMSF, #20763).
# Volontairement ÉTROIT : ce dépôt porte de nombreuses sessions en parallèle,
# un faux positif les arrêterait toutes. Chaque règle vise une commande qu'aucun
# lot légitime n'a de raison de lancer ; tout le reste passe. Une entrée
# illisible passe aussi (fail-open) : ce hook est un filet, pas une frontière —
# la frontière reste la protection de branche et les environnements GitHub.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0

refuse() {
  printf '%s\n' "garde-commandes : $1" >&2
  exit 2
}

# Une COMMANDE, pas un texte : en tête de ligne ou après ; & | (
debut='(^|[;&|(])[[:space:]]*'

if printf '%s' "$cmd" | grep -Eq "${debut}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)"; then
  ligne=$(printf '%s' "$cmd" | grep -E "${debut}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push([[:space:]]|$)")
  if printf '%s' "$ligne" | grep -Eq '(^|[[:space:]])(--force|-f|--force-with-lease(=[^[:space:]]*)?|\+[^[:space:]]*)([[:space:]]|$)' \
    && printf '%s' "$ligne" | grep -Eq '(^|[[:space:]:+/])(dev|main)([[:space:]]|$)'; then
    refuse "pousser en force sur dev ou main réécrit l'histoire que toutes les sessions partagent. Fusionner origin/dev dans la branche, jamais l'inverse."
  fi
  if printf '%s' "$ligne" | grep -Eq '(^|[[:space:]])(--delete|-d)[[:space:]]+([^[:space:]]+[[:space:]]+)?(dev|main)([[:space:]]|$)|[[:space:]]:(dev|main)([[:space:]]|$)'; then
    refuse "supprimer dev ou main sur le dépôt distant est irréversible pour toutes les sessions."
  fi
fi

if printf '%s' "$cmd" | grep -Eq "${debut}(sudo[[:space:]]+)?rm[[:space:]]+(-[a-zA-Z]*[[:space:]]+)*-[a-zA-Z]*[rR][a-zA-Z]*[[:space:]]+(-[a-zA-Z-]*[[:space:]]+)*(/|~|\\\$HOME|/\*|~/\*|\\\$HOME/\*|\.git)/?([[:space:]]|$)"; then
  refuse "rm récursif sur la racine, le dossier personnel ou .git."
fi

if printf '%s' "$cmd" | grep -Eq "${debut}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+(commit|merge|push)[[:space:]].*--no-verify"; then
  refuse "--no-verify saute le hook commit-msg (#6351) qui empêche un message de supprimer tous les workflows du push."
fi

if printf '%s' "$cmd" | grep -Eq '(mongosh|redis-cli)' \
  && printf '%s' "$cmd" | grep -Eq '(meeshy\.me|/opt/meeshy/production)' \
  && ! printf '%s' "$cmd" | grep -q 'staging' \
  && printf '%s' "$cmd" | grep -Eiq '(dropDatabase|\.drop\(|deleteMany\(|FLUSHALL|FLUSHDB)'; then
  refuse "une purge de données de production attend le feu vert du porteur et une sauvegarde vérifiée (CLAUDE.md, #9223)."
fi

exit 0
