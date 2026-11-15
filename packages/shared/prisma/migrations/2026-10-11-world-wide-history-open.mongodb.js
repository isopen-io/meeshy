/**
 * Migration MongoDB — World Wide ouvre l'historique à ses entrants (#10099,
 * décision porteur du 2026-10-11 : « par défaut dans World Wide on a
 * canViewHistory: true »).
 *
 * Le lien `mshy_world` a été semé avec `allowViewHistory: false`, et chaque
 * entrée l'a GRAVÉ dans `Participant.permissions.canViewHistory`
 * (`link-admission.ts`) : un invité entrait dans un salon vide de tout
 * historique. Le seed crée désormais le lien ouvert, mais ne réécrit JAMAIS un
 * lien ni une participation existants — sans quoi il rouvrirait, à chaque
 * redémarrage, un historique qu'un administrateur ou un hôte aurait coupé.
 * Ce script fait le réalignement UNE fois :
 *
 *   ConversationShareLink `mshy_world` de la conversation `world`,
 *     `allowViewHistory: false`           ⇒  `$set allowViewHistory: true`
 *   Participant de la conversation `world`,
 *     `permissions.canViewHistory: false`
 *     ET aucune restriction d'hôte séparée
 *     (`anonymousSession.rights.canViewHistory` absent)
 *                                          ⇒  `$set permissions.canViewHistory: true`
 *
 * Rien d'autre n'est lu ni écrit : aucune autre conversation, aucun autre lien,
 * aucun droit d'envoi, aucune suppression. Une participation qui ne porte pas
 * le champ suit déjà le lien (`historyFloor.ts`) et n'est pas touchée.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : compte ce qui serait ouvert, n'écrit rien. `APPLY=1` écrit.
 * - Idempotent : une seconde exécution n'a plus rien à ouvrir (attendu : 0).
 * - Comptes avant/après journalisés ; compteurs passés par `Number()` (pas de
 *   concaténation d'un `Long`).
 *
 * Exécution — staging d'abord, production ensuite (feu vert porteur :
 * https://github.com/isopen-io/meeshy/issues/10057#issuecomment-6106151931),
 * chacune à blanc puis pour de vrai, après sauvegarde des deux collections
 * (depuis la racine du dépôt) :
 *
 *   F=packages/shared/prisma/migrations/2026-10-11-world-wide-history-open.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-11-world-wide-history-open
 *
 *   # staging
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database-staging mongodump --db meeshy --collection ConversationShareLink --archive --gzip > $B/staging-ConversationShareLink.archive.gz && docker exec meeshy-database-staging mongodump --db meeshy --collection Participant --archive --gzip > $B/staging-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database-staging mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database-staging mongosh meeshy --quiet' < $F   # attendu : 0 à ouvrir
 *
 *   # production
 *   ssh root@meeshy.me "mkdir -p $B && docker exec meeshy-database mongodump --db meeshy --collection ConversationShareLink --archive --gzip > $B/production-ConversationShareLink.archive.gz && docker exec meeshy-database mongodump --db meeshy --collection Participant --archive --gzip > $B/production-Participant.archive.gz"
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i -e APPLY=1 meeshy-database mongosh meeshy --quiet' < $F
 *   ssh root@meeshy.me 'docker exec -i meeshy-database mongosh meeshy --quiet' < $F           # attendu : 0 à ouvrir
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/world-wide-history-open-migration.test.ts`.
 */

const WORLD_CONVERSATION_IDENTIFIER = 'world';
const WORLD_SHARE_LINK_IDENTIFIER = 'mshy_world';

function closedEntrantsFilter(conversationId) {
  return {
    conversationId,
    'permissions.canViewHistory': false,
    'anonymousSession.rights.canViewHistory': { $exists: false },
  };
}

function runWorldWideHistoryOpen(database, options) {
  const report = { world: false, linkWasClosed: false, linkOpened: false, before: 0, opened: 0, after: 0, hostRestricted: 0 };

  const world = database.getCollection('Conversation').findOne({ identifier: WORLD_CONVERSATION_IDENTIFIER }, { _id: 1 });
  if (!world) return report;
  report.world = true;

  const links = database.getCollection('ConversationShareLink');
  const linkFilter = { identifier: WORLD_SHARE_LINK_IDENTIFIER, conversationId: world._id, allowViewHistory: false };
  const closedLink = links.findOne(linkFilter, { _id: 1 });
  report.linkWasClosed = closedLink !== null;
  if (closedLink && options.apply) {
    const result = links.updateOne({ _id: closedLink._id, allowViewHistory: false }, { $set: { allowViewHistory: true } });
    report.linkOpened = Number(result.modifiedCount) === 1;
  }

  const participants = database.getCollection('Participant');
  const filter = closedEntrantsFilter(world._id);
  report.before = Number(participants.countDocuments(filter));
  report.hostRestricted = Number(participants.countDocuments({
    conversationId: world._id,
    'permissions.canViewHistory': false,
    'anonymousSession.rights.canViewHistory': { $exists: true },
  }));
  if (options.apply && report.before > 0) {
    const result = participants.updateMany(filter, { $set: { 'permissions.canViewHistory': true } });
    report.opened = Number(result.modifiedCount);
  }
  report.after = Number(participants.countDocuments(filter));

  return report;
}

function printWorldWideHistoryReport(report, options) {
  print(options.apply
    ? '===== Historique de World Wide (#10099) — ÉCRITURE ====='
    : '===== Historique de World Wide (#10099) — À BLANC, rien n’est écrit =====');
  if (!report.world) {
    print('World Wide absente : rien à faire.');
    return;
  }
  print(`Lien ${WORLD_SHARE_LINK_IDENTIFIER} fermé à l'historique : ${report.linkWasClosed ? 'oui' : 'non'}`);
  print(`Lien ouvert : ${report.linkOpened ? 'oui' : 'non'}`);
  print(`Participations à ouvrir (avant) : ${report.before}`);
  print(`Participations ouvertes : ${report.opened}`);
  print(`Participations à ouvrir (après) : ${report.after}`);
  print(`Laissées à la restriction d'un hôte : ${report.hostRestricted}`);
  if (!options.apply) print('Relancer avec APPLY=1 pour écrire.');
}

const worldWideHistoryOptions = { apply: process.env.APPLY === '1' };
const worldWideHistoryReport = runWorldWideHistoryOpen(db, worldWideHistoryOptions);
printWorldWideHistoryReport(worldWideHistoryReport, worldWideHistoryOptions);
