#!/bin/sh
# LA CONFIGURATION DU DÉPLOIEMENT, ÉCRITE AU DÉMARRAGE DU CONTENEUR (#10208).
#
# Une seule image sert le staging, la production et tout déploiement sur site :
# l'origine de la passerelle ne se fige plus au build. Ce script écrit
# `config.js` (`window.__MEESHY_RUNTIME__`) depuis l'environnement, puis lance
# la commande du conteneur.
#
#   MEESHY_API_URL  la passerelle (HTTP et socket), ex. https://api.acme.fr
#                   ou http://10.0.0.5:3000
#   MEESHY_WEB_URL  l'origine publique des liens partagés, ex. https://chat.acme.fr
#
# Les deux sont facultatives : absentes, l'application déduit la passerelle de
# l'hôte qui la sert (`gate.<hôte>`, ou `<hôte>:3000` pour une IP) — voir
# `src/lib/api/config.ts`. Une valeur PRÉSENTE mais invalide arrête le
# démarrage : un conteneur qui démarrerait en ignorant la configuration
# déclarée servirait une application branchée ailleurs, sans que rien ne rougisse.

set -eu

CONFIG_FILE="${MEESHY_CONFIG_FILE:-/usr/share/nginx/html/config.js}"

# Une origine absolue http(s) : hôte (nom, IPv4 ou [IPv6]), port et chemin
# facultatifs. Ni identifiants, ni requête, ni guillemet : la valeur s'écrit
# telle quelle dans une chaîne JavaScript, cette expression est ce qui le rend sûr.
is_origin() {
  printf '%s' "$1" | grep -Eq '^https?://([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\[[0-9A-Fa-f:.]+\])(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$'
}

entries=""
add_entry() {
  key=$1
  name=$2
  value=$(printf '%s' "$3" | tr -d '[:space:]')
  [ -z "$value" ] && return 0
  if ! is_origin "$value"; then
    echo "runtime-config: $name invalide ($value) — attendu une origine http(s)://hôte[:port][/chemin]" >&2
    exit 64
  fi
  entries="${entries:+$entries, }\"$key\": \"$value\""
  echo "runtime-config: $name=$value"
}

add_entry apiUrl MEESHY_API_URL "${MEESHY_API_URL:-}"
add_entry webUrl MEESHY_WEB_URL "${MEESHY_WEB_URL:-}"

[ -z "$entries" ] && echo "runtime-config: aucune origine déclarée — la passerelle se déduit de l'hôte de la page"

printf '/* Écrit au démarrage du conteneur (docker/runtime-config.sh, #10208). */\nwindow.__MEESHY_RUNTIME__ = {%s};\n' "$entries" > "$CONFIG_FILE.tmp"
mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"

exec "$@"
