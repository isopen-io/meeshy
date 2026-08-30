#!/bin/bash
# Selection des services a construire — `.github/workflows/docker.yml`
#
# POURQUOI CE FICHIER EXISTE
#
# La selection vivait en bash INLINE dans le job `detect` de `docker.yml` :
# quarante-cinq lignes qu'aucun test ne pouvait executer, et dont une seule
# ligne decidait si une zone est construite ou non. Le prix de l'inexecutable a
# ete paye a l'introduction de la zone v3 (`apps/web-v3`), qui porte un PIEGE DE
# NOMMAGE : le detecteur de declenchement manuel testait `*"web"*`, donc
# demander `web-v3` construisait AUSSI la zone legacy — silencieusement, et sans
# qu'aucun garde ne puisse le dire.
#
# La selection est donc un SCRIPT : la meme logique, appelable hors GitHub, donc
# testable par comportement (`apps/web-v3/__tests__/pipeline.test.ts`).
#
# CE QUI REND LES DEUX ZONES DISJOINTES
#
#   - au PUSH, par le chemin : la chaine `apps/web-v3/` ne contient pas
#     `apps/web/`, et l'inverse est vrai aussi. Les prefixes sont ancres en
#     debut de ligne, donc `docs/apps/web/x` ne reveille rien.
#   - au DECLENCHEMENT MANUEL, par le JETON : la demande est une liste separee
#     par des virgules, et chaque service y est cherche comme un element ENTIER.
#     C'est ce qui distingue `web` de `web-v3` ; une recherche de sous-chaine ne
#     le peut pas, quel que soit le nom choisi.
#
# ENTREES (variables d'environnement)
#   EVENT_NAME      `workflow_dispatch` | `push` | ... (defaut : `push`)
#   SERVICES_INPUT  declenchement manuel : `all` ou liste `a,b,c`
#   REF             `github.ref` — un tag `refs/tags/v*` construit tout
#   CHANGED         chemins modifies, un par ligne
#   TORCH_BACKEND   `cpu` | `gpu` | `all` (defaut : `cpu`)
#
# SORTIE (stdout, au format `cle=valeur` de `$GITHUB_OUTPUT`)
#   result=<json de la matrice>
#   has_changes=<true|false>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly REPO_ROOT

readonly EVENT_NAME="${EVENT_NAME:-push}"
readonly SERVICES_INPUT="${SERVICES_INPUT:-}"
readonly REF="${REF:-}"
readonly CHANGED="${CHANGED:-}"
TORCH_BACKEND="${TORCH_BACKEND:-}"
if [[ -z "$TORCH_BACKEND" ]]; then
  TORCH_BACKEND="cpu"
fi
readonly TORCH_BACKEND

# Le service est-il demande NOMMEMENT ? Element entier d'une liste a virgules —
# jamais une sous-chaine (cf. le piege de nommage en tete).
requested() {
  local service="$1"
  [[ ",${SERVICES_INPUT// /}," == *",${service},"* ]]
}

# Un chemin modifie commence-t-il par ce prefixe ?
touched() {
  local prefix="$1"
  printf '%s\n' "$CHANGED" | grep -q "^${prefix}"
}

version_from_file() {
  local path="$REPO_ROOT/$1"
  local version=""
  [[ -f "$path" ]] && version="$(cat "$path")"
  printf '%s' "${version:-1.0.0}"
}

# Le manifeste porte deja la version : la lire evite un second fichier de
# version a tenir en phase avec lui.
version_from_manifest() {
  local path="$REPO_ROOT/$1"
  local version=""
  if [[ -f "$path" ]]; then
    version="$( (grep '"version"' "$path" || true) | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')"
  fi
  printf '%s' "${version:-1.0.0}"
}

selected() {
  local service="$1"
  shift

  if [[ "$EVENT_NAME" == "workflow_dispatch" ]]; then
    if [[ "$SERVICES_INPUT" == "all" ]]; then
      return 0
    fi
    if requested "$service"; then
      return 0
    fi
    return 1
  fi

  if [[ "$REF" == refs/tags/v* ]]; then
    return 0
  fi

  local prefix
  for prefix in "$@"; do
    if touched "$prefix"; then
      return 0
    fi
  done
  return 1
}

entries=()

entry() {
  entries+=("$1")
}

if selected web 'apps/web/' 'packages/shared/'; then
  entry '{"service":"web","context":".","dockerfile":"./apps/web/Dockerfile","image":"meeshy-web","version":"'"$(version_from_file apps/web/VERSION)"'"}'
fi

if selected web-v3 'apps/web-v3/' 'packages/shared/'; then
  entry '{"service":"web-v3","context":".","dockerfile":"./apps/web-v3/Dockerfile","image":"meeshy-web-v3","version":"'"$(version_from_manifest apps/web-v3/package.json)"'"}'
fi

if selected gateway 'services/gateway/' 'packages/shared/'; then
  entry '{"service":"gateway","context":".","dockerfile":"./services/gateway/Dockerfile","image":"meeshy-gateway","version":"'"$(version_from_file services/gateway/VERSION)"'"}'
fi

if selected agent 'services/agent/' 'packages/shared/'; then
  entry '{"service":"agent","context":".","dockerfile":"./services/agent/Dockerfile","image":"meeshy-agent","version":"'"$(version_from_manifest services/agent/package.json)"'"}'
fi

if selected translator 'services/translator/' 'packages/shared/'; then
  translator_version="$(version_from_file services/translator/VERSION)"

  if [[ "$TORCH_BACKEND" == "cpu" ]] || [[ "$TORCH_BACKEND" == "all" ]]; then
    entry '{"service":"translator","context":".","dockerfile":"./services/translator/Dockerfile","image":"meeshy-translator","version":"'"$translator_version"'","torch_backend":"cpu"}'
  fi

  if [[ "$TORCH_BACKEND" == "gpu" ]] || [[ "$TORCH_BACKEND" == "all" ]]; then
    entry '{"service":"translator-gpu","context":".","dockerfile":"./services/translator/Dockerfile","image":"meeshy-translator","version":"'"$translator_version"'","torch_backend":"gpu"}'
  fi
fi

joined="$(IFS=,; printf '%s' "${entries[*]:-}")"

printf 'result={"include":[%s]}\n' "$joined"
printf 'has_changes=%s\n' "$([[ ${#entries[@]} -gt 0 ]] && printf true || printf false)"
