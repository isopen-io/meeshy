#!/bin/bash
# =============================================================================
# MEESHY PRODUCTION — PROMOTION d'un digest validé sur staging (PROPOSITION)
# =============================================================================
# Source proposée de `/usr/local/bin/meeshy-promote-production.sh`, sur le
# modèle de `meeshy-deploy-staging.sh`. La clé de CI « production » y est
# contrainte dans `~/.ssh/authorized_keys` :
#
#   command="/usr/local/bin/meeshy-promote-production.sh",restrict ssh-ed25519 AAAA... gha-promote-production
#
# La demande arrive en DONNÉE (`$SSH_ORIGINAL_COMMAND`), n'est jamais évaluée
# par un shell, et se valide mot par mot :
#
#   status
#   plan     <service>=sha256:<64 hex> [...]
#   promote  <service>=sha256:<64 hex> [...]
#   rollback <service> [...]
#
# <service> ∈ { gateway translator agent }. Rien d'autre.
#
# CE QUE CE SCRIPT FAIT
#   - Il ne RECONSTRUIT rien et ne choisit rien : il promeut un digest que le
#     conteneur de staging EXÉCUTE au moment de l'appel (refus sinon).
#   - Il note le digest de production COURANT avant la bascule (retour
#     arrière), l'épingle par un conteneur arrêté pour que la purge de staging
#     (`image prune -a`) ne l'emporte pas, puis bascule UN service à la fois
#     (`up -d --no-deps`), attend `healthy`, et revient seul en arrière si la
#     santé ne vient pas.
#   - La production suit des digests par un fichier de surcharge GÉNÉRÉ
#     (`docker-compose.promotion.yml`), jamais en éditant le compose ni le
#     `.env` qui porte les secrets.
#
# CE QU'IL NE FAIT JAMAIS
#   - aucune migration, aucun script de données, aucun `exec` dans un
#     conteneur, aucun accès à MongoDB ou Redis ;
#   - aucune purge (`prune`), aucun `down`, aucun volume : les images de
#     retour arrière doivent survivre, et les données ne sont pas son affaire ;
#   - jamais la webapp : son image de staging porte `gate.staging.meeshy.me`
#     figée au build (VITE_API_BASE, docker.yml). La promouvoir enverrait les
#     utilisateurs de production sur la passerelle de staging.
#
# RÉPÉTITION SUR STAGING (root sur l'hôte uniquement — `restrict` et
# `PermitUserEnvironment no` empêchent la CI de poser ces variables) :
#   MEESHY_PROD_DIR=/opt/meeshy/staging MEESHY_TARGET_SUFFIX=-staging \
#   MEESHY_SOURCE_CHECK=local MEESHY_PROMOTION_STATE=/var/lib/meeshy-promotion-rehearsal \
#   MEESHY_COMPOSE_FILE=<fichiers de staging>:docker-compose.promotion.yml \
#     /usr/local/bin/meeshy-promote-production.sh promote gateway=sha256:<digest précédent>
#   ... puis `rollback gateway` avec les mêmes variables.
#
# INSTALLATION (session ayant l'accès root@meeshy.me) :
#   scp meeshy-promote-production.sh root@meeshy.me:/tmp/
#   ssh root@meeshy.me 'install -m 0755 /tmp/meeshy-promote-production.sh \
#       /usr/local/bin/meeshy-promote-production.sh \
#     && /usr/local/bin/meeshy-promote-production.sh --self-test \
#     && /usr/local/bin/meeshy-promote-production.sh init'
# =============================================================================

set -uo pipefail
# La connexion SSH de la CI peut tomber en pleine bascule : le script doit
# alors aller au bout (santé, retour arrière), pas mourir à mi-chemin.
trap '' HUP

PROD_DIR="${MEESHY_PROD_DIR:-/opt/meeshy/production}"
STATE_DIR="${MEESHY_PROMOTION_STATE:-/var/lib/meeshy-promotion}"
TARGET_SUFFIX="${MEESHY_TARGET_SUFFIX:-}"
SOURCE_SUFFIX="${MEESHY_SOURCE_SUFFIX:--staging}"
# `staging` : le digest doit être celui que le conteneur de staging exécute.
# `local`   : répétition seulement — le digest doit être présent sur l'hôte.
SOURCE_CHECK="${MEESHY_SOURCE_CHECK:-staging}"
OVERRIDE_NAME="docker-compose.promotion.yml"
LOCK_FILE="/run/lock/meeshy-promotion.lock"
REGISTRY_NS="isopen"

# ÉNUMÉRÉE, et dans l'ORDRE de bascule : la passerelle, face publique, en
# dernier. `webapp`/`frontend` n'y sont pas, et c'est une décision (en-tête).
SERVICES_PROMOUVABLES="translator agent gateway"

RC_REFUS=64
RC_ECHEC=70
RC_RETOUR=75
DIGEST_RE='^sha256:[0-9a-f]{64}$'
REVISION_RE='^[0-9a-f]{40}$'

[ -n "${MEESHY_COMPOSE_FILE:-}" ] && export COMPOSE_FILE="$MEESHY_COMPOSE_FILE"

journal() { echo "[$(date -u +%FT%TZ)] $*" >&2; }
dire() { echo "$*"; }
refus() { journal "REFUS: $*"; exit "$RC_REFUS"; }

delai_sante() {
  case "$1" in
    translator) echo 900 ;;
    *) echo 240 ;;
  esac
}

conteneur_cible() { echo "meeshy-$1$TARGET_SUFFIX"; }
conteneur_source() { echo "meeshy-$1$SOURCE_SUFFIX"; }
conteneur_epingle() { echo "meeshy-rollback-pin-$1$TARGET_SUFFIX"; }
depot() { echo "$REGISTRY_NS/meeshy-$1"; }

est_promouvable() {
  case " $SERVICES_PROMOUVABLES " in
    *" $1 "*) return 0 ;;
  esac
  return 1
}

refuser_service() {
  case "$1" in
    webapp|frontend|web)
      refus "« $1 » n'est pas promouvable : l'image de staging porte gate.staging.meeshy.me figée au build (VITE_API_BASE)." ;;
    *)
      refus "service non déclaré « $1 »" ;;
  esac
}

label() {
  local objet="$1" cle="$2" valeur
  valeur="$(docker inspect -f "{{index .Config.Labels \"$cle\"}}" "$objet" 2>/dev/null)" || { echo ""; return; }
  [ "$valeur" = "<no value>" ] && valeur=""
  echo "$valeur"
}

image_du_conteneur() { docker inspect -f '{{.Image}}' "$1" 2>/dev/null; }

sante() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo absent
}

# Les digests de registre (`sha256:…`) sous lesquels une image locale est connue
# pour le dépôt de CE service — jamais pour un autre dépôt.
digests_connus() {
  local image="$1" svc="$2" repo
  repo="$(depot "$svc")"
  docker image inspect -f '{{range .RepoDigests}}{{println .}}{{end}}' "$image" 2>/dev/null \
    | sed -n "s#^docker.io/##; s#^${repo}@##p"
}

revision_de() { label "$1" "org.opencontainers.image.revision"; }

# Variante GPU : un digest CPU ne remplace jamais une production GPU.
est_gpu() {
  docker image inspect -f '{{range .RepoTags}}{{println .}}{{end}}' "$1" 2>/dev/null | grep -q -- '-gpu$'
}

# ---------------------------------------------------------------------------
# Contexte compose : LU sur le conteneur de production, jamais supposé.
# ---------------------------------------------------------------------------
PROJET=""
declare -A SERVICE_COMPOSE=()

contexte_compose() {
  local svc conteneur dossier projet nom reel_attendu reel_lu
  reel_attendu="$(readlink -f "$PROD_DIR")"
  for svc in $SERVICES_PROMOUVABLES; do
    conteneur="$(conteneur_cible "$svc")"
    if ! docker inspect "$conteneur" >/dev/null 2>&1; then
      nom="$(cat "$STATE_DIR/service.$svc" 2>/dev/null || true)"
      [ -n "$nom" ] && SERVICE_COMPOSE[$svc]="$nom"
      continue
    fi
    dossier="$(label "$conteneur" com.docker.compose.project.working_dir)"
    projet="$(label "$conteneur" com.docker.compose.project)"
    nom="$(label "$conteneur" com.docker.compose.service)"
    reel_lu="$(readlink -f "$dossier" 2>/dev/null || echo "$dossier")"
    [ "$reel_lu" = "$reel_attendu" ] \
      || refus "$conteneur appartient à « $dossier », pas à $PROD_DIR — la production ne vit pas où ce script la cherche."
    [ -z "$PROJET" ] || [ "$PROJET" = "$projet" ] \
      || refus "deux projets compose en production (« $PROJET » et « $projet »)."
    PROJET="$projet"
    SERVICE_COMPOSE[$svc]="$nom"
    echo "$nom" > "$STATE_DIR/service.$svc"
  done
  [ -n "$PROJET" ] || refus "aucun conteneur de production trouvé (meeshy-<service>$TARGET_SUFFIX)."
}

compose() { (cd "$PROD_DIR" && docker compose -p "$PROJET" "$@"); }

# L'image que compose DÉPLOIERAIT pour ce service, surcharge comprise.
image_configuree() {
  compose config 2>/dev/null | awk -v s="$1" '
    /^services:/ { dans = 1; next }
    dans && /^[^ ]/ { dans = 0 }
    dans && /^  [^ ][^:]*:[[:space:]]*$/ { courant = $1; sub(/:$/, "", courant) }
    dans && courant == s && /^    image:/ { gsub(/["\047]/, "", $2); print $2; exit }'
}

ecrire_surcharge() {
  local tmp svc ref n=0
  tmp="$(mktemp "$PROD_DIR/.promotion.XXXXXX")" || return 1
  {
    echo "# GÉNÉRÉ par meeshy-promote-production.sh — ne pas éditer à la main."
    echo "# État : $STATE_DIR/current.* — historique : $STATE_DIR/history.log"
    for svc in $SERVICES_PROMOUVABLES; do
      ref="$(cat "$STATE_DIR/current.$svc" 2>/dev/null || true)"
      [ -n "$ref" ] && [ -n "${SERVICE_COMPOSE[$svc]:-}" ] && n=$((n + 1))
    done
    if [ "$n" -eq 0 ]; then
      echo "services: {}"
    else
      echo "services:"
      for svc in $SERVICES_PROMOUVABLES; do
        ref="$(cat "$STATE_DIR/current.$svc" 2>/dev/null || true)"
        [ -n "$ref" ] && [ -n "${SERVICE_COMPOSE[$svc]:-}" ] || continue
        echo "  ${SERVICE_COMPOSE[$svc]}:"
        echo "    image: $ref"
      done
    fi
  } > "$tmp"
  [ -f "$PROD_DIR/$OVERRIDE_NAME" ] && cp -a "$PROD_DIR/$OVERRIDE_NAME" "$STATE_DIR/override.prev"
  chmod 0644 "$tmp" && mv -f "$tmp" "$PROD_DIR/$OVERRIDE_NAME"
}

# La surcharge doit être LUE par compose (COMPOSE_FILE du `.env`) : sinon la
# production retomberait sur son tag au prochain `up`, en silence.
surcharge_lue() {
  local fichiers="${COMPOSE_FILE:-}"
  [ -n "$fichiers" ] || fichiers="$(sed -n 's/^COMPOSE_FILE=//p' "$PROD_DIR/.env" 2>/dev/null | tail -1)"
  case ":$fichiers:" in
    *":$OVERRIDE_NAME:"*|*"/$OVERRIDE_NAME:"*) return 0 ;;
  esac
  return 1
}

historique() {
  echo "$(date -u +%FT%TZ) $*" >> "$STATE_DIR/history.log"
}

# Un conteneur ARRÊTÉ qui référence l'image suffit à la soustraire à
# `docker image prune -a` (le script de staging purge sur ce même hôte).
epingler() {
  local svc="$1" ref="$2" nom
  nom="$(conteneur_epingle "$svc")"
  docker rm -f "$nom" >/dev/null 2>&1 || true
  docker create --name "$nom" --label "meeshy.rollback-pin=$svc" --network none \
    --entrypoint /bin/true "$ref" >/dev/null 2>&1
}

assurer_locale() {
  docker image inspect "$1" >/dev/null 2>&1 && return 0
  journal "image $1 absente de l'hôte — tirage par digest depuis le registre"
  docker pull -q "$1" >/dev/null 2>&1
}

attendre_sante() {
  local svc="$1" image_attendue="$2" conteneur delai debut etat
  conteneur="$(conteneur_cible "$svc")"
  delai="$(delai_sante "$svc")"
  debut="$(date +%s)"
  while [ $(( $(date +%s) - debut )) -lt "$delai" ]; do
    etat="$(sante "$conteneur")"
    if [ "$(image_du_conteneur "$conteneur")" = "$image_attendue" ]; then
      case "$etat" in
        healthy) return 0 ;;
        unhealthy|exited|dead) journal "$conteneur : $etat"; return 1 ;;
      esac
    fi
    sleep 5
  done
  journal "$conteneur : pas healthy après ${delai}s (dernier état : $etat)"
  return 1
}

# Bascule effective d'UN service vers `ref` (déjà validée et présente).
basculer() {
  local svc="$1" ref="$2" nom image_attendue configuree
  nom="${SERVICE_COMPOSE[$svc]}"
  image_attendue="$(docker image inspect -f '{{.Id}}' "$ref" 2>/dev/null)" || return 1
  echo "$ref" > "$STATE_DIR/current.$svc"
  ecrire_surcharge || return 1
  configuree="$(image_configuree "$nom")"
  if [ "$configuree" != "$ref" ]; then
    journal "compose déploierait « $configuree » au lieu de « $ref » — surcharge non lue"
    return 1
  fi
  journal "up: $nom -> $ref"
  compose up -d --no-deps --pull never "$nom" >&2 || return 1
  attendre_sante "$svc" "$image_attendue"
}

# ---------------------------------------------------------------------------
# Validation des demandes — AUCUNE mutation avant que tout soit validé.
# ---------------------------------------------------------------------------
declare -A CIBLE=()
declare -A PROD_REF=()
ORDRE_DEMANDE=""

lire_cibles() {
  local mot svc digest
  [ "$#" -gt 0 ] || refus "aucun service demandé"
  for mot in "$@"; do
    svc="${mot%%=*}"
    digest="${mot#*=}"
    [ "$svc" != "$mot" ] || refus "« $mot » : attendu <service>=sha256:<digest>"
    est_promouvable "$svc" || refuser_service "$svc"
    [[ "$digest" =~ $DIGEST_RE ]] || refus "« $mot » : digest invalide"
    [ -z "${CIBLE[$svc]:-}" ] || refus "« $svc » demandé deux fois"
    CIBLE[$svc]="$digest"
    ORDRE_DEMANDE="$ORDRE_DEMANDE $svc"
  done
}

lire_services() {
  local svc
  [ "$#" -gt 0 ] || refus "aucun service demandé"
  for svc in "$@"; do
    est_promouvable "$svc" || refuser_service "$svc"
  done
}

# Imprime une ligne PLAN par service, ou refuse. Ne modifie rien.
planifier() {
  local svc digest ref source image_source cible image_cible prod_digest prod_ref rev prod_rev statut
  for svc in $SERVICES_PROMOUVABLES; do
    digest="${CIBLE[$svc]:-}"
    [ -n "$digest" ] || continue
    ref="$(depot "$svc")@$digest"
    source="$(conteneur_source "$svc")"
    cible="$(conteneur_cible "$svc")"

    if [ "$SOURCE_CHECK" = "staging" ]; then
      image_source="$(image_du_conteneur "$source")" || refus "$source introuvable"
      digests_connus "$image_source" "$svc" | grep -qx "$digest" \
        || refus "$svc : $digest n'est PAS l'image que $source exécute (staging a bougé depuis la recette ?)"
      [ "$(sante "$source")" = "healthy" ] || refus "$svc : $source n'est pas healthy — rien à promouvoir"
      docker image inspect "$ref" >/dev/null 2>&1 || refus "$svc : $ref non résolu localement"
    else
      assurer_locale "$ref" || refus "$svc : $ref introuvable (répétition)"
    fi

    image_cible="$(image_du_conteneur "$cible")" || refus "$cible introuvable"
    prod_digest="$(digests_connus "$image_cible" "$svc" | head -1)"
    [[ "$prod_digest" =~ $DIGEST_RE ]] \
      || refus "$svc : l'image de production n'a aucun digest de registre — retour arrière non garanti"
    prod_ref="$(depot "$svc")@$prod_digest"

    if est_gpu "$image_cible" && ! est_gpu "$ref"; then
      refus "$svc : la production tourne en variante GPU, le digest demandé ne l'est pas"
    fi

    rev="$(revision_de "$ref")"
    prod_rev="$(revision_de "$image_cible")"
    [[ "$rev" =~ $REVISION_RE ]] || refus "$svc : l'image cible ne porte pas de révision (label OCI)"
    [[ "$prod_rev" =~ $REVISION_RE ]] || prod_rev="inconnue"

    statut="a-promouvoir"
    digests_connus "$image_cible" "$svc" | grep -qx "$digest" && statut="deja-en-production"
    dire "PLAN service=$svc statut=$statut cible=$digest revision=$rev prod=$prod_digest prod_revision=$prod_rev"
    PROD_REF[$svc]="$prod_ref"
  done
}

# ---------------------------------------------------------------------------
# Actions
# ---------------------------------------------------------------------------
# mode `manuel` : bascule vers le digest noté, et l'ancien courant devient le
# précédent (deux retours successifs se rejouent l'un l'autre, comme attendu).
# mode `auto` : retour après une bascule ratée — le digest raté n'est PAS noté
# comme précédent, pour qu'un `rollback` manuel ultérieur n'y retourne jamais.
revenir() {
  local svc="$1" mode="${2:-manuel}" precedent courant
  precedent="$(cat "$STATE_DIR/previous.$svc" 2>/dev/null || true)"
  [ -n "$precedent" ] || { journal "$svc : aucun digest précédent noté"; return "$RC_REFUS"; }
  courant="$(cat "$STATE_DIR/current.$svc" 2>/dev/null || true)"
  assurer_locale "$precedent" || { journal "$svc : $precedent introuvable, ni local ni au registre"; return "$RC_ECHEC"; }
  if basculer "$svc" "$precedent"; then
    if [ "$mode" = "auto" ]; then
      rm -f "$STATE_DIR/previous.$svc"
    else
      [ -n "$courant" ] && echo "$courant" > "$STATE_DIR/previous.$svc" && { epingler "$svc" "$courant" || true; }
    fi
    historique "rollback-$mode service=$svc vers=$precedent depuis=${courant:-?}"
    dire "RETOUR service=$svc vers=$precedent"
    return 0
  fi
  historique "rollback-ECHEC service=$svc vers=$precedent"
  dire "RETOUR_ECHOUE service=$svc vers=$precedent"
  return "$RC_ECHEC"
}

promouvoir() {
  local svc digest ref promus="" s echec=0 run="${1:-}"
  planifier
  for svc in $SERVICES_PROMOUVABLES; do
    digest="${CIBLE[$svc]:-}"
    [ -n "$digest" ] || continue
    ref="$(depot "$svc")@$digest"
    if [ "${PROD_REF[$svc]}" = "$ref" ]; then
      dire "DEJA service=$svc digest=$digest"
      continue
    fi
    epingler "$svc" "${PROD_REF[$svc]}" \
      || { journal "$svc : impossible d'épingler ${PROD_REF[$svc]} — pas de bascule sans retour arrière"; echec=1; break; }
    echo "${PROD_REF[$svc]}" > "$STATE_DIR/previous.$svc"
    historique "promote service=$svc vers=$ref depuis=${PROD_REF[$svc]} run=${run:-manuel}"
    if basculer "$svc" "$ref"; then
      dire "PROMU service=$svc digest=$digest precedent=${PROD_REF[$svc]#*@}"
      promus="$svc $promus"
    else
      journal "$svc : bascule en échec — retour arrière AUTOMATIQUE"
      promus="$svc $promus"
      echec=1
      break
    fi
  done
  [ "$echec" -eq 0 ] && return 0
  # Ordre inverse : ce qui a basculé en dernier revient en premier.
  for s in $promus; do revenir "$s" auto || true; done
  return "$RC_RETOUR"
}

etat() {
  local svc src cbl img_s img_c
  for svc in $SERVICES_PROMOUVABLES; do
    src="$(conteneur_source "$svc")"; cbl="$(conteneur_cible "$svc")"
    img_s="$(image_du_conteneur "$src" || true)"; img_c="$(image_du_conteneur "$cbl" || true)"
    dire "ETAT service=$svc" \
      "staging=$(digests_connus "$img_s" "$svc" | head -1) staging_revision=$(revision_de "$img_s") staging_sante=$(sante "$src")" \
      "prod=$(digests_connus "$img_c" "$svc" | head -1) prod_revision=$(revision_de "$img_c") prod_sante=$(sante "$cbl")" \
      "precedent=$(cat "$STATE_DIR/previous.$svc" 2>/dev/null | sed 's/.*@//') epingle=$(docker inspect -f '{{.Image}}' "$(conteneur_epingle "$svc")" >/dev/null 2>&1 && echo oui || echo non)"
  done
  surcharge_lue && dire "SURCHARGE lue=oui" || dire "SURCHARGE lue=NON — COMPOSE_FILE du .env ne contient pas $OVERRIDE_NAME"
}

init() {
  surcharge_lue || refus "ajouter $OVERRIDE_NAME à COMPOSE_FILE dans $PROD_DIR/.env d'abord (voir note)"
  [ -f "$PROD_DIR/$OVERRIDE_NAME" ] || ecrire_surcharge || refus "écriture de la surcharge impossible"
  compose config -q || refus "compose config invalide avec la surcharge"
  journal "init: surcharge en place ; aperçu à blanc (rien ne doit être recréé) :"
  compose --dry-run up -d --no-deps $(printf '%s ' "${SERVICE_COMPOSE[@]}") >&2 || true
  etat
}

# ---------------------------------------------------------------------------
self_test() {
  local echecs=0 rc interdit
  essai() { ( "$0" __valider "$@" ) >/dev/null 2>&1; }

  essai promote "gateway=sha256:$(printf 'a%.0s' $(seq 64))"; rc=$?
  [ "$rc" -eq 0 ] || { echo "AVEUGLE: une demande valide a été refusée (rc=$rc)" >&2; echecs=$((echecs + 1)); }

  for interdit in \
    "promote webapp=sha256:$(printf 'a%.0s' $(seq 64))" \
    "promote database=sha256:$(printf 'a%.0s' $(seq 64))" \
    "promote gateway=sha256:abc" \
    "promote gateway=sha256:$(printf 'A%.0s' $(seq 64))" \
    "promote gateway=latest" \
    "promote gateway" \
    "promote gateway=sha256:$(printf 'a%.0s' $(seq 64));id" \
    "rollback frontend" \
    "rollback" \
    "migrate gateway" \
    "cat /etc/shadow" \
    ""; do
    # shellcheck disable=SC2086
    essai $interdit; rc=$?
    [ "$rc" -eq "$RC_REFUS" ] || { echo "AVEUGLE: « $interdit » non refusé en rc=$RC_REFUS (rc=$rc)" >&2; echecs=$((echecs + 1)); }
  done

  # Le code de ce script ne touche ni aux données ni au disque partagé.
  if grep -vE '^[[:space:]]*#|grep' "$0" | grep -nE '(docker|compose)[[:space:]]+([a-z-]+[[:space:]]+)*(prune|down|volume|exec)\b|mongosh|redis-cli|prisma' >&2; then
    echo "AVEUGLE: une commande de données, de purge ou d'exec est apparue." >&2
    echecs=$((echecs + 1))
  fi
  # Toute bascule est ciblée : jamais un `up` qui toucherait les dépendances.
  if grep -vE '^[[:space:]]*#|grep' "$0" | grep -E 'compose up' | grep -vq -- '--no-deps'; then
    echo "AVEUGLE: un \`compose up\` sans --no-deps." >&2
    echecs=$((echecs + 1))
  fi

  [ "$echecs" -eq 0 ] && echo "self-test: toutes les vérifications passées." && return 0
  echo "self-test: $echecs échec(s)." >&2
  return 1
}

# Valide la grammaire seulement (utilisé par le self-test, sans Docker).
valider() {
  local action="${1:-}"; shift || true
  case "$action" in
    status) [ "$#" -eq 0 ] || refus "status ne prend pas d'argument" ;;
    plan|promote) lire_cibles "$@" ;;
    rollback) lire_services "$@" ;;
    *) refus "action inconnue « $action »" ;;
  esac
}

main() {
  [ "${1:-}" = "--self-test" ] && { self_test; return $?; }
  [ "${1:-}" = "__valider" ] && { shift; valider "$@"; return $?; }

  local -a mots
  local demande="${SSH_ORIGINAL_COMMAND-$*}"
  [ "${#demande}" -le 1024 ] || refus "demande trop longue"
  read -r -a mots <<< "$demande"
  local action="${mots[0]:-}"
  local run=""
  # `run=<id>` (numéro du run GitHub) est accepté en DERNIER mot, pour l'historique.
  if [ "${#mots[@]}" -gt 1 ] && [[ "${mots[-1]}" =~ ^run=[0-9]{1,20}$ ]]; then
    run="${mots[-1]#run=}"
    unset 'mots[-1]'
  fi

  if [ "$action" = "init" ] && [ -n "${SSH_ORIGINAL_COMMAND+x}" ]; then
    refus "init se lance en root sur l'hôte, jamais par la clé de CI"
  fi

  [ "$action" = "init" ] || valider "${mots[@]}"

  mkdir -p "$STATE_DIR" && chmod 0700 "$STATE_DIR"
  exec 9>"$LOCK_FILE"
  flock -w 600 9 || refus "une autre promotion est en cours"
  contexte_compose

  case "$action" in
    status) etat ;;
    init) init ;;
    plan) planifier ;;
    promote)
      surcharge_lue || refus "la surcharge n'est pas lue par compose — lancer init (voir note)"
      promouvoir "$run" ;;
    rollback)
      surcharge_lue || refus "la surcharge n'est pas lue par compose — lancer init (voir note)"
      local svc rc_total=0
      for svc in "${mots[@]:1}"; do revenir "$svc" || rc_total=$?; done
      return "$rc_total" ;;
  esac
}

main "$@"
