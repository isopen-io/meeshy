import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isMemberCreator } from '@meeshy/shared/types/role-types';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { endConversationMembership, type DepartedMemberEphemeralState, type MembershipRoomReader } from '../../socketio/endConversationMembership';
import { runWithRetries } from '../../socketio/closeShareLinkRevokingGuests';
import type { GuestSocketRegistry } from '../../socketio/revokeShareLinkGuests';
import { resoudreSuccessionDuCreateur } from './creatorSuccession';
import { announceParticipantRoleWithCapabilities } from './obsoleteCapability';
import { postConversationNotice, noticeActor, noticeBroadcast, type SocketNoticeGateway } from './conversationNotice';
import { announceConversationLanguageChange } from '../message-translation/conversationLanguageChanges';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'CommunitySalonExit' });

type SalonIo = ConversationRoomEmitter & MembershipRoomReader & GuestSocketRegistry;

type SalonExitManager = DepartedMemberEphemeralState & {
  getIO(): SalonIo | null | undefined;
  broadcastMessage?: (message: never, conversationId: string) => Promise<void>;
};

export type SalonExitDeps = {
  readonly prisma: PrismaClient;
  readonly socketIOHandler: { getManager(): SalonExitManager | null | undefined } | null | undefined;
};

export type SalonExitRequest = {
  readonly communityId: string;
  readonly userId: string;
  readonly now: Date;
};

type DepartingRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly userId: string | null;
  readonly role: string | null;
  readonly displayName: string | null;
};

type LeaveSelf = { readonly where: { id: string }; readonly data: { isActive: false; leftAt: Date } };

/**
 * Une communauté qui GARDE ses salons : privée, ou désactivée (#16695 la garde
 * comme une privée). Ses salons n'admettent que ce que la communauté admet
 * (`planSalonEntry`), donc n'en être plus membre, c'est n'en être plus occupant.
 * Une communauté publique vivante laisse ses salons ouverts à quiconque : la
 * quitter ne fait sortir de rien.
 *
 * Un champ non lu (`undefined`) ne déclenche rien : la sortie est un EFFET, elle
 * ne part que sur une communauté dont la route a effectivement lu la forme.
 */
export function communityGuardsItsSalons(community: {
  readonly isPrivate?: boolean | null;
  readonly isActive?: boolean | null;
}): boolean {
  return community.isPrivate === true || community.isActive === false;
}

/**
 * QUI SORT DES SALONS quand on quitte une communauté qui les garde (#16704).
 *
 * Le départ d'une communauté n'écrivait que `CommunityMember` : l'ancien membre
 * restait participant actif de chaque salon et continuait de lire ce que la
 * communauté réserve à ses membres — les portes d'entrée (#16639, #16695) ne
 * l'arrêtaient pas, il était « déjà dans le salon ».
 *
 * DEUX temps. D'abord COUPER l'accès, pendant la requête : une écriture groupée
 * (`updateMany`) pour toutes les lignes ordinaires, la succession du créateur
 * (`creatorSuccession`, la loi unique) pour chaque salon vivant qu'il a fondé,
 * puis l'invalidation du cache de participation. Les salons CLOS comptent aussi :
 * la lecture d'un fil ne regarde que la ligne `Participant`, jamais l'état de la
 * conversation, donc une archive restait lisible. Ensuite ANNONCER, en arrière-
 * plan (`announcements`), dans chaque salon vivant quitté : l'avis « X a quitté
 * la conversation », `conversation:participant-left` avec l'effectif absolu, la
 * fin d'appartenance (`endConversationMembership`) — le même départ que
 * `POST /conversations/:id/leave`, sans faire attendre la route autant de
 * salons qu'en compte la communauté.
 *
 * Une différence assumée avec `leave.ts` : un créateur sans héritier sort sans
 * CLORE le salon — la clôture est un geste du créateur sur SON fil, pas la
 * conséquence d'une décision prise dans la communauté.
 *
 * Mais un salon sans créateur ni héritier INSCRIT n'a plus personne pour
 * gouverner ses liens de partage (#16712) : les invités venus par lien y
 * restaient seuls, sans modération. Ses liens se FERMENT donc et se MARQUENT
 * (`guestRevocationPendingAt`) pendant la requête — la garde commune
 * (`guestAccessEnd`) refuse dès cet instant chaque invité — puis leurs invités
 * sont révoqués en arrière-plan par `runWithRetries` (nouvelles tentatives à
 * 1 puis 5 minutes), la reprise que le balayage horaire rejoue si elle échoue.
 *
 * Contrat : NE REJETTE JAMAIS, `announcements` non plus — les deux routes
 * appelantes ont déjà commis le départ, et un 500 nierait un fait durable que le
 * client ne peut plus rejouer (le second appel répondrait « vous n'êtes pas
 * membre »).
 */
export async function exitCommunitySalons(
  deps: SalonExitDeps,
  request: SalonExitRequest,
): Promise<SalonExit> {
  try {
    return await exitEverySalon(deps, request);
  } catch (error) {
    logger.error('Community salon exit failed before any salon', { communityId: request.communityId, error });
    return NO_EXIT;
  }
}

export type SalonExit = {
  readonly exitedConversationIds: readonly string[];
  readonly announcements: Promise<void>;
};

const NO_EXIT: SalonExit = { exitedConversationIds: [], announcements: Promise.resolve() };

type Departure = { readonly row: DepartingRow; readonly successor: { readonly userId: string | null } | null };

async function exitEverySalon(deps: SalonExitDeps, request: SalonExitRequest): Promise<SalonExit> {
  const { prisma } = deps;
  const salons = await prisma.conversation.findMany({
    where: { communityId: request.communityId },
    select: { id: true, isActive: true },
  });
  if (salons.length === 0) return NO_EXIT;
  const liveSalons = new Set(salons.filter((salon) => salon.isActive !== false).map((salon) => salon.id));

  const rows: DepartingRow[] = await prisma.participant.findMany({
    where: {
      userId: request.userId,
      isActive: true,
      conversationId: { in: salons.map((salon) => salon.id) },
    },
    select: { id: true, conversationId: true, userId: true, role: true, displayName: true },
  });
  if (rows.length === 0) return NO_EXIT;

  const foundsLiveSalon = (row: DepartingRow) =>
    liveSalons.has(row.conversationId) && isMemberCreator(row.role ?? 'member');
  const plainRows = rows.filter((row) => !foundsLiveSalon(row));
  const creatorRows = rows.filter(foundsLiveSalon);

  const departures: Departure[] = [];
  if (plainRows.length > 0) {
    await prisma.participant.updateMany({
      where: { id: { in: plainRows.map((row) => row.id) }, isActive: true },
      data: { isActive: false, leftAt: request.now },
    });
    departures.push(...plainRows.map((row) => ({ row, successor: null })));
  }
  for (const row of creatorRows) {
    try {
      departures.push({ row, successor: await writeCreatorDeparture(prisma, request, row) });
    } catch (error) {
      logger.error('Community salon exit failed', { conversationId: row.conversationId, error });
    }
  }
  for (const { row } of departures) invalidateParticipantLookup(row.id, row.conversationId);

  const orphanedSalons = departures
    .filter(({ row, successor }) => foundsLiveSalon(row) && successor === null)
    .map(({ row }) => row.conversationId);
  const closedLinkIds = await closeOrphanedSalonLinks(prisma, orphanedSalons, request.now);

  const announced = departures.filter(({ row }) => liveSalons.has(row.conversationId));
  return {
    exitedConversationIds: departures.map(({ row }) => row.conversationId),
    announcements: announceEveryExit(deps, request, announced)
      .then(() => revokeOrphanedSalonGuests(deps, request, closedLinkIds)),
  };
}

async function closeOrphanedSalonLinks(
  prisma: PrismaClient,
  conversationIds: readonly string[],
  now: Date,
): Promise<readonly string[]> {
  const closed: string[] = [];
  for (const conversationId of conversationIds) {
    try {
      const links = await prisma.conversationShareLink.findMany({ where: { conversationId }, select: { id: true } });
      if (links.length === 0) continue;
      const ids = links.map((link) => link.id);
      await prisma.conversationShareLink.updateMany({
        where: { id: { in: ids } },
        data: { isActive: false, guestRevocationPendingAt: now },
      });
      closed.push(...ids);
    } catch (error) {
      logger.error('Orphaned community salon links could not be closed', { conversationId, error });
    }
  }
  return closed;
}

async function revokeOrphanedSalonGuests(
  deps: SalonExitDeps,
  request: SalonExitRequest,
  shareLinkIds: readonly string[],
): Promise<void> {
  if (shareLinkIds.length === 0) return;
  const manager = deps.socketIOHandler?.getManager();
  const io = manager?.getIO();
  for (const shareLinkId of shareLinkIds) {
    try {
      await runWithRetries({ prisma: deps.prisma, io, manager, shareLinkId, pendingSince: request.now }, 0);
    } catch (error) {
      logger.error('Orphaned community salon guest revocation failed', { shareLinkId, error });
    }
  }
}

function announceEveryExit(
  deps: SalonExitDeps,
  request: SalonExitRequest,
  departures: readonly Departure[],
): Promise<void> {
  if (departures.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setImmediate(async () => {
      for (const departure of departures) {
        try {
          await announceExit(deps, request, departure);
        } catch (error) {
          logger.error('Community salon exit announcement failed', { conversationId: departure.row.conversationId, error });
        }
      }
      resolve();
    });
  });
}

async function announceExit(deps: SalonExitDeps, request: SalonExitRequest, departure: Departure): Promise<void> {
  const { prisma, socketIOHandler } = deps;
  const { row, successor } = departure;
  const { conversationId } = row;
  announceConversationLanguageChange({ kind: 'departure', conversationId });

  const displayName = row.displayName ?? '';
  await postConversationNotice(
    { prisma, broadcast: noticeBroadcast(socketIOHandler as SocketNoticeGateway) },
    { conversationId, notice: { kind: 'member-left', actor: noticeActor({ id: row.id, displayName }) } },
  );

  const manager = socketIOHandler?.getManager();
  const io = manager?.getIO();
  if (!io) return;

  const remaining = await prisma.participant.findMany({
    where: { conversationId, isActive: true },
    select: { id: true, userId: true, role: true, user: { select: { role: true } } },
  });
  emitConversationMemberCountEvent({
    io,
    conversationId,
    participants: [...remaining, { id: row.id, userId: row.userId }],
    event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
    payload: {
      conversationId,
      participantId: row.id,
      userId: row.userId ?? null,
      displayName,
      leftAt: request.now.toISOString(),
    },
    memberCount: remaining.length,
  });

  if (successor?.userId) {
    announceParticipantRoleWithCapabilities(prisma, {
      io,
      payload: { conversationId, userId: successor.userId, newRole: 'creator', updatedBy: request.userId },
      onError: (error) => logger.warn('viewerCapabilities unreadable for the promoted successor', { conversationId, error }),
    }).catch((error: unknown) => logger.warn('participant:role-updated emission failed', { error }));
  }

  await endConversationMembership({ io, manager, conversationId, userId: row.userId ?? row.id });
}

async function writeCreatorDeparture(
  prisma: PrismaClient,
  request: SalonExitRequest,
  row: DepartingRow,
): Promise<{ readonly userId: string | null } | null> {
  const leaveSelf: LeaveSelf = { where: { id: row.id }, data: { isActive: false, leftAt: request.now } };
  const succession = await resoudreSuccessionDuCreateur(prisma, {
    conversationId: row.conversationId,
    sortantUserId: request.userId,
  });
  if (succession.kind !== 'transfer') {
    await prisma.participant.update(leaveSelf);
    return null;
  }
  await prisma.$transaction([
    prisma.participant.update({ where: { id: succession.successor.id }, data: { role: 'creator' } }),
    prisma.participant.update(leaveSelf),
  ]);
  return { userId: succession.successor.userId };
}
