import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MemberRoleType } from '@meeshy/shared/types/role-types';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { MEMBER_COUNT_DISPLAY_CAP } from '@meeshy/shared/utils/member-visibility';
import { postJoinSystemMessage, type JoinSystemMessageDeps } from './joinSystemMessage';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'EnsureGlobalConversationMembership' });

/**
 * Ce qu'il faut du manager Socket.IO pour annoncer une arrivée dans le salon
 * global — l'avis d'arrivée (`broadcastMessage`) ET, si le manager est vivant,
 * l'effectif temps réel (`getIO`). Résolu PARESSEUSEMENT par l'appelant, comme
 * `ExpiredMessagesCleanupService` : le manager n'existe pas encore quand les
 * routes s'enregistrent. Absent = pas de socket, l'ajout reste persisté.
 *
 * `getIO` est optionnel : un appelant qui n'a que la diffusion de messages
 * (l'ancien `JoinNoticeBroadcaster`) reste valide — l'émission de l'effectif
 * est un accessoire, jamais une condition de l'ajout.
 */
export type GlobalMembershipSocketManager = {
  broadcastMessage(message: unknown, conversationId: string): Promise<void>;
  getIO?(): ConversationRoomEmitter | null;
};

export type GlobalMembershipDeps = {
  readonly prisma: Pick<PrismaClient, 'conversation' | 'participant' | 'message'>;
  /** Résolu à l'appel — jamais capturé à la construction. Absent = pas de socket. */
  readonly resolveSocketManager?: () => GlobalMembershipSocketManager | null | undefined;
};

export type GlobalMembershipInput = {
  readonly userId: string;
  readonly displayName: string;
  /** @default 'member' — le rang d'un inscrit ordinaire (register, création admin). Le seed impose le sien (creator/admin) pour les comptes réservés. */
  readonly role?: MemberRoleType;
};

export type GlobalMembershipResult =
  | { readonly outcome: 'already-member'; readonly participantId: string }
  | { readonly outcome: 'joined'; readonly participantId: string }
  | { readonly outcome: 'no-global-conversation' };

/**
 * Permissions du salon global pour un membre ordinaire. `canViewHistory:
 * false` : l'inscrit lit le salon depuis son arrivée, comme tout membre
 * ajouté après coup (`services/historyFloor`) — un admin peut ensuite lui
 * ouvrir l'avant par date (`historyVisibleFrom`).
 */
const GLOBAL_MEMBER_PERMISSIONS = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
  canViewHistory: false,
} as const;

/**
 * Ajoute un utilisateur à la conversation globale "meeshy" — SOURCE UNIQUE,
 * partagée par l'inscription publique (`AuthService.register`), la création
 * d'un compte par un administrateur (`UserManagementService.createUser`) et
 * le seed (`InitService`). Avant #3876, les trois portes divergeaient : seule
 * l'inscription publique ajoutait l'utilisateur, et un compte créé par un
 * administrateur n'entrait JAMAIS dans le salon global.
 *
 * Idempotent : un appelant déjà membre ne crée rien de plus, et ne reposte pas
 * l'avis d'arrivée. Trouvé pendant ce lot : `InitService.createBigbossUser` /
 * `createAdminUser` appellent `AuthService.register()` — qui ajoute DÉJÀ
 * l'utilisateur au salon global en `member` (rôle par défaut) — puis
 * essayaient de créer une SECONDE ligne `Participant` en `creator`/`admin`
 * pour la MÊME paire `(conversationId, userId)` : violation de l'index unique
 * `unique_conversation_identity`, qui faisait ÉCHOUER (`throw`) l'ajout du
 * rang élevé et laissait BIGBOSS/ADMIN à `member` dans leur propre salon
 * global. Un appelant qui fournit un `role` EXPLICITE (le seed, jamais
 * l'inscription ni la création admin, qui laissent le défaut) et trouve une
 * participation existante d'un rang DIFFÉRENT la MET À NIVEAU au lieu de la
 * relire telle quelle — c'est le seul cas où « déjà membre » doit encore
 * écrire.
 *
 * Ne rejette PAS sur une panne de l'avis d'arrivée ou de l'émission
 * d'effectif — accessoires de l'ajout, jamais sa condition (même loi que
 * `postJoinSystemMessage`). Se propage en revanche si la CRÉATION ou la MISE
 * À NIVEAU de la participation échoue : c'est l'effet demandé, pas un à-côté.
 */
export async function ensureGlobalConversationMembership(
  deps: GlobalMembershipDeps,
  input: GlobalMembershipInput,
): Promise<GlobalMembershipResult> {
  const globalConversation = await deps.prisma.conversation.findFirst({
    where: { identifier: 'meeshy' },
  });
  if (!globalConversation) return { outcome: 'no-global-conversation' };

  const existing = await deps.prisma.participant.findFirst({
    where: { conversationId: globalConversation.id, userId: input.userId },
  });
  if (existing) {
    if (input.role && input.role !== existing.role) {
      await deps.prisma.participant.update({
        where: { id: existing.id },
        data: { role: input.role },
      });
    }
    return { outcome: 'already-member', participantId: existing.id };
  }

  const joinedAt = new Date();
  const created = await deps.prisma.participant.create({
    data: {
      conversationId: globalConversation.id,
      userId: input.userId,
      type: 'user',
      displayName: input.displayName,
      role: input.role ?? 'member',
      permissions: GLOBAL_MEMBER_PERMISSIONS,
      joinedAt,
      isActive: true,
    },
  });

  const socketManager = deps.resolveSocketManager?.();

  const broadcast: JoinSystemMessageDeps['broadcast'] = socketManager
    ? (message, conversationId) => socketManager.broadcastMessage(message, conversationId)
    : undefined;

  await postJoinSystemMessage(
    { prisma: deps.prisma, broadcast },
    {
      conversationId: globalConversation.id,
      participantId: created.id,
      displayName: input.displayName,
      isAnonymous: false,
      viaShareLink: false,
    },
  );

  await emitMemberCountBestEffort(deps, socketManager, {
    conversationId: globalConversation.id,
    userId: input.userId,
    displayName: input.displayName,
    joinedAt,
  });

  return { outcome: 'joined', participantId: created.id };
}

/**
 * Les titres qui ouvrent l'effectif ENTIER, traduits en requête : miroir de
 * `canViewExactMemberCount` (`@meeshy/shared/utils/member-visibility`), le rôle
 * PLATEFORME à partir de MODERATOR OU le rang DANS la conversation à partir
 * d'`admin`. Les DEUX casses du rang de conversation sont listées : un `in`
 * Prisma ne connaît pas `mode: 'insensitive'`, et les lignes écrites avant
 * #3875 portent encore `'ADMIN'`/`'CREATOR'` tant que
 * `scripts/migrations/normalize-participant-role-casing.ts` n'a pas tourné.
 */
const EXACT_COUNT_PLATFORM_ROLES = ['MODERATOR', 'ADMIN', 'BIGBOSS'] as const;
const EXACT_COUNT_CONVERSATION_ROLES = ['admin', 'creator', 'ADMIN', 'CREATOR'] as const;

/** Borne dure de l'éventail EXACT — un salon ne se lit jamais en entier ici. */
const EXACT_COUNT_AUDIENCE_LIMIT = 200;

const MEMBER_COUNT_AUDIENCE_SELECT = {
  id: true,
  userId: true,
  role: true,
  user: { select: { role: true } },
} as const;

/**
 * L'effectif temps réel — best-effort, séparé de l'écriture comme la
 * diffusion de l'avis d'arrivée : un salon sans socket, ou un socket tombé, ne
 * doit ni annuler l'ajout ni faire échouer l'inscription.
 *
 * **L'effectif se COMPTE, la liste ne se charge pas.** Ce site est le seul des
 * six appelants d'`emitConversationMemberCountEvent` à viser le salon GLOBAL,
 * qui contient par construction TOUS les inscrits — les cinq autres visent une
 * conversation ordinaire, bornée par sa taille. Charger l'audience entière pour
 * en prendre la LONGUEUR ramenait donc N lignes en mémoire à chaque création de
 * compte, et le fan-out qui suit chaîne un `.to()` par destinataire, or
 * `BroadcastOperator.to()` RECOPIE son Set de rooms à chaque appel
 * (`socket.io/dist/broadcast-operator.js`) : N(N+1)/2 insertions, synchrones,
 * sur la boucle d'événements, à chaque inscription.
 *
 * L'audience est donc bornée, et le plafond d'affichage est lui-même la borne
 * juste : AU-DESSUS de `MEMBER_COUNT_DISPLAY_CAP`, les lecteurs non autorisés
 * à l'effectif exact reçoivent une charge IDENTIQUE à celle que la room de
 * conversation porte déjà (`presentMemberCount` rend le même objet), donc leur
 * room personnelle n'apporte rien ; seuls les lecteurs à effectif EXACT en ont
 * encore besoin. SOUS le plafond, l'audience complète tient en ≤ 199 lignes et
 * le comportement est inchangé.
 */
async function emitMemberCountBestEffort(
  deps: GlobalMembershipDeps,
  socketManager: GlobalMembershipSocketManager | null | undefined,
  params: { conversationId: string; userId: string; displayName: string; joinedAt: Date },
): Promise<void> {
  const io = socketManager?.getIO?.();
  if (!io) return;

  try {
    const memberCount = await deps.prisma.participant.count({
      where: { conversationId: params.conversationId, isActive: true },
    });

    const others = { conversationId: params.conversationId, isActive: true, NOT: { userId: params.userId } };
    const audience = memberCount <= MEMBER_COUNT_DISPLAY_CAP
      ? await deps.prisma.participant.findMany({
          where: others,
          select: MEMBER_COUNT_AUDIENCE_SELECT,
          take: MEMBER_COUNT_DISPLAY_CAP,
        })
      : await deps.prisma.participant.findMany({
          where: {
            ...others,
            OR: [
              { role: { in: [...EXACT_COUNT_CONVERSATION_ROLES] } },
              { user: { role: { in: [...EXACT_COUNT_PLATFORM_ROLES] } } },
            ],
          },
          select: MEMBER_COUNT_AUDIENCE_SELECT,
          take: EXACT_COUNT_AUDIENCE_LIMIT,
        });

    emitConversationMemberCountEvent({
      io,
      conversationId: params.conversationId,
      participants: audience,
      event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED,
      payload: {
        conversationId: params.conversationId,
        userId: params.userId,
        displayName: params.displayName,
        joinedAt: params.joinedAt.toISOString(),
      },
      memberCount,
    });
  } catch (error) {
    logger.warn('member count event not emitted', {
      conversationId: params.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
