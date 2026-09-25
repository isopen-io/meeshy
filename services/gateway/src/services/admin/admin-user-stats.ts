/**
 * Les compteurs d'un membre, tels que sa fiche d'administration les montre
 * (#7845 C).
 *
 * ## Ce qui est RÉUTILISÉ, et pourquoi pas réécrit
 *
 * Messages, conversations, traductions, langues, ancienneté, posts, reels et
 * stories viennent de `computeUserStats` (`routes/user-stats.ts`) — le site
 * UNIQUE de ces agrégations, que servent déjà `/users/me/stats`,
 * `/users/:id/stats` et `?expand=stats`. La fiche lit l'objet ENTIER : c'est
 * `servedUserStats` avec `estAdministration: true`, l'audience qui voit aussi
 * les compteurs intimes. Une seconde copie de ces requêtes divergerait à la
 * première correction — c'est exactement ce qui était arrivé à ce calcul,
 * recopié un temps dans `preferences.ts`.
 *
 * ## Ce qui est AJOUTÉ
 *
 * Ce que le profil public n'a pas à dire et qu'un administrateur instruit :
 * l'activité sociale fine (commentaires, réactions, pièces jointes, amis,
 * contacts, communautés), la modération (signalements reçus et émis, bans) et
 * la sécurité (sessions vivantes). Tous des `count` — aucune ligne n'est
 * rapatriée, aucun contenu n'est lu.
 *
 * ## Les signalements ont LEUR seuil, pas celui de la fiche
 *
 * La fiche s'ouvre sous `canViewUserDetails`, qu'AUDIT porte ; la table
 * `Report` se lit sous `canModerateContent` (`REPORT_PERMISSION_LA_PLUS_HAUTE`,
 * `routes/admin/user-reports.ts`), qu'AUDIT ne porte pas. Deux seuils sur une
 * même donnée, c'est le plus haut qui décide — et un compte EST une lecture de
 * la table. Sans ce droit, les trois compteurs de signalements valent `null`
 * (« non communiqué », jamais « zéro », qui serait un fait faux) et la table
 * n'est pas même interrogée.
 *
 * `reportsOnMessages` compte les signalements visant les MESSAGES du membre,
 * par l'énumération bornée de `reported-messages` (`reportableMessageIdsOf`) :
 * `Report` est polymorphe, aucune requête ne peut dire « l'auteur du message
 * visé » sans énumérer d'abord.
 *
 * ## `now` est un PARAMÈTRE
 *
 * « Ban actif » et « session vivante » dépendent de l'instant. Le lire ici
 * rendrait ces deux compteurs impossibles à témoigner sur un ban échu ou une
 * session expirée : le témoin fixe l'instant, la route passe l'horloge.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOT_LIFTED } from './ban.service';
import { computeUserStats, servedUserStats, type Achievement } from '../../routes/user-stats';
import { NOT_DELETED } from '../posts/softDelete';
import { reportableMessageIdsOf } from '../../routes/admin/user-reports';

export const ADMIN_STAT_KEYS = [
  'messagesSent',
  'conversations',
  'translations',
  'memberDays',
  'posts',
  'reels',
  'stories',
  'comments',
  'messageReactions',
  'postReactions',
  'commentReactions',
  'attachments',
  'postMedia',
  'friends',
  'friendRequestsPending',
  'friendRequestsReceived',
  'friendRequestsSent',
  'contacts',
  'communities',
  'reportsReceived',
  'reportsMade',
  'reportsOnMessages',
  'sessionsActive',
  'bansTotal',
  'bansActive',
  'shareLinks',
  'trackingLinks',
  'affiliations',
] as const;

export type AdminStatKey = (typeof ADMIN_STAT_KEYS)[number];

/** Les compteurs qui lisent `Report` — `null` sans `canModerateContent`. */
export const ADMIN_REPORT_STAT_KEYS = ['reportsReceived', 'reportsMade', 'reportsOnMessages'] as const satisfies readonly AdminStatKey[];

type AdminReportStatKey = (typeof ADMIN_REPORT_STAT_KEYS)[number];

export type AdminUserStatCounts = Readonly<
  Record<Exclude<AdminStatKey, AdminReportStatKey>, number> & Record<AdminReportStatKey, number | null>
>;

export type AdminUserStatsAudience = {
  /** `canModerateContent` du lecteur — le seuil de la table `Report`. */
  readonly canReadReports: boolean;
};

type ReportCounts = Readonly<Record<AdminReportStatKey, number | null>>;

const REPORTS_WITHHELD: ReportCounts = { reportsReceived: null, reportsMade: null, reportsOnMessages: null };

async function countReportsOnMessagesOf(prisma: PrismaClient, userId: string): Promise<number> {
  const messageIds = await reportableMessageIdsOf(prisma, userId);
  if (messageIds.length === 0) return 0;
  return prisma.report.count({ where: { reportedType: 'message', reportedEntityId: { in: [...messageIds] } } });
}

async function countReports(prisma: PrismaClient, userId: string, audience: AdminUserStatsAudience): Promise<ReportCounts> {
  if (!audience.canReadReports) return REPORTS_WITHHELD;
  const [reportsReceived, reportsMade, reportsOnMessages] = await Promise.all([
    prisma.report.count({ where: { reportedType: 'user', reportedEntityId: userId } }),
    prisma.report.count({ where: { reporterId: userId } }),
    countReportsOnMessagesOf(prisma, userId),
  ]);
  return { reportsReceived, reportsMade, reportsOnMessages };
}

export type AdminUserStats = {
  readonly counts: AdminUserStatCounts;
  readonly languages: readonly string[];
  readonly achievements: readonly Achievement[];
  readonly computedAt: string;
};

export async function computeAdminUserStats(
  prisma: PrismaClient,
  userId: string,
  now: Date,
  audience: AdminUserStatsAudience
): Promise<AdminUserStats> {
  const [
    base,
    comments,
    messageReactions,
    postReactions,
    commentReactions,
    attachments,
    postMedia,
    friends,
    friendRequestsPending,
    friendRequestsSent,
    contacts,
    communities,
    reports,
    sessionsActive,
    bansTotal,
    bansActive,
    shareLinks,
    trackingLinks,
    affiliations,
  ] = await Promise.all([
    computeUserStats(prisma, userId),
    // `NOT_DELETED` et non `null` : sur Mongo, un commentaire vivant n'a PAS de
    // champ `deletedAt` — `null` brut ne matcherait rien (`posts/softDelete`).
    prisma.postComment.count({ where: { authorId: userId, deletedAt: NOT_DELETED } }),
    // `Reaction` n'a pas de `userId` : une réaction de message appartient à une
    // PARTICIPATION. Compter par la relation est la seule forme qui atteigne
    // toutes les réactions d'un compte, quelle que soit la conversation.
    prisma.reaction.count({ where: { participant: { userId } } }),
    prisma.postReaction.count({ where: { userId } }),
    prisma.commentReaction.count({ where: { userId } }),
    prisma.messageAttachment.count({ where: { uploadedBy: userId } }),
    prisma.postMedia.count({ where: { post: { authorId: userId } } }),
    prisma.friendRequest.count({
      where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
    }),
    prisma.friendRequest.count({ where: { receiverId: userId, status: 'pending' } }),
    prisma.friendRequest.count({ where: { senderId: userId, status: 'pending' } }),
    prisma.userContact.count({ where: { ownerId: userId } }),
    prisma.communityMember.count({ where: { userId, isActive: true } }),
    countReports(prisma, userId, audience),
    prisma.userSession.count({ where: { userId, isValid: true, expiresAt: { gt: now } } }),
    prisma.ban.count({ where: { userId } }),
    // Même loi que `BanService` : un ban vit tant qu'il n'est ni LEVÉ ni ÉCHU.
    // `expiresAt: null` est un ban sans terme, pas un ban sans date — et
    // `createBan` l'écrit explicitement, contrairement à `liftedAt`.
    prisma.ban.count({
      where: { userId, AND: [NOT_LIFTED, { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }] },
    }),
    prisma.conversationShareLink.count({ where: { createdBy: userId } }),
    prisma.trackingLink.count({ where: { createdBy: userId } }),
    prisma.affiliateToken.count({ where: { createdBy: userId } }),
  ]);

  const servies = servedUserStats(base, { estSoi: false, estAdministration: true });

  return {
    counts: {
      messagesSent: servies.totalMessages ?? 0,
      conversations: servies.totalConversations ?? 0,
      translations: servies.totalTranslations ?? 0,
      memberDays: servies.memberDays ?? 0,
      posts: servies.postsCount ?? 0,
      reels: servies.reelsCount ?? 0,
      stories: servies.storiesCount ?? 0,
      comments,
      messageReactions,
      postReactions,
      commentReactions,
      attachments,
      postMedia,
      friends,
      friendRequestsPending,
      friendRequestsReceived: servies.friendRequestsReceived ?? 0,
      friendRequestsSent,
      contacts,
      communities,
      ...reports,
      sessionsActive,
      bansTotal,
      bansActive,
      shareLinks,
      trackingLinks,
      affiliations,
    },
    languages: servies.languages ?? [],
    achievements: servies.achievements ?? [],
    computedAt: now.toISOString(),
  };
}
