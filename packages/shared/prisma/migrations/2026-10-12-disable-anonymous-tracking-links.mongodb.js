/**
 * Migration MongoDB — les liens suivis fabriqués pour un invité anonyme cessent de rediriger (#10291).
 *
 * Suite de #10286 : un invité anonyme (participant `type: 'anonymous'`, ou sans
 * `userId`) ne reçoit plus de lien suivi, et `POST /tracking-links` refuse un
 * appelant sans compte. Restent les `TrackingLink` créés AVANT : un ancien
 * message écrit en `<url>` garde `m+<jeton>` dans son texte, et `/l/<jeton>`
 * redirige toujours — une adresse quelconque blanchie sous le domaine Meeshy.
 *
 * Un lien est PROUVÉ anonyme (et seuls ceux-là sont désactivés) quand :
 *   a. son `messageId` désigne un message d'expéditeur anonyme ;
 *   b. son jeton figure dans un message d'expéditeur anonyme
 *      (`m+<jeton>` dans `content`, ou `metadata.trackingLinks[].token`) ;
 *   c. son `createdBy` est l'id d'un participant anonyme (avant le 2026-08-08,
 *      `createdBy` recevait un `Participant.id`).
 *
 * Il est LAISSÉ actif quand :
 *   - son `createdBy` est un `User` existant : le lien d'un compte inscrit,
 *     qu'un invité a seulement cité ou réutilisé ;
 *   - un message d'un expéditeur NON anonyme de sa conversation le porte
 *     (`messageId`, `m+<jeton>` ou `metadata.trackingLinks`) : la réécriture de
 *     `<url>` RÉUTILISE le lien de la conversation, le couper casserait le
 *     message d'un inscrit.
 *
 * Les liens SANS propriétaire que rien ne prouve anonymes (aucun message ne les
 * porte : `POST /tracking-links` sans compte, OU un inscrit dont le jeton de
 * session avait expiré, qui retombait alors en appelant anonyme) ne sont PAS
 * touchés : le rapport les compte à part, avec nom, campagne et clics, pour une
 * décision du porteur.
 *
 * Mécanisme : `isActive: false` (+ `updatedAt`), celui que `/l/<jeton>`
 * (`routes/tracking-links/tracking.ts`) et `resolveTarget` respectent déjà —
 * le lien sert la page « lien désactivé », ses clics et son historique restent.
 * JAMAIS de suppression. Le rapport imprime CHAQUE jeton désactivé (et son
 * `_id`) : c'est la liste du retour arrière ciblé, à conserver.
 *
 * Régime (celui de #9035, jamais `prisma db push`) :
 * - À BLANC par défaut : dit ce qui serait désactivé, n'écrit rien. `APPLY=1` écrit.
 * - Idempotent : une seconde exécution n'a plus rien à désactiver (attendu : 0).
 * - Compteurs passés par `Number()` (pas de concaténation d'un `Long`).
 * - Après le déploiement de #10286 et de #10291 (sinon un message neuf peut
 *   réutiliser un candidat entre le relevé et l'écriture).
 *
 * Exécution — staging d'abord, production ensuite (FEU VERT PORTEUR pour la
 * production). La base est AUTHENTIFIÉE ; l'URI d'écriture se lit dans le
 * conteneur de la passerelle (MONGO_OPS_PASSWORD n'existe pas sur l'hôte) et
 * ne s'affiche jamais. Vérifier d'abord les noms de conteneurs : le compose de
 * production DIVERGE du dépôt (`ssh root@meeshy.me 'docker ps --format {{.Names}}'`).
 * Depuis la racine du dépôt :
 *
 *   F=packages/shared/prisma/migrations/2026-10-12-disable-anonymous-tracking-links.mongodb.js
 *   B=/opt/meeshy/backups/2026-10-12-disable-anonymous-tracking-links
 *
 *   # ── STAGING ──────────────────────────────────────────────────────────────
 *   # 1. Sauvegarde VÉRIFIÉE : le nombre de documents du dump (bsondump) doit
 *   #    ÉGALER celui de la collection.
 *   ssh root@meeshy.me 'URI=$(docker exec meeshy-gateway-staging printenv DATABASE_URL) && docker exec -e URI="$URI" meeshy-database-staging sh -c '"'"'rm -rf /tmp/b10291 && mongodump --uri "$URI" --collection TrackingLink --out /tmp/b10291 --quiet && bsondump --quiet $(find /tmp/b10291 -name TrackingLink.bson) | wc -l && mongosh "$URI" --quiet --eval "db.TrackingLink.countDocuments()"'"'"' && mkdir -p '$B' && docker cp meeshy-database-staging:/tmp/b10291 '$B'/staging'
 *
 *   # 2. À blanc, écriture (garder la sortie : liste des jetons), contrôle
 *   #    (attendu au contrôle : « À désactiver : 0 »)
 *   ssh root@meeshy.me 'URI=$(docker exec meeshy-gateway-staging printenv DATABASE_URL) && docker exec -i -e URI="$URI" meeshy-database-staging sh -c '"'"'mongosh "$URI" --quiet'"'"'' < $F
 *   ssh root@meeshy.me 'URI=$(docker exec meeshy-gateway-staging printenv DATABASE_URL) && docker exec -i -e URI="$URI" -e APPLY=1 meeshy-database-staging sh -c '"'"'mongosh "$URI" --quiet'"'"'' < $F | tee staging-10291-apply.log
 *   ssh root@meeshy.me 'URI=$(docker exec meeshy-gateway-staging printenv DATABASE_URL) && docker exec -i -e URI="$URI" meeshy-database-staging sh -c '"'"'mongosh "$URI" --quiet'"'"'' < $F
 *
 *   # ── PRODUCTION (feu vert porteur) ────────────────────────────────────────
 *   # Mêmes trois étapes en remplaçant `meeshy-gateway-staging` par
 *   # `meeshy-gateway`, `meeshy-database-staging` par `meeshy-database`, et
 *   # `'$B'/staging` / `staging-10291-apply.log` par `'$B'/production` /
 *   # `production-10291-apply.log` — JAMAIS l'URI de staging sur la production.
 *
 *   # Retour arrière ciblé : pour chaque jeton de la liste « Jetons désactivés »
 *   #   db.TrackingLink.updateOne({ token: '<jeton>' }, { $set: { isActive: true, updatedAt: new Date() } })
 *   # (la restauration du dump écraserait les clics comptés depuis).
 *
 * Témoin : `services/gateway/src/__tests__/unit/migrations/disable-anonymous-tracking-links-migration.test.ts`.
 */

const ANON_LINK_TOKEN_IN_CONTENT = /m\+([A-Za-z0-9_-]{2,50})/g;
const ANON_LINK_TOKEN_PRESENT = /m\+[A-Za-z0-9_-]{2,50}/;
const ANON_LINK_EXAMPLES = 5;
const ANON_LINK_URL_SHOWN = 60;
const ANON_LINK_PROJECTION = {
  _id: 1, token: 1, originalUrl: 1, isActive: 1, createdBy: 1, conversationId: 1, messageId: 1,
  name: 1, campaign: 1, source: 1, medium: 1, totalClicks: 1,
};

function anonLinkKey(value) {
  return value === null || value === undefined ? '' : String(value);
}

function anonLinkTokensOf(message) {
  const tokens = [];
  if (typeof message.content === 'string') {
    for (const match of message.content.matchAll(ANON_LINK_TOKEN_IN_CONTENT)) tokens.push(match[1]);
  }
  const mapped = message.metadata && Array.isArray(message.metadata.trackingLinks) ? message.metadata.trackingLinks : [];
  mapped.forEach((entry) => {
    if (entry && typeof entry.token === 'string' && entry.token.length > 0) tokens.push(entry.token);
  });
  return tokens;
}

function anonLinkTruncate(url) {
  const text = String(url || '');
  return text.length > ANON_LINK_URL_SHOWN ? `${text.slice(0, ANON_LINK_URL_SHOWN)}…` : text;
}

const ANON_LINK_CARRIES_TOKEN = {
  $or: [{ content: ANON_LINK_TOKEN_PRESENT }, { 'metadata.trackingLinks.token': { $exists: true } }],
};

function runDisableAnonymousTrackingLinks(database, options) {
  const report = {
    anonParticipantsByType: {},
    examined: 0,
    alreadyInactive: 0,
    keptOwnedByUser: 0,
    keptSharedWithMember: 0,
    unprovenOwnerless: [],
    toDisable: [],
    disabled: [],
  };

  const participants = database.getCollection('Participant');
  const messages = database.getCollection('Message');
  const links = database.getCollection('TrackingLink');
  const users = database.getCollection('User');

  const anonParticipants = participants
    .find({ $or: [{ type: 'anonymous' }, { userId: null }] }, { _id: 1, type: 1 })
    .toArray();
  anonParticipants.forEach((row) => {
    const type = row.type || '(sans type)';
    report.anonParticipantsByType[type] = (report.anonParticipantsByType[type] || 0) + 1;
  });
  const anonIds = anonParticipants.map((row) => row._id);

  const provenQueries = [];
  if (anonIds.length > 0) {
    provenQueries.push({ createdBy: { $in: anonIds } });

    const anonMessages = messages
      .find({ senderId: { $in: anonIds }, ...ANON_LINK_CARRIES_TOKEN }, { _id: 1, content: 1, metadata: 1 })
      .toArray();
    const citedTokens = [...new Set(anonMessages.flatMap(anonLinkTokensOf))];
    if (citedTokens.length > 0) provenQueries.push({ token: { $in: citedTokens } });

    const attachedMessageIds = links
      .find({ messageId: { $ne: null } }, { messageId: 1 })
      .toArray()
      .map((row) => row.messageId);
    if (attachedMessageIds.length > 0) {
      const anonAttached = messages
        .find({ _id: { $in: attachedMessageIds }, senderId: { $in: anonIds } }, { _id: 1 })
        .toArray()
        .map((row) => row._id);
      if (anonAttached.length > 0) provenQueries.push({ messageId: { $in: anonAttached } });
    }
  }

  const proven = provenQueries.length > 0
    ? links.find({ $or: provenQueries }, ANON_LINK_PROJECTION).toArray()
    : [];
  const provenIds = new Set(proven.map((link) => anonLinkKey(link._id)));

  report.unprovenOwnerless = links
    .find({ createdBy: null, isActive: true }, ANON_LINK_PROJECTION)
    .toArray()
    .filter((link) => !provenIds.has(anonLinkKey(link._id)));

  report.examined = proven.length;

  const ownerIds = proven.filter((link) => link.createdBy).map((link) => link.createdBy);
  const existingUsers = new Set(
    ownerIds.length > 0
      ? users.find({ _id: { $in: ownerIds } }, { _id: 1 }).toArray().map((row) => anonLinkKey(row._id))
      : [],
  );

  const open = proven.filter((link) => {
    if (link.isActive === false) {
      report.alreadyInactive += 1;
      return false;
    }
    if (link.createdBy && existingUsers.has(anonLinkKey(link.createdBy))) {
      report.keptOwnedByUser += 1;
      return false;
    }
    return true;
  });

  const conversationIds = [...new Map(
    open.filter((link) => link.conversationId).map((link) => [anonLinkKey(link.conversationId), link.conversationId]),
  ).values()];
  const memberTokens = new Set();
  const memberMessageIds = new Set();
  if (conversationIds.length > 0) {
    messages
      .find(
        { conversationId: { $in: conversationIds }, senderId: { $nin: anonIds }, ...ANON_LINK_CARRIES_TOKEN },
        { _id: 1, conversationId: 1, content: 1, metadata: 1 },
      )
      .toArray()
      .forEach((message) => {
        anonLinkTokensOf(message).forEach((token) => memberTokens.add(`${anonLinkKey(message.conversationId)}|${token}`));
      });
    const linkedMessageIds = open.filter((link) => link.messageId).map((link) => link.messageId);
    if (linkedMessageIds.length > 0) {
      messages
        .find({ _id: { $in: linkedMessageIds }, senderId: { $nin: anonIds } }, { _id: 1 })
        .toArray()
        .forEach((message) => memberMessageIds.add(anonLinkKey(message._id)));
    }
  }

  open.forEach((link) => {
    const carriedByMember = Boolean(link.conversationId) && (
      memberTokens.has(`${anonLinkKey(link.conversationId)}|${link.token}`)
      || (Boolean(link.messageId) && memberMessageIds.has(anonLinkKey(link.messageId)))
    );
    if (carriedByMember) {
      report.keptSharedWithMember += 1;
      return;
    }
    report.toDisable.push(link);
  });

  if (!options.apply) return report;

  const now = new Date();
  report.toDisable.forEach((link) => {
    const result = links.updateOne(
      { _id: link._id, isActive: true },
      { $set: { isActive: false, updatedAt: now } },
    );
    if (Number(result.modifiedCount) === 1) report.disabled.push(link);
  });

  return report;
}

function printDisableAnonymousTrackingLinksReport(report, options) {
  print(options.apply
    ? '===== Liens suivis d’invités anonymes (#10291) — ÉCRITURE ====='
    : '===== Liens suivis d’invités anonymes (#10291) — À BLANC, rien n’est écrit =====');
  const byType = Object.entries(report.anonParticipantsByType).map(([type, count]) => `${type}: ${Number(count)}`);
  print(`Participants comptés anonymes : ${byType.length ? byType.join(', ') : '0'}`);
  print(`Liens examinés : ${Number(report.examined)}`);
  print(`Déjà inactifs : ${Number(report.alreadyInactive)}`);
  print(`Laissés — propriétaire inscrit : ${Number(report.keptOwnedByUser)}`);
  print(`Laissés — portés aussi par le message d’un inscrit : ${Number(report.keptSharedWithMember)}`);
  print(`À désactiver : ${Number(report.toDisable.length)}`);
  print(`Désactivés : ${Number(report.disabled.length)}`);
  const examples = report.toDisable.slice(0, ANON_LINK_EXAMPLES);
  if (examples.length > 0) {
    print('Exemples :');
    examples.forEach((link) => print(`  ${link.token}  ${anonLinkTruncate(link.originalUrl)}`));
  }
  if (report.disabled.length > 0) {
    print('Jetons désactivés (liste du retour arrière) :');
    report.disabled.forEach((link) => print(`  - ${link.token} ${anonLinkKey(link._id)}`));
  }
  print(`Sans propriétaire, rien ne prouve un invité — NON touchés, décision porteur : ${Number(report.unprovenOwnerless.length)}`);
  report.unprovenOwnerless.slice(0, ANON_LINK_EXAMPLES).forEach((link) => {
    const label = [link.name, link.campaign, link.source, link.medium].filter(Boolean).join(' / ') || '(sans nom)';
    print(`  ? ${link.token}  ${label}  clics: ${Number(link.totalClicks || 0)}  ${anonLinkTruncate(link.originalUrl)}`);
  });
  if (!options.apply && report.toDisable.length > 0) print('Relancer avec APPLY=1 pour écrire.');
}

const disableAnonymousTrackingLinksOptions = { apply: process.env.APPLY === '1' };
const disableAnonymousTrackingLinksReport = runDisableAnonymousTrackingLinks(db, disableAnonymousTrackingLinksOptions);
printDisableAnonymousTrackingLinksReport(disableAnonymousTrackingLinksReport, disableAnonymousTrackingLinksOptions);
