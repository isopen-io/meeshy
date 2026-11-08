/**
 * Les sessions INVITÉES d'un lien de partage — `PATCH|DELETE /guest-sessions/me`
 * et leurs adaptateurs `POST /anonymous/refresh|leave` (#4167). Extrait de
 * `link-admission.ts`, qui garde l'ENTRÉE par lien : ici vit ce qui prolonge
 * ou termine une session déjà ouverte.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { hashSessionToken } from '../../utils/session-token';
import { isConversationClosed } from '../../services/messaging/conversationWriteAdmission';
import { announceConversationLanguageChange } from '../../services/message-translation/conversationLanguageChanges';
import { guestAccessEnd } from '../../services/guestAccessEnd';
import { guestShareLinkId } from '../../services/shareLinkReadGate';
import type { ParticipantRow, ShareLinkWithConversation } from './link-admission';
import { PARTICIPATION_VIVANTE } from './utils/access-control';
import { identifyTarget } from './utils/target-participant';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import {
  endConversationMembership,
  type ConversationMembershipEnd,
  type MembershipRoomReader,
} from '../../socketio/endConversationMembership';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConversationRoomEmitter } from '../../socketio/emitToConversationParticipants';
import { logError } from '../../utils/logger';

export interface GuestSessionParams {
  readonly prisma: PrismaClient;
  readonly sessionToken: string;
}

/**
 * Ce que la SORTIE d'un invité demande de plus que sa persistance — la
 * CINQUIÈME porte de fin d'appartenance (`socketio/endConversationMembership.ts`,
 * dont l'en-tête n'en énumère que quatre).
 *
 * Les deux capacités sont OPTIONNELLES et pour la même raison que partout
 * ailleurs sur ce chemin : l'annonce et l'éviction sont des canaux LATÉRAUX,
 * la sortie est le fait. Une passerelle sans couche socket (script, outil,
 * test) termine la session sans rien annoncer.
 */
/** La ligne d'invité que la sortie manipule — ce que `findFirst` rend, sans projection. */
type GuestParticipantRow = Parameters<typeof identifyTarget>[0] & {
  readonly conversationId: string;
  readonly displayName: string | null;
};

export interface GuestDepartureChannels {
  /**
   * Les DEUX capacités de la couche socket que cette porte emploie, et le type
   * les demande ENSEMBLE : `ConversationRoomEmitter` pour ANNONCER (`to`), et
   * `MembershipRoomReader` pour ÉVINCER (`in`). Déclarer le seul émetteur
   * compilait et aurait laissé l'éviction sans son verbe — le compilateur l'a
   * refusé, et c'est la bonne réponse : les deux moitiés de cette porte ne se
   * servent pas du même appel.
   */
  readonly io?: (ConversationRoomEmitter & MembershipRoomReader) | null;
  readonly manager?: ConversationMembershipEnd['manager'];
}

export type RefreshGuestSessionOutcome =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'revoked' }
  | { readonly kind: 'link-gone' }
  | { readonly kind: 'link-expired' }
  | { readonly kind: 'conversation-closed' }
  | { readonly kind: 'refreshed'; readonly participant: ParticipantRow; readonly shareLink: ShareLinkWithConversation };

/**
 * Cœur de `PATCH /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/refresh`. Gagne la garde `isConversationClosed` que la porte
 * historique n'avait jamais eue — critère de fin #4 de #4167.
 *
 * #10457 — une participation MORTE (désactivée OU bannie) rend `revoked`, le
 * 410 `GUEST_ACCESS_REVOKED` des autres portes, sans rien servir de la
 * conversation ni relancer la présence. Un banni encore actif obtenait
 * `refreshed` ; un désactivé, le 401 d'un jeton inventé. L'ordre est celui des
 * autres portes (`guestAccessEnd`) : lien expiré d'abord.
 */
export async function refreshGuestSession(params: GuestSessionParams): Promise<RefreshGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'invalid' };

  // #10464 — le lien se lit comme aux autres portes : la colonne de la
  // participation d'abord, la session embarquée en repli.
  const shareLinkId = guestShareLinkId(participant);
  const shareLink = shareLinkId
    ? ((await prisma.conversationShareLink.findUnique({
        where: { id: shareLinkId },
        include: {
          conversation: { select: { id: true, identifier: true, title: true, type: true, isActive: true, closedAt: true } },
        },
      })) as ShareLinkWithConversation | null)
    : null;

  const end = guestAccessEnd({
    linkExpiresAt: shareLink?.expiresAt ?? null,
    linkRevocationPendingAt: shareLink?.guestRevocationPendingAt ?? null,
    participation: participant,
    now: new Date(),
  });
  if (end === 'link-expired') return { kind: 'link-expired' };
  if (end === 'revoked') return { kind: 'revoked' };
  if (!shareLink || !shareLink.isActive) return { kind: 'link-gone' };
  if (isConversationClosed(shareLink.conversation)) return { kind: 'conversation-closed' };

  await prisma.participant.update({
    where: { id: participant.id },
    data: { lastActiveAt: new Date(), isOnline: true },
  });

  return { kind: 'refreshed', participant, shareLink };
}

export type EndGuestSessionOutcome = { readonly kind: 'not-found' } | { readonly kind: 'ended' };

/**
 * Cœur de `DELETE /guest-sessions/me`, partagé avec l'adaptateur `POST
 * /anonymous/leave`. IDEMPOTENT — critère de fin #4 de #4167.
 *
 * #10472 — la désactivation est CONDITIONNELLE (`isActive: true` dans le
 * `where`) : seule l'écriture qui fait passer la ligne à inactif annonce le
 * départ et libère la place. Une sortie concurrente d'une révocation de lien
 * (ou d'une autre sortie) ne réécrit plus son `leftAt` et ne décrémente plus
 * deux fois. Le décrément est BORNÉ à un compteur positif, et un lien supprimé
 * entre-temps ne fait plus lever P2025 (`updateMany` rend 0, la sortie
 * réussit).
 */
/**
 * Annonce le départ de l'invité aux autres membres, puis le sort du fil.
 *
 * L'ORDRE est celui des quatre jumelles, et il n'est pas indifférent :
 * l'annonce voyage par la room de conversation, dont `endConversationMembership`
 * fait précisément sortir le partant. Évincé d'abord, il n'apprendrait jamais
 * son propre départ — et c'est par ce même canal que son appareil apprend de
 * cesser d'émettre sa position (voir l'en-tête de `endConversationMembership`).
 *
 * L'effectif est ABSOLU et gratuit : `remaining` est déjà chargé pour nommer
 * les rooms personnelles. Un client qui soustrait 1 ne converge jamais d'un
 * événement manqué, et les deux clients PERSISTENT ce qu'ils ont.
 */
async function announceGuestDeparture(
  params: GuestSessionParams & GuestDepartureChannels,
  // La LIGNE entière, pas une projection : `identifyTarget` prend un
  // `TargetParticipantRow` — c'est lui qui porte la loi « `userId` déclare un
  // `User.id`, `null` pour un visiteur sans compte », et la réécrire ici est ce
  // que le CLAUDE.md interdit. La ligne vient d'un `findFirst` sans `select`,
  // donc elle la satisfait déjà.
  participant: GuestParticipantRow,
): Promise<void> {
  const { prisma, io, manager } = params;
  if (!io && !manager) return;

  try {
    // Les membres qui RESTENT : l'audience des rooms personnelles et, par leur
    // nombre, l'effectif servi. Le sortant est déjà inactif en base (l'écriture
    // au-dessus a réussi), donc `PARTICIPATION_VIVANTE` l'exclut de lui-même —
    // pas de soustraction à faire, pas de fenêtre où il se compterait encore.
    const remaining = await prisma.participant.findMany({
      where: { conversationId: participant.conversationId, ...PARTICIPATION_VIVANTE },
      select: { id: true, userId: true },
    });

    emitConversationMemberCountEvent({
      io,
      conversationId: participant.conversationId,
      participants: remaining,
      event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
      payload: {
        conversationId: participant.conversationId,
        ...identifyTarget(participant),
        displayName: participant.displayName ?? '',
        leftAt: new Date().toISOString(),
      },
      memberCount: remaining.length,
    });
  } catch (error) {
    logError(
      `guest departure fan-out failed (conversation ${participant.conversationId})`,
      error,
    );
  }

  // L'éviction est indépendante de l'annonce : une lecture de membres qui tombe
  // ne doit pas laisser le sortant dans la room, avec sa position vive et son
  // appel en cours. C'est la leçon des quatre jumelles — « sortir quelqu'un
  // d'un fil n'est pas le retirer d'une room : c'est éteindre ce qu'il y tenait
  // de vivant, PUIS l'en sortir ».
  //
  // La clé est `userId ?? id` : elle NOMME la room personnelle du partant, et
  // un invité de lien partagé n'a pas de ligne `User`.
  try {
    await endConversationMembership({
      io,
      manager,
      conversationId: participant.conversationId,
      userId: participant.userId ?? participant.id,
    });
  } catch (error) {
    logError(
      `guest departure membership teardown failed (conversation ${participant.conversationId})`,
      error,
    );
  }
}

export async function endGuestSession(params: GuestSessionParams & GuestDepartureChannels): Promise<EndGuestSessionOutcome> {
  const { prisma, sessionToken } = params;
  const tokenHash = hashSessionToken(sessionToken);

  const participant = await prisma.participant.findFirst({
    where: { sessionTokenHash: tokenHash, type: 'anonymous' },
  });
  if (!participant) return { kind: 'not-found' };
  if (!participant.isActive) return { kind: 'ended' };

  const ended = await prisma.participant.updateMany({
    where: { id: participant.id, isActive: true },
    data: { isActive: false, isOnline: false, leftAt: new Date() },
  });
  if (ended.count === 0) return { kind: 'ended' };

  announceConversationLanguageChange({ kind: 'departure', conversationId: participant.conversationId });

  // #16948 — LA CINQUIÈME PORTE. `endConversationMembership` ouvre sur « Quatre
  // chemins mettent fin à l'appartenance » : quitter, être banni, être retiré,
  // supprimer le fil pour soi. La sortie d'invité n'est dans aucune de ces
  // listes, et elle n'y pouvait pas être : le lot qui les a fermées a fermé
  // « les verbes qui retirent un MEMBRE », et celle-ci est un verbe de SESSION.
  //
  // Deux moitiés indépendantes, et elles manquaient toutes les deux.
  //
  // 1. LES AUTRES ne savaient rien. Le web ne retire une rangée du
  //    trombinoscope que sur `conversation:participant-left` / `-banned`, et
  //    iOS POSE l'effectif ABSOLU que ces événements portent. L'effectif d'une
  //    conversation à invités ne pouvait donc DÉRIVER QUE VERS LE HAUT —
  //    l'inverse exact de ce que le commentaire de `memberArrivalFanOut.ts`
  //    affirmait, en ne comptant pas cette porte.
  // 2. LE SORTANT gardait tout : sa socket restait dans la room du fil, donc il
  //    continuait d'en recevoir les messages ; son partage de position vive, sa
  //    participation d'appel et son marqueur « ici » restaient actifs ; et son
  //    cache d'appartenance le laissait écrire.
  //
  // Aucun changement de contrat : `ConversationParticipantLeftEventData`
  // déclare `participantId` toujours présent et `userId: string | null` —
  // « `null` quand la personne n'a PAS de compte ». `identifyTarget` est le
  // helper qui l'écrit, et le seul : y recopier le `Participant.id` dans
  // `userId` est ce que le CLAUDE.md interdit explicitement.
  //
  // Best-effort de bout en bout : la sortie est PERSISTÉE quand ce bloc
  // s'exécute, et une lecture de membres qui tombe ne doit pas la faire
  // échouer — l'invité rejouerait un geste qui a pris effet.
  await announceGuestDeparture(params, participant);

  // #10468 — la place se libère sur le lien qui l'a comptée, lu comme aux
  // autres portes : la colonne d'abord, la session embarquée en repli.
  const shareLinkId = guestShareLinkId(participant);
  if (shareLinkId) {
    await prisma.conversationShareLink.updateMany({
      where: { id: shareLinkId, currentConcurrentUsers: { gt: 0 } },
      data: { currentConcurrentUsers: { decrement: 1 } },
    });
  }

  return { kind: 'ended' };
}
