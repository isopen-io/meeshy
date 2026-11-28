#!/bin/bash
# Refuse d'écrire un secret ou un fichier protégé par les outils d'édition
# (AMSF, #20763). Même parti pris que garde-commandes.sh : étroit, fail-open
# sur une entrée illisible. Ne remplace ni le scan Trivy de la CI ni la revue.
input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null)
case "$tool" in Write|Edit|NotebookEdit) ;; *) exit 0 ;; esac
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' 2>/dev/null)
content=$(printf '%s' "$input" | jq -r '[.tool_input.content, .tool_input.new_string, .tool_input.new_source] | map(select(. != null)) | join("\n")' 2>/dev/null)
[ -n "$path" ] || exit 0

refuse() {
  printf '%s\n' "garde-ecritures : $1" >&2
  exit 2
}

base=$(basename "$path")
case "$base" in
  .env|.env.local|.env.production|.env.staging|.env.development)
    refuse "$base porte des secrets et n'est pas suivi par git. Les modèles s'appellent *.template ou *.example." ;;
  secrets.yml|secrets.yaml|*.p8|*.p12|*.mobileprovision|*.keystore|*.jks|google-services.json|GoogleService-Info.plist)
    refuse "$base est un fichier d'identifiants : il vit hors du dépôt (secrets GitHub, gestionnaire de mots de passe)." ;;
  bun.lock)
    refuse "bun.lock ne s'écrit que par le bun épinglé par la CI, jamais à la main (#20026)." ;;
esac

# Les fixtures, les témoins et la documentation portent des clés factices ou
# publiques par construction.
case "$path" in
  */__tests__/*|*/__mocks__/*|*/__stubs__/*|*/__fixtures__/*|*/tests/*|*/Tests/*|*/fixtures/*|*/test/*|*/e2e/*|*/docs/*|*/Documentation/*) exit 0 ;;
  *.test.*|*.spec.*|*Tests.swift|*Test.kt|*.md) exit 0 ;;
esac

[ -n "$content" ] || exit 0
motif='AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,}|sk-ant-[A-Za-z0-9_-]{40,}|xox[baprs]-[A-Za-z0-9-]{20,}|-----BEGIN ([A-Z]+ )?PRIVATE KEY-----[^-]{200,}'
if printf '%s' "$content" | tr '\n' ' ' | sed 's/AKIA[0-9A-Z]*EXAMPLE//g' | grep -Eq -- "$motif"; then
  refuse "le contenu ressemble à un secret (clé d'API, jeton ou clé privée). Un secret ne s'écrit ni dans le dépôt ni dans un rapport ; le référencer par son nom de variable."
fi

exit 0
