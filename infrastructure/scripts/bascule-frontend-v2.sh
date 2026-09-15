#!/usr/bin/env bash
# BASCULE DU FRONTEND DE PRODUCTION VERS LA V2 (#6702), ET SON RETOUR ARRIÈRE.
#
# Directive porteur du 2026-09-15 : « décommissionner la legacy et mettre la v2
# à la place tout simplement en production », après validation des critères
# d'acceptation (#6702). Ce script ne se joue que sur décision humaine : la
# production ne part jamais toute seule.
#
# Usage, SUR l'hôte de production :
#   ssh root@meeshy.me 'bash -s -- verifier'            < bascule-frontend-v2.sh
#   ssh root@meeshy.me 'bash -s -- basculer'            < bascule-frontend-v2.sh
#   ssh root@meeshy.me 'bash -s -- revenir <horodatage>' < bascule-frontend-v2.sh
#
# `verifier` (défaut) ne modifie RIEN : il montre le bloc actuel du service
# `frontend` (valeurs d'environnement masquées), le bloc qui le remplacerait, et
# valide la syntaxe du compose patché sur une copie.
#
# Le compose de l'hôte DIVERGE de celui du dépôt : ce script ne réécrit que le
# bloc du service `frontend` (de sa clé au service suivant) et la seule clé
# `FRONTEND_IMAGE` du `.env`, après sauvegarde datée des deux fichiers. Aucune
# valeur d'environnement n'est jamais affichée, et le stderr de `docker compose`
# est filtré (ses avertissements recopient des fragments du `.env`).

set -euo pipefail

cd /opt/meeshy/production

MODE=${1:-verifier}
IMAGE_V2=isopen/meeshy-web-v31:latest
IMAGE_LEGACY=isopen/meeshy-web:latest
STAMP=$(date -u +%Y%m%d-%H%M)
SUFFIXE="bascule-v2"

sans_fuite() { grep -avE 'variable is not set|Defaulting to a blank string' || true; }

bloc_v2() {
  cat <<'YAML'
  frontend:
    image: ${FRONTEND_IMAGE:-isopen/meeshy-web-v31:latest}
    container_name: meeshy-frontend
    restart: unless-stopped
    volumes:
      - frontend_uploads:/srv/legacy-uploads/u:ro
    networks:
      - meeshy-network
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:3400/healthz"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`${DOMAIN:-localhost}`) || Host(`www.${DOMAIN:-localhost}`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.routers.frontend.middlewares=compress@file"
      - "traefik.http.services.frontend.loadbalancer.server.port=3400"
      - "traefik.http.routers.frontend.priority=1"

YAML
}

# Le bloc courant, de `  frontend:` au service suivant, valeurs masquées.
bloc_actuel_masque() {
  awk '/^  frontend:[[:space:]]*$/ { on=1 } on && NR>1 && /^  [a-zA-Z0-9_-]+:[[:space:]]*$/ && !/^  frontend:/ { exit } on { print }' docker-compose.yml \
    | sed -E 's/^([[:space:]]*- *[A-Za-z0-9_]+)=.*/\1=<masqué>/; s/^([[:space:]]*[A-Za-z0-9_]+: *)[^$"\[ ].*(KEY|SECRET|TOKEN|PASSWORD).*/\1<masqué>/'
}

# Remplace le bloc `frontend` et garde les commentaires qui PRÉCÈDENT le service
# suivant (ils lui appartiennent).
compose_patche() {
  local bloc_file
  bloc_file=$(mktemp)
  bloc_v2 > "$bloc_file"
  awk -v bloc_file="$bloc_file" '
    BEGIN { while ((getline line < bloc_file) > 0) bloc = bloc line "\n" }
    /^  frontend:[[:space:]]*$/ && !done { printf "%s", bloc; skip = 1; done = 1; buf = ""; next }
    skip {
      if ($0 ~ /^  [a-zA-Z0-9_-]+:[[:space:]]*$/ || $0 ~ /^[^ #]/) { printf "%s", buf; skip = 0; print; next }
      if ($0 ~ /^[[:space:]]*#/ || $0 ~ /^[[:space:]]*$/) { buf = buf $0 "\n"; next }
      buf = ""; next
    }
    { print }
  ' docker-compose.yml
  rm -f "$bloc_file"
}

valider_syntaxe() {
  local fichier=$1
  if docker compose -f "$fichier" config --quiet 2> >(sans_fuite >&2); then
    echo "syntaxe du compose : valide"
  else
    echo "syntaxe du compose : INVALIDE"
    return 1
  fi
}

attendre_sain() {
  local essai statut
  for essai in $(seq 1 30); do
    statut=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' meeshy-frontend 2>/dev/null || echo absent)
    [ "$statut" = "healthy" ] && { echo "meeshy-frontend : healthy (essai $essai)"; return 0; }
    sleep 3
  done
  echo "meeshy-frontend : $statut au bout de 90 s"
  return 1
}

recette_publique() {
  local base=https://meeshy.me echec=0 obtenu
  verifier_ligne() {
    obtenu=$(curl -s -o /dev/null -w "$2" "$base$1" || true)
    case "$obtenu" in
      $3) echo "ok    $1 -> $obtenu" ;;
      *) echo "FAUX  $1 -> $obtenu (attendu $3)"; echec=1 ;;
    esac
  }
  verifier_ligne / '%{http_code} %{content_type}' '200 text/html*'
  verifier_ligne /healthz '%{http_code}' '200'
  verifier_ligne /.well-known/apple-app-site-association '%{http_code} %{content_type}' '200 application/json*'
  verifier_ligne /.well-known/assetlinks.json '%{http_code} %{content_type}' '200 application/json*'
  verifier_ligne /join/mshy_recette '%{http_code} %{redirect_url}' "308 $base/chat/mshy_recette"
  verifier_ligne /robots.txt '%{http_code} %{content_type}' '200 text/plain*'
  echo "révision servie : $(curl -s "$base/build-info.json" | tr -d '\n' | cut -c1-160)"
  return $echec
}

case "$MODE" in
  verifier)
    echo "== bloc frontend ACTUEL (valeurs masquées)"
    bloc_actuel_masque
    echo "== bloc frontend V2"
    bloc_v2
    tmp=$(mktemp --suffix=.yml -p /opt/meeshy/production)
    compose_patche > "$tmp"
    valider_syntaxe "$tmp" || { rm -f "$tmp"; exit 1; }
    echo "== différence des lignes hors valeurs d'environnement"
    diff <(sed -E 's/^([[:space:]]*- *[A-Za-z0-9_]+)=.*/\1=<masqué>/' docker-compose.yml) \
         <(sed -E 's/^([[:space:]]*- *[A-Za-z0-9_]+)=.*/\1=<masqué>/' "$tmp") || true
    rm -f "$tmp"
    echo "clé FRONTEND_IMAGE présente dans .env : $(grep -cE '^FRONTEND_IMAGE=' .env || true)"
    echo "conteneur actuel : $(docker inspect -f '{{.Config.Image}}' meeshy-frontend 2>/dev/null || echo absent)"
    echo "verifier : rien n'a été modifié."
    ;;

  basculer)
    cp -p docker-compose.yml "docker-compose.yml.bak.$STAMP-$SUFFIXE"
    cp -p .env ".env.bak.$STAMP-$SUFFIXE"
    chmod 600 ".env.bak.$STAMP-$SUFFIXE"
    echo "sauvegardes : docker-compose.yml.bak.$STAMP-$SUFFIXE et .env.bak.$STAMP-$SUFFIXE"
    docker tag "$IMAGE_LEGACY" "isopen/meeshy-web:rollback-$STAMP"
    echo "image legacy épinglée : isopen/meeshy-web:rollback-$STAMP"
    docker pull --quiet "$IMAGE_V2"
    echo "révision de $IMAGE_V2 : $(docker run --rm --entrypoint cat "$IMAGE_V2" /usr/share/nginx/html/build-info.json | tr -d '\n' | cut -c1-160)"
    tmp=$(mktemp --suffix=.yml -p /opt/meeshy/production)
    compose_patche > "$tmp"
    valider_syntaxe "$tmp" || { rm -f "$tmp"; echo "rien n'a été appliqué"; exit 1; }
    mv "$tmp" docker-compose.yml
    sed -i "s#^FRONTEND_IMAGE=.*#FRONTEND_IMAGE=$IMAGE_V2#" .env
    docker compose up -d --no-deps frontend 2>&1 | sans_fuite
    if attendre_sain && recette_publique; then
      echo "BASCULE TENUE — retour arrière : bash -s -- revenir $STAMP"
    else
      echo "BASCULE REFUSÉE par la santé ou la recette — retour arrière automatique"
      cp -p "docker-compose.yml.bak.$STAMP-$SUFFIXE" docker-compose.yml
      cp -p ".env.bak.$STAMP-$SUFFIXE" .env
      docker compose up -d --no-deps frontend 2>&1 | sans_fuite
      attendre_sain || true
      exit 1
    fi
    ;;

  revenir)
    STAMP_CIBLE=${2:?"usage : revenir <horodatage de la bascule>"}
    [ -f "docker-compose.yml.bak.$STAMP_CIBLE-$SUFFIXE" ] || { echo "sauvegarde introuvable pour $STAMP_CIBLE"; exit 1; }
    cp -p "docker-compose.yml.bak.$STAMP_CIBLE-$SUFFIXE" docker-compose.yml
    cp -p ".env.bak.$STAMP_CIBLE-$SUFFIXE" .env
    docker compose up -d --no-deps frontend 2>&1 | sans_fuite
    attendre_sain
    echo "legacy rétabli depuis la sauvegarde $STAMP_CIBLE"
    ;;

  *)
    echo "mode inconnu : $MODE (verifier | basculer | revenir <horodatage>)"
    exit 2
    ;;
esac
