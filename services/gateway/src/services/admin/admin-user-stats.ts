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
  'attachments',
  'postMedia',
  'friends',
  'friendRequestsPending',
  'friendRequestsReceived',
  'contacts',
  'communities',
  'reportsReceived',
  'reportsMade',
  'sessionsActive',
  'bansTotal',
  'bansActive',
  'shareLinks',
  'trackingLinks',
  'affiliations',
] as const;

export type AdminStatKey = (typeof ADMIN_STAT_KEYS)[number];

export type AdminUserStats = {
  readonly counts: Readonly<Record<AdminStatKey, number>>;
  readonly languages: readonly string[];
  readonly achievements: readonly Achievement[];
  readonly computedAt: string;
};

export async function computeAdminUserStats(
  prisma: PrismaClient,
  userId: string,
  now: Date
): Promise<AdminUserStats> {
  const [
    base,
    comments,
    messageReactions,
    postReactions,
    attachments,
    postMedia,
    friends,
    friendRequestsPending,
    contacts,
    communities,
    reportsReceived,
    reportsMade,
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
    prisma.messageAttachment.count({ where: { uploadedBy: userId } }),
    prisma.postMedia.count({ where: { post: { authorId: userId } } }),
    prisma.friendRequest.count({
      where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
    }),
    prisma.friendRequest.count({ where: { receiverId: userId, status: 'pending' } }),
    prisma.userContact.count({ where: { ownerId: userId } }),
    prisma.communityMember.count({ where: { userId, isActive: true } }),
    prisma.report.count({ where: { reportedType: 'user', reportedEntityId: userId } }),
    prisma.report.count({ where: { reporterId: userId } }),
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
      attachments,
      postMedia,
      friends,
      friendRequestsPending,
      friendRequestsReceived: servies.friendRequestsReceived ?? 0,
      contacts,
      communities,
      reportsReceived,
      reportsMade,
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
