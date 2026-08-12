#!/bin/bash

###############################################################################
# Meeshy — Rapport de fiabilité des appels (production)
#
# Objectif produit : appels de plusieurs heures, bonne qualité.
# Agrège les CallSession + la télémétrie CallParticipant.analytics persistée
# par le gateway (payloads `call:analytics`, snapshots in_progress 60 s +
# émission finale) et les signaux GC des logs gateway.
#
# Usage :
#   ./scripts/call-reliability-report.sh [heures]   # défaut : 24
#
# Prérequis : accès ssh root@meeshy.me (prod), containers meeshy-database /
# meeshy-gateway.
###############################################################################

set -euo pipefail

HOURS="${1:-24}"
SSH_HOST="${MEESHY_PROD_HOST:-root@meeshy.me}"

echo "═══ Fiabilité appels Meeshy — dernières ${HOURS}h ($(date -u '+%Y-%m-%d %H:%M UTC')) ═══"

ssh "$SSH_HOST" "docker exec meeshy-database mongosh meeshy --quiet --eval '
var since = new Date(Date.now() - ${HOURS} * 3600 * 1000);

print(\"\n── Sessions par statut ──\");
db.CallSession.aggregate([
  { \$match: { startedAt: { \$gte: since } } },
  { \$group: { _id: \"\$status\", n: { \$sum: 1 }, avgDur: { \$avg: \"\$duration\" }, maxDur: { \$max: \"\$duration\" } } },
  { \$sort: { n: -1 } }
]).forEach(g => print(
  g._id.padEnd(12),
  \"n=\" + g.n,
  \"durée moy=\" + Math.round(g.avgDur || 0) + \"s\",
  \"max=\" + Math.round(g.maxDur || 0) + \"s\"
));

print(\"\n── Appels longs (objectif multi-heures) ──\");
[[1800, \">30 min\"], [3600, \">1 h\"], [7200, \">2 h\"]].forEach(b => {
  var n = db.CallSession.countDocuments({ startedAt: { \$gte: since }, duration: { \$gte: b[0] } });
  print(b[1].padEnd(8), n);
});

print(\"\n── Fins anormales ──\");
[\"garbageCollected\", \"heartbeatTimeout\", \"failed\", \"connectionLost\"].forEach(r => {
  var n = db.CallSession.countDocuments({ startedAt: { \$gte: since }, endReason: r });
  if (n > 0) print(\"⚠️ \", r.padEnd(18), n); else print(\"   \", r.padEnd(18), 0);
});

print(\"\n── Sessions encore ouvertes ──\");
db.CallSession.find(
  { status: { \$in: [\"initiated\", \"ringing\", \"connecting\", \"active\", \"reconnecting\"] } },
  { status: 1, startedAt: 1 }
).forEach(s => print(\"  \", s.status, s._id.toString(), s.startedAt.toISOString()));
print(\"  total:\", db.CallSession.countDocuments({ status: { \$in: [\"initiated\", \"ringing\", \"connecting\", \"active\", \"reconnecting\"] } }));

print(\"\n── Participants accrochés (leftAt null sur session terminée — baseline 0 depuis backfill 2026-07-04) ──\");
var hung = db.CallParticipant.aggregate([
  { \$match: { leftAt: null } },
  { \$lookup: { from: \"CallSession\", localField: \"callSessionId\", foreignField: \"_id\", as: \"s\" } },
  { \$unwind: \"\$s\" },
  { \$match: { \"s.status\": { \$in: [\"ended\", \"missed\"] } } },
  { \$project: { callSessionId: 1, endedAt: \"\$s.endedAt\" } }
]).toArray();
if (hung.length > 0) hung.forEach(h => print(\"⚠️  participant\", h._id.toString(), \"call\", h.callSessionId.toString(), \"endedAt\", h.endedAt ? h.endedAt.toISOString() : \"?\"));
print(hung.length > 0 ? \"⚠️  total: \" + hung.length : \"  total: 0\");

print(\"\n── Télémétrie client (CallParticipant.analytics) ──\");
var rows = db.CallParticipant.aggregate([
  { \$match: { analytics: { \$ne: null }, joinedAt: { \$gte: since } } },
  { \$project: { a: \"\$analytics\" } }
]).toArray();
print(\"rows:\", rows.length);
if (rows.length > 0) {
  var recon = rows.map(r => r.a.reconnectionCount || 0);
  var withRecon = recon.filter(n => n > 0).length;
  var poor = rows.map(r => (r.a.qualityDistribution || {}).poor || 0);
  var nego = rows.map(r => r.a.negotiationTimeMs).filter(n => typeof n === \"number\" && n >= 0).sort((x, y) => x - y);
  var inProgress = rows.filter(r => r.a.endReason === \"in_progress\").length;
  print(\"  reconnexions: total=\" + recon.reduce((s, n) => s + n, 0) + \" · appels avec ≥1 reconnexion: \" + withRecon + \"/\" + rows.length);
  print(\"  % temps poor moyen: \" + (100 * poor.reduce((s, n) => s + n, 0) / rows.length).toFixed(1) + \"%\");
  if (nego.length > 0) print(\"  negotiationTimeMs médian: \" + nego[Math.floor(nego.length / 2)] + \" ms (n=\" + nego.length + \")\");
  if (inProgress > 0) print(\"  ⚠️  rows restées in_progress (app tuée sans émission finale): \" + inProgress);
}
'"

echo ""
echo "── Signaux GC gateway (logs ${HOURS}h) ──"
ssh "$SSH_HOST" "docker logs meeshy-gateway --since ${HOURS}h 2>&1 | grep -cE 'Sparing long-running live call' | xargs echo '  Sparing (appel long sain épargné):'"
ssh "$SSH_HOST" "docker logs meeshy-gateway --since ${HOURS}h 2>&1 | grep -cE 'Force GC ENDED|Heartbeat timeout' | xargs echo '  Force GC / heartbeat timeout    :'"
ssh "$SSH_HOST" "docker logs meeshy-gateway --since ${HOURS}h 2>&1 | grep -cE 'call_cancel background push sent|call_answered_elsewhere' | xargs echo '  Pushes cancel/answered-elsewhere:'"
