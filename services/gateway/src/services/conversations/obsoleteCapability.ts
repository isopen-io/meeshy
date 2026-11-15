/**
 * #14690 — QUI peut rendre une conversation obsolète : la décision UNIQUE.
 *
 * `DELETE /conversations/:id/obsolete` la consulte pour refuser, et la liste,
 * le détail et `conversation:new` la consultent pour servir à chaque lecteur
 * `viewerCapabilities.canMakeObsolete` — un client masque l'action d'emblée au
 * lieu d'essuyer le 403.
 *
 * - Administrateur de la conversation (rôle de plateforme compris) : oui (#14643).
 * - Tête-à-tête : l'un OU l'autre de ses membres inscrits, actifs, ni partis ni
 *   bannis, tant qu'elle compte au plus deux participations actives (#14653).
 * - Demande de message non acceptée : seul son DESTINATAIRE, jamais
 *   l'expéditeur, quel que soit son rôle (#14676). « Non acceptée » se lit
 *   comme `acceptMessageRequest` (`NOT_YET_ACCEPTED`), sur la ligne d'un AUTRE
 *   participant, sans filtre `isActive` : un destinataire parti ne rend pas la
 *   main à l'expéditeur.
 * - La conversation globale ne devient jamais obsolète.
 *
 * Les lectures sont groupées : au plus trois requêtes, quel que soit le nombre
 * de lecteurs ou de conversations — une page de liste (un lecteur, n
 * conversations), un événement (n lecteurs, une conversation) ou la route.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MemberRole } from '@meeshy/shared/types/role-types';
import type { ConversationViewerCapabilities } from '@meeshy/shared/types/conversation';
import { ROOMS, SERVER_EVENTS, type ConversationNewEventData, type ParticipantRoleUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import { NOT_YET_ACCEPTED } from '../messaging/messageRequests';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';

export const DIRECT_CONVERSATION_MAX_ACTIVE_PARTICIPANTS = 2;

/** La conversation globale ne s'efface jamais, quel que soit le nom qui la désigne. */
export const isProtectedFromObsolescence = (conversation: { readonly type?: string | null; readonly identifier?: string | null }): boolean =>
  conversation.type === 'global' || conversation.identifier === 'meeshy';

export type ObsoleteViewer = {
  readonly userId: string;
  readonly isAnonymous: boolean;
  readonly hasRegisteredUser: boolean;
  readonly platformRole?: string | null;
};

export type ObsoleteMembership = {
  readonly role: string;
  readonly type: string;
  readonly leftAt: Date | null;
  readonly bannedAt: Date | null;
  readonly conversation: { readonly type: string; readonly identifier?: string | null } | null;
};

export type ObsoleteFacts = {
  readonly membership: ObsoleteMembership | null;
  readonly sendsPendingRequest: boolean;
  readonly activeParticipants: number | null;
};

/** Une participation ACTIVE déjà lue par l'appelant (même filtre que `loadMemberships`). */
export type PrefetchedMembership = ObsoleteMembership & { readonly conversationId: string; readonly userId: string | null };

export type ObsoleteVerdict = 'allowed' | 'protected' | 'pending-request-sender' | 'forbidden';

export type ObsoleteVerdictOf = (userId: string, conversationId: string) => ObsoleteVerdict;

type ObsoleteAuthContext = {
  readonly userId?: string;
  readonly isAnonymous: boolean;
  readonly registeredUser?: { readonly role?: string | null } | null;
};

type ObsoleteReader = Pick<PrismaClient, 'participant'>;

export const obsoleteViewerOf = (authContext: ObsoleteAuthContext): ObsoleteViewer => ({
  userId: authContext.userId ?? '',
  isAnonymous: authContext.isAnonymous,
  hasRegisteredUser: authContext.registeredUser !== undefined && authContext.registeredUser !== null,
  platformRole: authContext.registeredUser?.role ?? null,
});

export function mayObsoleteAsDirectMember(membership: ObsoleteMembership | null, viewer: Pick<ObsoleteViewer, 'isAnonymous' | 'hasRegisteredUser'>): boolean {
  if (membership === null) return false;
  if (viewer.isAnonymous || !viewer.hasRegisteredUser) return false;
  if (membership.type !== 'user') return false;
  if (membership.leftAt !== null || membership.bannedAt !== null) return false;
  return membership.conversation?.type === 'direct';
}

export function obsoleteVerdict(viewer: ObsoleteViewer, facts: ObsoleteFacts): ObsoleteVerdict {
  const conversation = facts.membership?.conversation ?? null;
  if (conversation !== null && isProtectedFromObsolescence(conversation)) return 'protected';
  if (facts.sendsPendingRequest) return 'pending-request-sender';
  if (actorHasMinimumRole({ conversationRole: facts.membership?.role, platformRole: viewer.platformRole }, MemberRole.ADMIN)) return 'allowed';
  if (!mayObsoleteAsDirectMember(facts.membership, viewer)) return 'forbidden';
  return facts.activeParticipants !== null && facts.activeParticipants <= DIRECT_CONVERSATION_MAX_ACTIVE_PARTICIPANTS ? 'allowed' : 'forbidden';
}

const membershipKey = (userId: string, conversationId: string): string => `${userId}:${conversationId}`;

const NO_FACTS: ObsoleteFacts = { membership: null, sendsPendingRequest: false, activeParticipants: null };

async function loadMemberships(
  prisma: ObsoleteReader,
  userIds: readonly string[],
  conversationIds: readonly string[],
  prefetched?: readonly PrefetchedMembership[],
): Promise<ReadonlyMap<string, ObsoleteMembership>> {
  if (userIds.length === 0 || conversationIds.length === 0) return new Map();
  const wanted = new Set(userIds);
  const rows = prefetched?.filter((row) => row.userId !== null && wanted.has(row.userId)) ?? await prisma.participant.findMany({
    where: { conversationId: { in: [...conversationIds] }, userId: { in: [...userIds] }, isActive: true },
    select: {
      conversationId: true,
      userId: true,
      role: true,
      type: true,
      leftAt: true,
      bannedAt: true,
      conversation: { select: { type: true, identifier: true } },
    },
  });
  return new Map(
    rows
      .flatMap((row) => (row.userId === null ? [] : [[membershipKey(row.userId, row.conversationId), row] as const]))
      .reverse(),
  );
}

async function loadDirectFacts(
  prisma: ObsoleteReader,
  directIds: readonly string[],
): Promise<{ readonly pendingRecipients: ReadonlyMap<string, readonly (string | null)[]>; readonly activeCounts: ReadonlyMap<string, number> }> {
  if (directIds.length === 0) return { pendingRecipients: new Map(), activeCounts: new Map() };
  const [pending, counts] = await Promise.all([
    prisma.participant.findMany({
      where: { conversationId: { in: [...directIds] }, ...NOT_YET_ACCEPTED },
      select: { conversationId: true, userId: true },
    }),
    prisma.participant.groupBy({
      by: ['conversationId'],
      where: { conversationId: { in: [...directIds] }, isActive: true },
      _count: { _all: true },
    }),
  ]);
  const pendingRecipients = new Map(
    directIds.map((id) => [id, pending.filter((row) => row.conversationId === id).map((row) => row.userId)] as const),
  );
  const activeCounts = new Map(counts.map((row) => [row.conversationId, row._count._all] as const));
  return { pendingRecipients, activeCounts };
}

export async function loadObsoleteVerdicts(
  prisma: ObsoleteReader,
  params: {
    readonly viewers: readonly ObsoleteViewer[];
    readonly conversationIds: readonly string[];
    readonly memberships?: readonly PrefetchedMembership[];
  },
): Promise<ObsoleteVerdictOf> {
  const viewersById = new Map(params.viewers.map((viewer) => [viewer.userId, viewer] as const));
  const memberIds = params.viewers.filter((viewer) => !viewer.isAnonymous && viewer.userId !== '').map((viewer) => viewer.userId);
  const memberships = await loadMemberships(prisma, memberIds, params.conversationIds, params.memberships);
  const directIds = [...new Set([...memberships.entries()]
    .filter(([, membership]) => membership.conversation?.type === 'direct')
    .map(([key]) => key.slice(key.indexOf(':') + 1)))];
  const { pendingRecipients, activeCounts } = await loadDirectFacts(prisma, directIds);

  return (userId, conversationId) => {
    const viewer = viewersById.get(userId);
    if (viewer === undefined) return obsoleteVerdict({ userId, isAnonymous: true, hasRegisteredUser: false }, NO_FACTS);
    const membership = memberships.get(membershipKey(userId, conversationId)) ?? null;
    const isDirect = membership?.conversation?.type === 'direct';
    return obsoleteVerdict(viewer, {
      membership,
      sendsPendingRequest: isDirect && (pendingRecipients.get(conversationId) ?? []).some((recipientId) => recipientId !== userId),
      activeParticipants: isDirect ? activeCounts.get(conversationId) ?? 0 : null,
    });
  };
}

export type ViewerCapabilitiesOf = (userId: string, conversationId: string) => ConversationViewerCapabilities | undefined;

const servedCapabilities = (verdict: ObsoleteVerdict): ConversationViewerCapabilities => ({ canMakeObsolete: verdict === 'allowed' });

/**
 * Les capacités servies, ou RIEN si la lecture échoue : une capacité absente
 * laisse le client à son comportement antérieur (l'action proposée, la route
 * refusant), alors qu'un `false` fabriqué cacherait l'action à qui la détient.
 */
export async function loadViewerCapabilities(
  prisma: ObsoleteReader,
  params: {
    readonly viewers: readonly ObsoleteViewer[];
    readonly conversationIds: readonly string[];
    readonly memberships?: readonly PrefetchedMembership[];
    readonly onError: (error: unknown) => void;
  },
): Promise<ViewerCapabilitiesOf> {
  try {
    const verdictOf = await loadObsoleteVerdicts(prisma, params);
    return (userId, conversationId) => servedCapabilities(verdictOf(userId, conversationId));
  } catch (error) {
    params.onError(error);
    return () => undefined;
  }
}

/**
 * Les capacités d'une page de LISTE : les participations du lecteur déjà lues
 * par la liste (`readerJoins`, même filtre actif) évitent une lecture de plus.
 */
export function loadListViewerCapabilities(
  prisma: ObsoleteReader,
  params: {
    readonly authContext: ObsoleteAuthContext;
    readonly conversations: readonly { readonly id: string; readonly type: string; readonly identifier: string | null }[];
    readonly readerJoins: readonly Pick<PrefetchedMembership, 'conversationId' | 'role' | 'type' | 'leftAt' | 'bannedAt'>[];
    readonly onError: (error: unknown) => void;
  },
): Promise<ViewerCapabilitiesOf> {
  const viewer = obsoleteViewerOf(params.authContext);
  const shapes = new Map(params.conversations.map((c) => [c.id, { type: c.type, identifier: c.identifier }] as const));
  return loadViewerCapabilities(prisma, {
    viewers: [viewer],
    conversationIds: params.conversations.map((c) => c.id),
    memberships: viewer.isAnonymous ? [] : params.readerJoins.map((join) => ({
      conversationId: join.conversationId,
      userId: viewer.userId,
      role: join.role,
      type: join.type,
      leftAt: join.leftAt,
      bannedAt: join.bannedAt,
      conversation: shapes.get(join.conversationId) ?? null,
    })),
    onError: params.onError,
  });
}

/** Les capacités des MEMBRES nommés d'une conversation, pour un événement poussé à chacun. */
export async function loadMemberCapabilities(
  prisma: Pick<PrismaClient, 'participant' | 'user'>,
  params: { readonly conversationId: string; readonly userIds: readonly string[]; readonly onError: (error: unknown) => void },
): Promise<(userId: string) => ConversationViewerCapabilities | undefined> {
  try {
    const users = params.userIds.length === 0
      ? []
      : await prisma.user.findMany({ where: { id: { in: [...params.userIds] } }, select: { id: true, role: true } });
    const viewers = users.map((user): ObsoleteViewer => ({ userId: user.id, isAnonymous: false, hasRegisteredUser: true, platformRole: user.role }));
    const capabilitiesOf = await loadViewerCapabilities(prisma, { viewers, conversationIds: [params.conversationId], onError: params.onError });
    const known = new Set(viewers.map((viewer) => viewer.userId));
    return (userId) => (known.has(userId) ? capabilitiesOf(userId, params.conversationId) : undefined);
  } catch (error) {
    params.onError(error);
    return () => undefined;
  }
}

/** Le payload d'un événement, augmenté des capacités de SON destinataire quand elles sont connues. */
export const withViewerCapabilities = <T extends object>(
  payload: T,
  capabilities: ConversationViewerCapabilities | undefined,
): T & { readonly viewerCapabilities?: ConversationViewerCapabilities } =>
  capabilities === undefined ? payload : { ...payload, viewerCapabilities: capabilities };

/**
 * `conversation:new` vers chaque destinataire, augmenté de SES capacités.
 * Ne rejette jamais : une route l'appelle sans l'attendre, la réponse ne paie
 * pas ces lectures.
 */
export async function announceConversationNew(
  prisma: Pick<PrismaClient, 'participant' | 'user'>,
  params: {
    readonly io: ServerEmitIO;
    readonly recipientIds: readonly string[];
    readonly payload: ConversationNewEventData;
    readonly onError: (error: unknown) => void;
  },
): Promise<void> {
  try {
    const capabilitiesOf = await loadMemberCapabilities(prisma, {
      conversationId: params.payload.conversationId,
      userIds: params.recipientIds,
      onError: params.onError,
    });
    params.recipientIds.forEach((recipientId) =>
      params.io.to(ROOMS.user(recipientId)).emit(SERVER_EVENTS.CONVERSATION_NEW, withViewerCapabilities(params.payload, capabilitiesOf(recipientId))));
  } catch (error) {
    params.onError(error);
  }
}

/**
 * `participant:role-updated` (#15987) : la salle l'apprend telle quelle, et la
 * CIBLE — seule, dans sa room personnelle — le reçoit augmenté de SA capacité
 * recalculée pour son nouveau rang. Un changement de rang ne touche pas
 * `conversation.updatedAt` : sans elle, la synchronisation delta ne relirait
 * jamais la ligne et un membre promu garderait le `false` de son ancien rang.
 *
 * Exclure sa room de la diffusion de salle est ce qui lui évite l'événement en
 * double ; ses appareils hors du fil l'apprennent du même coup. La lecture ne
 * précède QUE son exemplaire, la salle ne l'attend pas ; les exemplaires d'une
 * même cible partent dans l'ordre (`inTargetLane`). Ne rejette jamais : un
 * échec de lecture lui livre l'événement sans capacité, et le client relit.
 */
export async function announceParticipantRoleWithCapabilities(
  prisma: Pick<PrismaClient, 'participant' | 'user'>,
  params: {
    readonly io: ConversationRoomEmitter;
    readonly payload: ParticipantRoleUpdatedEventData;
    readonly onError: (error: unknown) => void;
  },
): Promise<void> {
  const { io, payload, onError } = params;
  const targetRoom = ROOMS.user(payload.userId);
  try {
    io.to(ROOMS.conversation(payload.conversationId)).except(targetRoom).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, payload);
  } catch (error) {
    onError(error);
  }
  await inTargetLane(`${payload.conversationId}:${payload.userId}`, async () => {
    try {
      const capabilitiesOf = await loadMemberCapabilities(prisma, {
        conversationId: payload.conversationId,
        userIds: [payload.userId],
        onError,
      });
      io.to(targetRoom).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, withViewerCapabilities(payload, capabilitiesOf(payload.userId)));
    } catch (error) {
      onError(error);
    }
  });
}

/**
 * Les exemplaires d'une même cible partent dans l'ORDRE des changements : sa
 * lecture n°2 ne commence qu'après l'émission n°1. Sans cette file, deux
 * changements rapprochés (promu puis rétrogradé) pouvaient lui livrer en
 * DERNIER la capacité de l'ancien rang. La dernière lecture suit la dernière
 * écriture : l'état final remis est celui de la base. Par processus.
 */
const targetLanes = new Map<string, Promise<void>>();

function inTargetLane(key: string, task: () => Promise<void>): Promise<void> {
  const next = (targetLanes.get(key) ?? Promise.resolve()).then(task, task);
  targetLanes.set(key, next);
  return next.finally(() => {
    if (targetLanes.get(key) === next) targetLanes.delete(key);
  });
}
