#!/bin/bash
# Sauvegarde nocturne de la production Meeshy (#9665).
#
# Une sauvegarde contient :
#   base/      mongodump authentifié de la base, vérifié par une restauration témoin
#              dans un mongod isolé (sans réseau), comptes comparés collection par collection
#   volumes/   un instantané de chaque volume de médias ; les fichiers inchangés depuis
#              la sauvegarde précédente sont des liens durs et ne prennent aucune place
#   config/    docker-compose.yml, .env et secrets/ de la production
#
# Elle se construit dans un dossier « .en-cours-* » et ne prend son nom définitif,
# avec le témoin COMPLET, qu'une fois tout vérifié. La rotation ne compte et ne
# supprime que des sauvegardes COMPLÈTES : un échec ne fait jamais tomber une
# sauvegarde réussie.
#
# Ces sauvegardes sont sur le disque de la production : elles protègent d'une erreur
# ou d'une corruption, pas de la perte du serveur (copie hors site : #9232).
#
# Le VERDICT de chaque exécution, réussie ou non, est publié dans un dossier À PART
# (#9668) : STATUS_DIR/etat.json, en 644 dans un dossier 755. C'est le SEUL dossier
# monté (en lecture seule) dans la passerelle, qui l'affiche à l'administration et
# alerte chaque jour à 5 h ; elle ne voit jamais les sauvegardes. Il ne porte ni
# chemin d'hôte ni secret : horodatages, statut, raison d'un échec, et le contenu
# de la dernière sauvegarde réussie, qui survit aux échecs suivants.
set -euo pipefail
umask 077

COMPOSE_DIR="${COMPOSE_DIR:-/opt/meeshy/production}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/meeshy/backups/nightly}"
KEEP="${KEEP:-3}"
DB_CONTAINER="${DB_CONTAINER:-meeshy-database}"
DB_NAME="${DB_NAME:-meeshy}"
VOLUMES="${VOLUMES:-meeshy_gateway_uploads meeshy_gateway_sounds meeshy_frontend_uploads meeshy_redis_data}"
MIN_FREE_GB="${MIN_FREE_GB:-40}"
LOCK_FILE="${LOCK_FILE:-/run/meeshy-nightly-backup.lock}"
STATUS_DIR="${STATUS_DIR:-/opt/meeshy/backups/nightly-status}"

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Publie le verdict : STATUS_DIR/etat.json, écrit d'un coup (fichier temporaire puis
# renommage). Un échec garde la dernière réussite de l'ancien verdict : la passerelle
# doit pouvoir dire « dernière sauvegarde réussie il y a 30 h » le jour où tout échoue.
# $1 = ok | failed, $2 = raison d'un échec. Les chiffres d'un succès arrivent par
# l'environnement (VERIFICATION, ARCHIVE_BYTES, DURATION_SECONDS, VOLUME_SIZES).
write_status() {
  install -d -m 755 "$STATUS_DIR" && chmod 755 "$STATUS_DIR" || return 1
  STATUS="$1" REASON="${2:-}" python3 - "$STATUS_DIR/etat.json" <<'EOF'
import json, os, re, sys, tempfile
from datetime import datetime, timezone

target = sys.argv[1]
now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
status = os.environ["STATUS"]

def previous():
    try:
        with open(target) as f:
            old = json.load(f)
        at, last = old.get("lastSuccessAt"), old.get("lastSuccess")
        if isinstance(at, str) and (last is None or isinstance(last, dict)):
            return at, last
    except Exception:
        pass
    return None, None

if status == "ok":
    verification = dict(re.findall(r"(\w+)=([\d/]+)", os.environ.get("VERIFICATION", "")))
    volumes = []
    for pair in os.environ.get("VOLUME_SIZES", "").split():
        name, _, size = pair.partition("=")
        volumes.append({"name": name, "bytes": int(size)})
    last_at = now
    last = {
        "documents": int(verification.get("documents", 0)),
        "collections": int(verification.get("collections", 0)),
        "mismatches": int(verification.get("ecarts", 0)),
        "indexes": int(verification.get("index", "0/0").split("/")[-1]),
        "archiveBytes": int(os.environ.get("ARCHIVE_BYTES", "0")),
        "durationSeconds": int(os.environ.get("DURATION_SECONDS", "0")),
        "volumes": volumes,
    }
    reason = None
else:
    last_at, last = previous()
    reason = " ".join(os.environ.get("REASON", "").split())[:300] or None

verdict = {"generatedAt": now, "status": status, "reason": reason, "lastSuccessAt": last_at, "lastSuccess": last}
fd, tmp = tempfile.mkstemp(prefix=".etat-", dir=os.path.dirname(target))
with os.fdopen(fd, "w") as f:
    json.dump(verdict, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.chmod(tmp, 0o644)
os.replace(tmp, target)
EOF
}

FAILED_PUBLISHED=0
fail() {
  log "ÉCHEC : $*"
  write_status failed "$*" || log "verdict non publié dans $STATUS_DIR"
  FAILED_PUBLISHED=1
  {
    printf 'ÉCHEC %s %s\n' "$(date -u +%FT%TZ)" "$*"
    tail -n 40 "${WORK:-/dev/null}"/base/*.log "${WORK:-/dev/null}"/base/verification.txt 2>/dev/null || true
  } | tee "$BACKUP_ROOT/DERNIER-ETAT" || true
  exit 1
}

exec 9>"$LOCK_FILE"
# Une exécution concurrente ne publie rien : celle qui tient le verrou publiera.
flock -n 9 || { echo "une sauvegarde est déjà en cours" >&2; exit 1; }

STAMP="$(date -u +%Y%m%dT%H%MZ)"
WORK="$BACKUP_ROOT/.en-cours-$STAMP"
DEST="$BACKUP_ROOT/$STAMP"
RESTORE_CT="meeshy-backup-restore-check-$STAMP"
FAILED_LINE=""

cleanup() {
  docker rm -f "$RESTORE_CT" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
# Toute sortie en erreur publie un verdict, y compris celle qu'aucun `|| fail` ne
# nomme (set -e) et l'arrêt par systemd : la passerelle ne doit jamais lire un vert
# périmé. Seul le numéro de ligne est publié, jamais la commande, qui peut porter
# un argument sensible.
on_exit() {
  local rc=$?
  cleanup
  if (( rc != 0 && FAILED_PUBLISHED == 0 )); then
    write_status failed "arrêt inattendu (code $rc${FAILED_LINE:+, ligne $FAILED_LINE})" || true
    printf 'ÉCHEC %s arrêt inattendu (code %s)\n' "$(date -u +%FT%TZ)" "$rc" > "$BACKUP_ROOT/DERNIER-ETAT" 2>/dev/null || true
  fi
}
trap 'FAILED_LINE=$LINENO' ERR
trap on_exit EXIT
trap 'exit 143' TERM INT

[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || fail "KEEP doit être un entier ≥ 1"
install -d -m 700 "$BACKUP_ROOT"

free_gb="$(df --output=avail -BG "$BACKUP_ROOT" | tail -1 | tr -dc '0-9')"
(( free_gb >= MIN_FREE_GB )) || fail "espace libre ${free_gb} Go < ${MIN_FREE_GB} Go"

complete_backups() {
  local backup
  for backup in "$BACKUP_ROOT"/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]T[0-9][0-9][0-9][0-9]Z; do
    [[ -d "$backup" && -f "$backup/COMPLET" ]] && printf '%s\n' "$backup"
  done
  return 0
}
previous="$(complete_backups | tail -1)"

mkdir -p "$WORK/config" "$WORK/base" "$WORK/volumes"
T0="$(date +%s)"
log "sauvegarde $STAMP → $DEST (précédente : ${previous:-aucune})"

cp -p "$COMPOSE_DIR/docker-compose.yml" "$COMPOSE_DIR/.env" "$WORK/config/"
[[ -d "$COMPOSE_DIR/secrets" ]] && cp -a "$COMPOSE_DIR/secrets" "$WORK/config/secrets"

ops_password="$(grep -E '^MONGO_OPS_PASSWORD=' "$COMPOSE_DIR/.env" | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' || true)"
export P_OPS="$ops_password"
# Le mot de passe ne passe JAMAIS en argument de processus, lisible de tout compte de
# l'hôte par ps : mongosh s'authentifie depuis son environnement, mongodump depuis un
# fichier --config éphémère en 600 dans le conteneur, rempli par l'entrée standard.
AUTH_JS='if (process.env.P_OPS) { db.getSiblingDB("admin").auth("ops", process.env.P_OPS) };'
COUNT_JS='const d=db.getMongo().getDB("'"$DB_NAME"'"); d.getCollectionNames().sort().forEach(c=>print(c+"\t"+d.getCollection(c).countDocuments({})))'
INDEX_JS='const d=db.getMongo().getDB("'"$DB_NAME"'"); let n=0; d.getCollectionNames().forEach(c=>{n+=d.getCollection(c).getIndexes().length}); print(n)'
source_mongosh() { docker exec -e P_OPS -e JS="$AUTH_JS $1" "$DB_CONTAINER" sh -c 'mongosh --quiet --eval "$JS"'; }
mongodump_config() {
  [[ -z "$P_OPS" ]] || python3 -c 'import json, os; print("password: " + json.dumps(os.environ["P_OPS"]))'
}
# shellcheck disable=SC2016
DUMP_SH='umask 077; f=$(mktemp); cat > "$f"; set -- --db="$DB" --gzip --archive
[ -s "$f" ] && set -- --username ops --authenticationDatabase admin --config "$f" "$@"
mongodump "$@"; rc=$?; rm -f "$f"; exit $rc'

source_mongosh "$COUNT_JS" > "$WORK/base/comptes-avant.tsv" || fail "lecture des comptes de la base"
mongodump_config | docker exec -i -e DB="$DB_NAME" "$DB_CONTAINER" sh -c "$DUMP_SH" \
  > "$WORK/base/$DB_NAME.archive.gz" 2> "$WORK/base/mongodump.log" || fail "mongodump (voir base/mongodump.log)"
source_mongosh "$COUNT_JS" > "$WORK/base/comptes-apres.tsv" || fail "relecture des comptes de la base"
source_mongosh "$INDEX_JS" > "$WORK/base/index-source.txt" || fail "lecture des index de la base"

mongo_image="$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER")"
docker run -d --rm --name "$RESTORE_CT" --network none "$mongo_image" --bind_ip_all >/dev/null \
  || fail "démarrage du mongod témoin ($mongo_image)"
for _ in $(seq 1 60); do
  docker exec "$RESTORE_CT" mongosh --quiet --eval 'db.runCommand({ping:1}).ok' >/dev/null 2>&1 && break
  sleep 1
done
docker exec -i "$RESTORE_CT" mongorestore --gzip --archive \
  < "$WORK/base/$DB_NAME.archive.gz" 2> "$WORK/base/restauration.log" || fail "restauration témoin (voir base/restauration.log)"
docker exec "$RESTORE_CT" mongosh --quiet --eval "$COUNT_JS" > "$WORK/base/comptes-restaures.tsv"
docker exec "$RESTORE_CT" mongosh --quiet --eval "$INDEX_JS" > "$WORK/base/index-restaures.txt"
docker rm -f "$RESTORE_CT" >/dev/null

python3 - "$WORK/base" > "$WORK/base/verification.txt" <<'EOF' || fail "restauration témoin incohérente (voir base/verification.txt)"
import sys
d = sys.argv[1]
def load(name):
    with open(f"{d}/{name}") as f:
        return {k: int(v) for k, v in (l.rstrip("\n").split("\t") for l in f if "\t" in l)}
before, after, restored = load("comptes-avant.tsv"), load("comptes-apres.tsv"), load("comptes-restaures.tsv")
bad = [c for c in sorted(set(before) | set(after) | set(restored))
       if not min(before.get(c, -1), after.get(c, -1)) <= restored.get(c, -1) <= max(before.get(c, -1), after.get(c, -1))]
src_idx = int(open(f"{d}/index-source.txt").read().strip() or 0)
rst_idx = int(open(f"{d}/index-restaures.txt").read().strip() or 0)
docs = sum(restored.values())
print(f"collections={len(before)} restaurees={len(restored)} documents={docs} ecarts={len(bad)} index={src_idx}/{rst_idx}")
for c in bad:
    print(f"ECART {c} avant={before.get(c)} apres={after.get(c)} restaure={restored.get(c)}")
sys.exit(1 if bad or docs == 0 or "User" not in restored or rst_idx < src_idx else 0)
EOF

for volume in $VOLUMES; do
  source_dir="$(docker volume inspect -f '{{.Mountpoint}}' "$volume")" || fail "volume introuvable : $volume"
  link_dest=()
  [[ -n "$previous" && -d "$previous/volumes/$volume" ]] && link_dest=(--link-dest="$previous/volumes/$volume")
  rsync -a --delete "${link_dest[@]}" "$source_dir/" "$WORK/volumes/$volume/" || fail "copie du volume $volume"
done

(cd "$WORK" && sha256sum "base/$DB_NAME.archive.gz" > SHA256SUMS)
{
  echo "horodatage=$STAMP"
  echo "duree_secondes=$(( $(date +%s) - T0 ))"
  echo "base=$(head -1 "$WORK/base/verification.txt")"
  echo "archive=$(du -h "$WORK/base/$DB_NAME.archive.gz" | cut -f1)"
  for volume in $VOLUMES; do echo "volume $volume=$(du -sh "$WORK/volumes/$volume" | cut -f1)"; done
} > "$WORK/MANIFESTE"

mv "$WORK" "$DEST"
touch "$DEST/COMPLET"

volume_sizes=""
for volume in $VOLUMES; do volume_sizes+="$volume=$(( $(du -sk "$DEST/volumes/$volume" | cut -f1) * 1024 )) "; done
VERIFICATION="$(head -1 "$DEST/base/verification.txt")" \
ARCHIVE_BYTES="$(wc -c < "$DEST/base/$DB_NAME.archive.gz" | tr -d ' ')" \
DURATION_SECONDS="$(( $(date +%s) - T0 ))" \
VOLUME_SIZES="$volume_sizes" \
  write_status ok || log "verdict non publié dans $STATUS_DIR"

mapfile -t complete < <(complete_backups)
excess=$(( ${#complete[@]} - KEEP ))
for (( i = 0; i < excess; i++ )); do
  log "rotation : suppression de ${complete[$i]}"
  rm -rf -- "${complete[$i]}"
done
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.en-cours-*' -mmin +1440 -exec rm -rf -- {} +

printf 'OK %s %s\n' "$STAMP" "$(head -1 "$DEST/base/verification.txt")" > "$BACKUP_ROOT/DERNIER-ETAT"
log "terminé : $(tr '\n' ' ' < "$DEST/MANIFESTE")"
