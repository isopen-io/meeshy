#!/usr/bin/env bash
# =============================================================================
# Met à jour la base de géolocalisation LOCALE de la passerelle (#9609).
#
# DB-IP Lite « IP to City » (format MMDB), licence CC-BY 4.0 :
#   https://db-ip.com/db/download/ip-to-city-lite
# Attribution exigée partout où un lieu déduit de l'adresse est montré :
#   « IP Geolocation by DB-IP » (lien https://db-ip.com) — la passerelle la sert
#   avec chaque liste de sessions (`GEOLOCATION_ATTRIBUTION`).
#
# La base n'est JAMAIS dans l'image ni dans le dépôt : elle vit sur l'hôte, dans
# GEOIP_DIR, montée en lecture seule dans les conteneurs de passerelle
# (production ET staging) sous /app/geoip. La passerelle relit la date du
# fichier au plus une fois par heure : aucun redémarrage n'est nécessaire.
#
# Ce que fait le script, et rien d'autre :
#   1. télécharge l'édition du mois (repli : celle du mois précédent, DB-IP la
#      publie dans les premiers jours) ;
#   2. vérifie l'archive gzip, la taille, et le marqueur de métadonnées MMDB ;
#   3. remplace le fichier ATOMIQUEMENT (mv sur le même système de fichiers) —
#      un fichier à moitié écrit n'est jamais lu ; en cas d'échec, l'ancien reste.
#
# Installation sur l'hôte (une fois, root@meeshy.me) :
#   install -m 0755 infrastructure/scripts/geoip-update-dbip.sh /usr/local/bin/meeshy-geoip-update
#   mkdir -p /opt/meeshy/geoip && /usr/local/bin/meeshy-geoip-update
#   echo '17 4 3 * * root /usr/local/bin/meeshy-geoip-update >> /var/log/meeshy-geoip.log 2>&1' > /etc/cron.d/meeshy-geoip
#
# Contrôle : `curl -s https://gate.meeshy.me/health | jq .services.geoip` → { "status": "loaded" }
# =============================================================================
set -euo pipefail

GEOIP_DIR="${GEOIP_DIR:-/opt/meeshy/geoip}"
TARGET_NAME="${GEOIP_TARGET_NAME:-dbip-city-lite.mmdb}"
EDITION="${GEOIP_EDITION:-city}"
MIN_BYTES="${GEOIP_MIN_BYTES:-10000000}"
BASE_URL="https://download.db-ip.com/free"

log() { printf '%s [geoip] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

month_of() {
  # $1 : 0 = mois courant, 1 = mois précédent (GNU date ou BSD date)
  if date -u -d "now" +%Y-%m >/dev/null 2>&1; then
    date -u -d "$(date -u +%Y-%m-15) -$1 month" +%Y-%m
  else
    date -u -v-"$1"m +%Y-%m
  fi
}

mkdir -p "$GEOIP_DIR"
WORK="$(mktemp -d "$GEOIP_DIR/.update.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

downloaded=""
for back in 0 1; do
  month="$(month_of "$back")"
  url="$BASE_URL/dbip-${EDITION}-lite-${month}.mmdb.gz"
  log "téléchargement de $url"
  if curl -fsSL --retry 3 --max-time 600 -o "$WORK/db.mmdb.gz" "$url"; then
    downloaded="$month"
    break
  fi
  log "édition $month indisponible"
done

if [ -z "$downloaded" ]; then
  log "ÉCHEC : aucune édition téléchargée — la base en place est conservée"
  exit 1
fi

gzip -t "$WORK/db.mmdb.gz"
gunzip -c "$WORK/db.mmdb.gz" > "$WORK/db.mmdb"

size="$(wc -c < "$WORK/db.mmdb" | tr -d ' ')"
if [ "$size" -lt "$MIN_BYTES" ]; then
  log "ÉCHEC : fichier trop petit ($size octets < $MIN_BYTES) — la base en place est conservée"
  exit 1
fi

# Le marqueur de métadonnées MMDB (\xAB\xCD\xEFMaxMind.com) vit dans les
# derniers 128 Kio du fichier : son absence signe un fichier qui n'est pas une base.
if ! tail -c 131072 "$WORK/db.mmdb" | LC_ALL=C grep -q 'MaxMind.com'; then
  log "ÉCHEC : marqueur MMDB absent — la base en place est conservée"
  exit 1
fi

chmod 0644 "$WORK/db.mmdb"
mv -f "$WORK/db.mmdb" "$GEOIP_DIR/$TARGET_NAME"
printf '%s\n' "$downloaded" > "$GEOIP_DIR/$TARGET_NAME.edition"
log "base $EDITION-lite $downloaded installée ($size octets) dans $GEOIP_DIR/$TARGET_NAME"
