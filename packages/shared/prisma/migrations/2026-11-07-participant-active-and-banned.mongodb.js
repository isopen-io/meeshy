/**
 * Migration MongoDB — aligne les lignes `Participant` ACTIVES ET BANNIES sur ce
 * que le bannissement écrit aujourd'hui (#16690).
 *
 * ## L'anomalie
 *
 * Une ligne `isActive: true` **et** `bannedAt` non nul ne peut plus être
 * PRODUITE : `resolveBanWrite`
 * (`services/gateway/src/services/conversations/conversationBanState.ts`) écrit
 * `isActive: false, leftAt: bannedAt` quand il bannit un membre actif, et seul
 * `bannedAt` quand la ligne était déjà inactive. Elle a pu l'être : bannir
 * pendant l'inactivité n'écrit que `bannedAt`, puis `restore-for-me` rallumait
 * `isActive` AVANT #10436 — qui a fermé ce producteur sans reprendre les lignes
 * existantes. Le dépôt NOMME cette conséquence
 * (`services/gateway/src/routes/user-deletions.ts`) :
 *
 *   « Rallumer `isActive` ici rendait la ligne active ET bannie, lue comme
 *     vivante par toute lecture `userId + isActive: true` (liste, envoi, push) »
 *
 * #16690 a resserré les AUDIENCES de diffusion sur `PARTICIPATION_VIVANTE`, si
 * bien qu'une telle ligne ne reçoit plus ni contenu, ni pastille, ni accusé.
 * Ce script ferme l'autre moitié : les lignes elles-mêmes, pour que toute
 * lecture — y compris celles qui n'interrogent que `isActive` — dise la même
 * chose de ces membres.
 *
 * ## Le remède, et pourquoi c'est celui-là
 *
 *   `isActive: true` ET `bannedAt` ∉ {null, absent}
 *     ⇒ `isActive: false`
 *     ⇒ `leftAt: bannedAt` SI `leftAt` est nul ou absent
 *
 * C'est exactement ce que `resolveBanWrite` aurait écrit en bannissant un
 * membre actif. On ne lève PAS le bannissement : effacer `bannedAt` rendrait
 * l'accès à quelqu'un qu'un modérateur a exclu — une réparation ne décide pas à
 * la place d'une décision de modération. Et `leftAt` n'est écrit QUE s'il
 * manque : quand il porte déjà une date, elle enregistre un départ réel, et
 * l'égalité `leftAt === bannedAt` est lue comme « le bannissement a mis fin à
 * l'appartenance » (cf. le doc-comment de `conversationBanState.ts`) — l'écraser
 * réécrirait l'histoire de la ligne.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : compte ce qui serait réparé, n'écrit rien. `APPLY=1`
 *   écrit.
 * - Lots bornés (`BATCH_SIZE`, 500 par défaut, 5000 au plus), parcourus par
 *   `_id` croissant.
 * - Idempotent : une ligne réparée n'est plus active, donc ne reparaît pas dans
 *   le filtre ; une seconde exécution en trouve 0.
 * - Aucun champ `Int` n'est écrit (pas de piège `Long`) ; les compteurs passent
 *   par `Number()` avant toute addition, pour qu'un résultat de pilote ne se
 *   CONCATÈNE pas en chaîne.
 * - Le journal compte et cite des `_id` ; jamais un nom, jamais un contenu.
 *
 * ⚠️ **Une migration de données de PRODUCTION attend le feu vert du porteur**
 * (directive 2026-10-03, #9223), chacune précédée d'une sauvegarde VÉRIFIÉE.
 * Staging d'abord, à blanc puis pour de vrai.
 *
 *   F=packages/shared/prisma/migrations/2026-11-07-participant-active-and-banned.mongodb.js
 *   B=/opt/meeshy/backups/2026-11-07-participant-active-and-banned
 *
 *   # staging — sauvegarde, à blanc, puis application
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump --db meeshy --collection Participant --archive --gzip > $B/staging-Participant.archive.gz"
 *   ssh root@meeshy.me "docker exec -i meeshy-database-staging mongosh meeshy --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet" < $F
 *
 *   # production — APRÈS feu vert du porteur
 *   ssh root@meeshy.me "docker exec meeshy-database mongodump --db meeshy --collection Participant --archive --gzip > $B/prod-Participant.archive.gz"
 *   ssh root@meeshy.me "docker exec -i meeshy-database mongosh meeshy --quiet" < $F
 *   ssh root@meeshy.me "docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet" < $F
 */

const APPLY = process.env.APPLY === '1';
const BATCH_SIZE = Math.min(Number(process.env.BATCH_SIZE || 500) || 500, 5000);

/**
 * Le filtre dit l'anomalie, et il dit les DEUX états de « pas de ban » qu'il
 * faut exclure : `null` ET absent. En MongoDB brut, `{ bannedAt: { $ne: null } }`
 * exclut déjà les deux (une clé absente est `null` pour `$ne`) — l'écrire par
 * `$exists` + `$ne` le rend EXPLICITE, parce que c'est exactement la confusion
 * que ce dépôt a payée quatre fois (`services/gateway/src/utils/prisma-unset.ts`).
 */
const FILTER = {
  isActive: true,
  bannedAt: { $exists: true, $ne: null },
};

function main() {
  const coll = db.getCollection('Participant');
  const total = coll.countDocuments(FILTER);
  print(`[active-and-banned] lignes à réparer : ${total} — mode ${APPLY ? 'APPLY' : 'À BLANC'}`);
  if (total === 0) {
    print('[active-and-banned] rien à faire.');
    return;
  }

  let lastId = null;
  let seen = 0;
  let deactivated = 0;
  let departuresDated = 0;

  for (;;) {
    const query = lastId === null ? FILTER : Object.assign({}, FILTER, { _id: { $gt: lastId } });
    const batch = coll.find(query).sort({ _id: 1 }).limit(BATCH_SIZE).toArray();
    if (batch.length === 0) break;

    for (const row of batch) {
      lastId = row._id;
      seen = Number(seen) + 1;
      // `leftAt` n'est daté que s'il manque : une date déjà posée enregistre un
      // départ réel, et l'écraser réécrirait l'histoire de la ligne.
      const needsLeftAt = row.leftAt === null || row.leftAt === undefined;
      if (!APPLY) {
        deactivated = Number(deactivated) + 1;
        if (needsLeftAt) departuresDated = Number(departuresDated) + 1;
        continue;
      }
      const update = needsLeftAt
        ? { $set: { isActive: false, leftAt: row.bannedAt } }
        : { $set: { isActive: false } };
      const result = coll.updateOne({ _id: row._id, isActive: true }, update);
      const changed = Number(result.modifiedCount || 0);
      deactivated = Number(deactivated) + changed;
      if (changed > 0 && needsLeftAt) departuresDated = Number(departuresDated) + 1;
    }

    print(`[active-and-banned] parcourues ${seen}/${total}…`);
  }

  print(
    `[active-and-banned] terminé — parcourues ${seen}, désactivées ${deactivated}, ` +
      `départs datés ${departuresDated}${APPLY ? '' : ' (à blanc : rien écrit)'}`
  );
  if (APPLY) {
    const left = coll.countDocuments(FILTER);
    print(`[active-and-banned] restant après application : ${left} (attendu : 0)`);
  }
}

main();
