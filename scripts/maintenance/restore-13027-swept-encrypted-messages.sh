#!/usr/bin/env bash
# #13027 — rend leur vie aux messages CHIFFRÉS que le ménage nocturne
# (`MaintenanceService.cleanupEmptyMessages`) a marqués supprimés parce que
# leur `content` clair était vide.
#
# Signature du ménage (et d'aucun autre écrivain de `deletedAt`) :
#   - chiffré : `isEncrypted: true` ou `encryptedContent` non nul ;
#   - `content` blanc ;
#   - `deletedAt` posé entre 02:00 et 03:00 UTC, plus de 24 h après `createdAt` ;
#   - aucune clé `translations` (une suppression par l'API la pose à null) ;
#   - aucune pièce jointe (le ménage épargnait ces messages).
#
# Se lance SUR le serveur, en root, depuis n'importe quel dossier :
#   ENV=staging    ./restore-13027-swept-encrypted-messages.sh            # DRY_RUN (défaut)
#   ENV=staging    DRY_RUN=0 ./restore-13027-swept-encrypted-messages.sh
#   ENV=production DRY_RUN=0 CONFIRM=13027-production ./restore-13027-swept-encrypted-messages.sh
# Sans copier de fichier sur le serveur :
#   ssh root@meeshy.me 'ENV=staging bash -s' < scripts/maintenance/restore-13027-swept-encrypted-messages.sh
# DB_NAME (défaut `meeshy`) ne sert qu'à éprouver le script sur une base jetable.
#
# Idempotent : une ligne restaurée n'a plus de `deletedAt` et ne porte donc plus
# la signature ; un second passage ne trouve rien. Avant toute écriture, les
# documents visés sont sauvegardés en EJSON canonique sur l'hôte, et le nombre
# de lignes sauvegardées est comparé au nombre de lignes visées.
#
# La PRODUCTION attend le feu vert du porteur (CLAUDE.md, directive 2026-10-03).
set -euo pipefail

ENV="${ENV:-staging}"
DRY_RUN="${DRY_RUN:-1}"
DB_NAME="${DB_NAME:-meeshy}"

case "$ENV" in
  staging)
    ENV_FILE=/opt/meeshy/staging/.env
    CONTAINER=meeshy-database-staging
    BACKUP_ROOT=/opt/meeshy/staging/backups
    ;;
  production)
    ENV_FILE=/opt/meeshy/production/.env
    CONTAINER=meeshy-database
    BACKUP_ROOT=/opt/meeshy/backups
    if [ "$DRY_RUN" != "1" ] && [ "${CONFIRM:-}" != "13027-production" ]; then
      echo "production : écriture refusée sans CONFIRM=13027-production (feu vert du porteur)" >&2
      exit 2
    fi
    ;;
  *)
    echo "ENV doit valoir staging ou production" >&2
    exit 2
    ;;
esac

M_USER=ops
M_PASS="$(grep -E '^MONGO_OPS_PASSWORD=' "$ENV_FILE" | tail -1 | cut -d= -f2-)"
export M_USER M_PASS DB_NAME
[ -n "$M_PASS" ] || { echo "MONGO_OPS_PASSWORD absent de $ENV_FILE" >&2; exit 2; }

read -r -d '' SIGNATURE_JS <<'JS' || true
const d = (() => {
  if (!db.getSiblingDB("admin").auth(process.env.M_USER, process.env.M_PASS)) throw new Error("auth refusée");
  return db.getSiblingDB(process.env.DB_NAME);
})();
const signature = {
  $and: [
    { $or: [{ isEncrypted: true }, { encryptedContent: { $nin: [null] } }] },
    { content: { $regex: /^\s*$/ } },
    { deletedAt: { $type: "date" } },
    { translations: { $exists: false } },
    { $expr: { $and: [
      { $eq: [{ $hour: "$deletedAt" }, 2] },
      { $gt: [{ $subtract: ["$deletedAt", "$createdAt"] }, 86400000] },
    ] } },
  ],
};
const marked = d.Message.find(signature, { _id: 1 }).toArray().map((m) => m._id);
const attached = new Set(d.MessageAttachment.distinct("messageId", { messageId: { $in: marked } }).map(String));
const targetIds = marked.filter((id) => !attached.has(String(id)));
JS

run_js() {
  docker exec -e M_USER -e M_PASS -e DB_NAME "$CONTAINER" mongosh --quiet --eval "$SIGNATURE_JS
$1"
}

echo "== #13027 restauration — ENV=$ENV DB=$DB_NAME DRY_RUN=$DRY_RUN"

run_js '
const rows = d.Message.find({ _id: { $in: targetIds } }, { conversationId: 1, encryptionMode: 1, createdAt: 1, deletedAt: 1 }).toArray();
print(EJSON.stringify({
  signature: marked.length,
  withAttachmentExcluded: marked.length - targetIds.length,
  toRestore: targetIds.length,
  conversations: [...new Set(rows.map((r) => String(r.conversationId)))].length,
  byMode: rows.reduce((a, r) => ({ ...a, [r.encryptionMode ?? "null"]: (a[r.encryptionMode ?? "null"] ?? 0) + 1 }), {}),
}, null, 1, { relaxed: true }));
'

if [ "$DRY_RUN" = "1" ]; then
  echo "DRY_RUN : rien n'est écrit. Relancer avec DRY_RUN=0 pour restaurer."
  exit 0
fi

# Chaque appel relit la signature : hors de la fenêtre du ménage, elle ne bouge pas.
if [ "$(date -u +%H)" = "02" ]; then
  echo "fenêtre du ménage nocturne (02:00-03:00 UTC) : relancer après 03:00" >&2
  exit 2
fi

EXPECTED="$(run_js 'print(targetIds.length);')"
if [ "$EXPECTED" = "0" ]; then
  echo "rien à restaurer."
  exit 0
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/13027-restore-$STAMP"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/messages-before.ejson"

run_js 'd.Message.find({ _id: { $in: targetIds } }).forEach((m) => print(EJSON.stringify(m, { relaxed: false })));' > "$BACKUP_FILE"

SAVED="$(grep -c . "$BACKUP_FILE" || true)"
echo "sauvegarde : $BACKUP_FILE ($SAVED lignes, $EXPECTED attendues)"
if [ "$SAVED" != "$EXPECTED" ]; then
  echo "sauvegarde incomplète : aucune écriture" >&2
  exit 3
fi
run_js '
const restored = d.Message.updateMany(
  { _id: { $in: targetIds }, deletedAt: { $type: "date" } },
  { $set: { deletedAt: null } }
);
const newest = d.Message.aggregate([
  { $match: { _id: { $in: targetIds }, deletedAt: null } },
  { $group: { _id: "$conversationId", at: { $max: "$createdAt" } } },
]).toArray();
const clocks = newest.reduce((n, c) => n + d.Conversation.updateOne({ _id: c._id }, { $max: { lastMessageAt: c.at } }).modifiedCount, 0);
print(EJSON.stringify({
  restored: restored.modifiedCount,
  conversationClocksAdvanced: clocks,
  conversationsToRecount: newest.map((c) => String(c._id)),
  stillMarked: d.Message.countDocuments({ $and: [signature, { _id: { $in: targetIds } }] }),
}, null, 1, { relaxed: true }));
'
echo "Les compteurs de conversation (ConversationMessageStats) se recalculent par la passerelle : conversationMessageStatsService.recomputeIfTracked pour chaque id ci-dessus."
