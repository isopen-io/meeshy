#!/bin/bash
# Refuse trois commandes shell irréversibles (AMSF, #20763) :
#   - pousser en force sur dev ou main, ou les supprimer du dépôt distant ;
#   - rm récursif sur la racine ou le dossier personnel ;
#   - git commit/merge/push --no-verify (saute le hook commit-msg, #6351).
#
# Volontairement ÉTROIT : ce dépôt porte de nombreuses sessions en parallèle,
# un faux positif les arrêterait toutes. Le test porte donc sur le SEGMENT de
# commande concerné, une fois retirés les heredocs, les chaînes entre guillemets
# et les commentaires — un message de commit ou un grep qui CITE la commande ne
# déclenche rien. Une entrée illisible, ou l'absence de jq ou de perl, laisse
# passer (fail-open) : ce hook est un filet, pas une frontière. La frontière
# reste la protection de branche et les environnements GitHub. Il se contourne
# (git -c …, guillemets autour de la cible) et ne prétend pas le contraire.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)" = "Bash" ] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$cmd" ] || exit 0

net=$(printf '%s' "$cmd" | perl -0pe '
  s/<<-?\s*([\x27"]?)(\w+)\1.*?\n\s*\2\b//gs;
  s/"(?:\\.|[^"\\])*"//gs;
  s/\x27[^\x27]*\x27//gs;
  s/#.*$//mg;
' 2>/dev/null) || exit 0

refuse() {
  printf '%s\n' "garde-commandes : $1" >&2
  exit 2
}

git_cmd='^[[:space:](]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'
branche='(^|[[:space:]])\+?([^[:space:]:]*:)?(refs/heads/)?(dev|main)([[:space:]]|$)'

while IFS= read -r segment; do
  if printf '%s' "$segment" | grep -Eq "${git_cmd}push([[:space:]]|$)"; then
    if printf '%s' "$segment" | grep -Eq '(^|[[:space:]])(--force|-f|--force-with-lease(=[^[:space:]]*)?)([[:space:]]|$)|[[:space:]]\+[^[:space:]]' \
      && printf '%s' "$segment" | grep -Eq "$branche"; then
      refuse "pousser en force sur dev ou main réécrit l'histoire que toutes les sessions partagent. Fusionner origin/dev dans la branche, jamais l'inverse."
    fi
    if printf '%s' "$segment" | grep -Eq '(^|[[:space:]])(--delete|-d)([[:space:]]|$)' && printf '%s' "$segment" | grep -Eq "$branche"; then
      refuse "supprimer dev ou main sur le dépôt distant est irréversible pour toutes les sessions."
    fi
    if printf '%s' "$segment" | grep -Eq '[[:space:]]:(refs/heads/)?(dev|main)([[:space:]]|$)'; then
      refuse "supprimer dev ou main sur le dépôt distant est irréversible pour toutes les sessions."
    fi
  fi
  if printf '%s' "$segment" | grep -Eq "${git_cmd}(commit|merge|push)([[:space:]]|$)" \
    && printf '%s' "$segment" | grep -Eq '(^|[[:space:]])--no-verify([[:space:]]|$)'; then
    refuse "--no-verify saute le hook commit-msg (#6351) qui empêche un message de supprimer tous les workflows du push."
  fi
  if printf '%s' "$segment" | grep -Eq '^[[:space:](]*(sudo[[:space:]]+)?rm[[:space:]]' \
    && printf '%s' "$segment" | grep -Eq '[[:space:]]-[a-zA-Z]*[rR]' \
    && printf '%s' "$segment" | grep -Eq '[[:space:]](/|~|\$HOME|/\*|~/\*|\$HOME/\*|\$HOME/|~/)([[:space:]]|$)'; then
    refuse "rm récursif sur la racine ou le dossier personnel."
  fi
done < <(printf '%s\n' "$net" | tr ';&|' '\n\n\n')

exit 0
