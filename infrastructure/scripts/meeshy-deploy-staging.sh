#!/bin/bash
# =============================================================================
# MEESHY STAGING — script de RELEASE des images, exécuté SUR L'HÔTE FINAL
# =============================================================================
# Ce fichier est la source de vérité de ce que la CI déclenche sur
# `staging.meeshy.me`. Il s'installe en `/usr/local/bin/meeshy-deploy-staging.sh`
# et la clé de déploiement y est contrainte dans `~/.ssh/authorized_keys` :
#
#   command="/usr/local/bin/meeshy-deploy-staging.sh",restrict ssh-ed25519 AAAA...
#
# Quoi que la CI envoie, c'est CE script qui s'exécute ; la demande lui arrive
# en DONNÉE (`$SSH_ORIGINAL_COMMAND`) et n'est jamais évaluée par un shell —
# elle est validée contre la liste blanche ci-dessous. Une clé de CI qui
# ouvrirait un shell root donnerait, en cas de fuite du secret GitHub, la
# machine entière ; celle-ci ne donne que le droit de redéployer des services
# déjà déclarés.
#
# INSTALLATION / MISE À JOUR (session ayant l'accès `root@meeshy.me`) :
#
#   scp infrastructure/scripts/meeshy-deploy-staging.sh \
#       root@meeshy.me:/tmp/meeshy-deploy-staging.sh
#   ssh root@meeshy.me '
#     diff /usr/local/bin/meeshy-deploy-staging.sh /tmp/meeshy-deploy-staging.sh
#     cp -a /usr/local/bin/meeshy-deploy-staging.sh \
#           /usr/local/bin/meeshy-deploy-staging.sh.bak-$(date +%F) 2>/dev/null || true
#     install -m 0755 /tmp/meeshy-deploy-staging.sh /usr/local/bin/meeshy-deploy-staging.sh
#     /usr/local/bin/meeshy-deploy-staging.sh --self-test
#   '
#
# LE DÉFAUT QU'IL FERME (#6556)
#
# L'hôte accumulait une image par service ET PAR VERSION à chaque poussée sur
# `dev`, et rien ne les retirait : le 2026-09-14, `docker pull` a rendu
# `no space left on device`, le déploiement s'est arrêté là et staging a
# continué de servir la version précédente sans que rien ne le dise.
#
# La purge se fait donc AVANT le `pull` — après, elle arrive trop tard : c'est
# l'écriture des couches qui manque de place. Et elle est NON INTERACTIVE :
# `docker image prune` demande `y/N` et, sans terminal, une purge sans `-f`
# lirait une entrée vide, comprendrait « N » et ne retirerait rien — la panne
# de disque reviendrait avec, en prime, la conviction d'avoir purgé.
# =============================================================================

set -uo pipefail

STAGING_DIR="${MEESHY_STAGING_DIR:-/opt/meeshy/staging}"

# ÉNUMÉRÉE, jamais un motif : un service inconnu doit être REFUSÉ, pas deviné.
# `database-staging`, `redis-staging` et les autres porteuses de données n'y
# sont pas — la CI ne construit pas leurs images et ne doit pas pouvoir les
# recréer.
SERVICES_AUTORISES="frontend-staging gateway-staging translator-staging agent-staging static-files-staging"

# Fenêtre de rétention : on garde de quoi revenir en arrière d'une semaine.
RETENTION="${MEESHY_PRUNE_RETENTION:-168h}"
# Au-delà de ce taux d'occupation, la fenêtre se resserre : garder une semaine
# d'images ne sert à rien si le `pull` qui suit ne rentre pas.
SEUIL_DISQUE_PCT="${MEESHY_PRUNE_DISK_THRESHOLD:-80}"
RETENTION_SOUS_PRESSION="${MEESHY_PRUNE_RETENTION_PRESSURE:-24h}"

RC_REFUS=64

journal() { echo "[$(date -u +%FT%TZ)] $*"; }

occupation_disque() {
  df --output=pcent /var/lib/docker 2>/dev/null | tail -1 | tr -dc '0-9' || echo 0
}

# La liste blanche est le SEUL filtre : tout ce qui n'y figure pas est refusé,
# y compris ce qui ressemble à un nom de service. Aucune expansion de shell
# n'a lieu ici — les noms demandés ne sont jamais évalués, seulement comparés.
services_valides() {
  local demande="$1" service
  local retenus=""
  for service in $demande; do
    case " $SERVICES_AUTORISES " in
      *" $service "*) retenus="$retenus $service" ;;
      *) journal "REFUS: service non déclaré « $service »" >&2; return "$RC_REFUS" ;;
    esac
  done
  [ -n "${retenus// /}" ] || { journal "REFUS: aucun service demandé" >&2; return "$RC_REFUS"; }
  echo "${retenus# }"
}

# La purge du disque, non interactive de bout en bout.
#
# 1. Les couches PENDANTES (`<none>`) partent toujours : aucune image nommée
#    ne les référence, aucun retour en arrière n'en dépend.
# 2. Les images NON UTILISÉES par un conteneur partent au-delà de la fenêtre
#    de rétention. `image prune -a` ne touche jamais une image portée par un
#    conteneur existant : la version SERVIE et celle qu'on vient de recréer
#    survivent, quelle que soit la fenêtre.
# 3. Les volumes ne sont JAMAIS purgés ici. `system prune --volumes`
#    retirerait les volumes orphelins — dont ceux qui portent des données de
#    staging qu'on croit anonymes jusqu'au jour où elles manquent.
purger_les_images() {
  local avant apres fenetre="$RETENTION"
  avant="$(occupation_disque)"
  journal "purge: /var/lib/docker à ${avant}% avant"

  if [ "${avant:-0}" -ge "$SEUIL_DISQUE_PCT" ]; then
    fenetre="$RETENTION_SOUS_PRESSION"
    journal "purge: disque au-dessus de ${SEUIL_DISQUE_PCT}% — fenêtre resserrée à $fenetre"
  fi

  docker image prune -f || true
  docker image prune -af --filter "until=$fenetre" || true
  docker builder prune -f || true

  apres="$(occupation_disque)"
  journal "purge: /var/lib/docker à ${apres}% après"
}

deployer() {
  local services="$1"

  cd "$STAGING_DIR" || { journal "ERREUR: $STAGING_DIR introuvable" >&2; return 1; }

  purger_les_images

  journal "pull: $services"
  docker compose pull $services || return 1

  journal "up: $services"
  docker compose up -d --no-deps $services || return 1

  sleep 15

  # L'appelant juge sur ce que la machine MONTRE (il y cherche `restarting` /
  # `exited`), jamais sur le code de retour d'`up -d`, qui rend 0 dès que
  # Docker a accepté la commande.
  docker compose ps $services
}

self_test() {
  local echecs=0 sortie rc

  sortie="$(services_valides "gateway-staging frontend-staging")"; rc=$?
  if [ "$rc" -ne 0 ] || [ "$sortie" != "gateway-staging frontend-staging" ]; then
    echo "AVEUGLE: deux services déclarés ont été refusés (rc=$rc, sortie=« $sortie »)." >&2
    echecs=$((echecs + 1))
  fi

  for interdit in "database-staging" "frontend-staging; id" "cat /etc/shadow" ""; do
    services_valides "$interdit" >/dev/null 2>&1; rc=$?
    if [ "$rc" -ne "$RC_REFUS" ]; then
      echo "AVEUGLE: « $interdit » n'a pas été refusé en rc=$RC_REFUS (rc=$rc)." >&2
      echecs=$((echecs + 1))
    fi
  done

  # La purge doit rester non interactive : une commande sans `-f` attendrait
  # un `y` que personne ne tape.
  if grep -nE '^[[:space:]]*docker [a-z]+ prune' "$0" | grep -vqE '(^|[[:space:]])(-[a-z]*f[a-z]*|--force)([[:space:]]|$)'; then
    echo "AVEUGLE: une purge de ce script attend une confirmation y/N." >&2
    echecs=$((echecs + 1))
  fi

  # La purge précède le pull : après, elle arrive trop tard.
  if [ "$(grep -n 'purger_les_images$' "$0" | tail -1 | cut -d: -f1)" -gt \
       "$(grep -n 'docker compose pull' "$0" | head -1 | cut -d: -f1)" ]; then
    echo "AVEUGLE: la purge ne précède pas le pull." >&2
    echecs=$((echecs + 1))
  fi

  [ "$echecs" -eq 0 ] && echo "self-test: 6/6 vérifications passées." && return 0
  echo "self-test: $echecs échec(s)." >&2
  return 1
}

main() {
  [ "${1:-}" = "--self-test" ] && { self_test; return $?; }

  local demande="${SSH_ORIGINAL_COMMAND:-$*}"
  local services
  services="$(services_valides "$demande")" || return $?

  deployer "$services"
}

main "$@"
