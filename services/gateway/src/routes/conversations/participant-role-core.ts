import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { isMemberCreator, MemberRole } from '@meeshy/shared/types/role-types';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getPresenceVisibilityService, type PresenceViewer } from '../../services/PresenceVisibilityService';
import { presenceFor } from '../users/presence-gate';
import { resolveTargetParticipant } from './utils/target-participant';
import { participantActionRefusal } from './utils/participant-authority';
import { participantListUserSelect } from './utils/participant-projection';
import { accorder, refuser, type VerdictDeGeste } from './utils/participant-geste-verdict';
import type { PasserelleSocketDeConversation } from './utils/participant-geste-socket';

const logger = enhancedLogger.child({ module: 'ConversationParticipantRoleCore' });

/**
 * **Le NOYAU de `PATCH …/participants/:userId/role`** — extrait de
 * `participant-role.ts` le 2026-09-01 (#4713).
 *
 * Tout ce qui DÉCIDE vit ici : la normalisation du rang demandé, la résolution
 * de la conversation, l'appartenance et le rang du demandeur, le plancher
 * `ADMIN`, les deux gardes d'auto-modification, la protection du créateur, la
 * comparaison de rang (`participantActionRefusal`), l'exigence d'un compte,
 * l'écriture, la relecture gatée par la présence, la diffusion et la
 * notification. Le gestionnaire ne garde que le schéma, l'authentification et
 * la traduction du verdict — patron de `chargerPostsProches`
 * (`routes/posts/nearby.ts`, #4346).
 *
 * L'extraction est un DÉPLACEMENT : aucun ordre d'appel Prisma n'a bougé,
 * aucun message ni statut de refus n'a changé.
 *
 * ─── Ce que le noyau ne calcule PAS lui-même ────────────────────────────────
 *
 * `viewer` arrive en paramètre. Il se lit sur la REQUÊTE
 * (`viewerFromRequest`), qui est précisément ce qu'un noyau appelable ne doit
 * pas connaître — même raison que `reader` dans `chargerPostsProches`. Le
 * gestionnaire le résout et le remet ; la LOI de présence, elle, reste
 * entièrement ici.
 */

/** Ce que le service de notification doit savoir faire — rien de plus. */
export interface AvisDeChangementDeRang {
  createMemberRoleChangedNotification(params: {
    recipientUserId: string;
    changedByUserId: string;
    conversationId: string;
    newRole: 'ADMIN' | 'MODERATOR' | 'MEMBER';
    previousRole: string;
  }): Promise<unknown>;
}

export type RangDeParticipantServi = {
  readonly message: string;
  readonly userId: string;
  readonly participantId: string;
  readonly role: string;
  readonly participant: ReturnType<typeof serializeConversationParticipant> | null;
};

export type DemandeDeRangDeParticipant = {
  readonly prisma: PrismaClient;
  /** Le segment d'URL : un `Conversation.id` ou un identifiant lisible. */
  readonly conversationIdentifier: string;
  /** Le segment d'URL de la CIBLE : un `User.id` **ou** un `Participant.id`. */
  readonly targetKey: string;
  readonly role: string;
  readonly currentUserId: string;
  readonly viewer: PresenceViewer;
  readonly socketIO: PasserelleSocketDeConversation | null | undefined;
  readonly notifications: AvisDeChangementDeRang | null | undefined;
};

const RANGS_ACCEPTES: readonly string[] = ['admin', 'moderator', 'member'];

export async function changerRangDeParticipant(
  demande: DemandeDeRangDeParticipant,
): Promise<VerdictDeGeste<RangDeParticipantServi>> {
  const { prisma, conversationIdentifier, targetKey, currentUserId } = demande;

  const normalizedRole = demande.role.toLowerCase()
  if (!RANGS_ACCEPTES.includes(normalizedRole)) {
    return refuser(400, 'Invalid role. Accepted roles are: admin, moderator, member');
  }

  const conversationId = await resolveConversationId(prisma, conversationIdentifier);
  if (!conversationId) {
    return refuser(403, 'Unauthorized access to this conversation');
  }

  const currentUserParticipant = await prisma.participant.findFirst({
    where: {
      conversationId: conversationId,
      userId: currentUserId,
      isActive: true
    },
    include: {
      user: true
    }
  });

  if (!currentUserParticipant) {
    return refuser(403, 'Unauthorized access to this conversation');
  }

  const actor = {
    conversationRole: currentUserParticipant.role,
    platformRole: currentUserParticipant.user?.role,
  };

  // Le PLANCHER, opposé avant même de chercher la cible : un simple membre
  // n'a rien à apprendre de l'existence — ou non — de la ligne qu'il visait.
  if (!actorHasMinimumRole(actor, MemberRole.ADMIN)) {
    return refuser(403, 'Vous n\'avez pas les droits pour modifier les rôles des participants');
  }

  if (targetKey === currentUserId) {
    return refuser(400, 'You cannot modify your own role');
  }

  // La cible se résout sous les DEUX colonnes, comme `/ban` et `DELETE` :
  // `:userId` porte un `User.id` pour un membre inscrit, un `Participant.id`
  // pour qui est venu par un lien partagé. Le `findFirst` sur la seule
  // colonne `userId` ne trouvait jamais les seconds — et répondait
  // « participant introuvable », ce qui est faux : il existe, c'est la
  // question qui était mal posée.
  const targetParticipant = await resolveTargetParticipant(prisma, conversationId, targetKey);

  // `isActive` est vérifié ICI plutôt que dans le `where` : le résolveur
  // partagé ne filtre pas — bannir un ex-membre est un geste légitime, et
  // c'est l'appelant qui dit ce qu'il exige de l'état. Changer le rang de
  // quelqu'un qui est parti n'a, lui, aucun sens.
  if (!targetParticipant || !targetParticipant.isActive) {
    return refuser(404, 'Participant not found or inactive');
  }

  // La garde plus haut compare le segment d'URL ; celle-ci compare
  // l'identité RÉSOLUE, ce qui couvre l'admin qui se désignerait par son
  // propre `Participant.id`.
  if (targetParticipant.userId === currentUserId || targetParticipant.id === currentUserId) {
    return refuser(400, 'You cannot modify your own role');
  }

  // Protection, pas permission : sur une ligne `CREATOR` l'égalité
  // stricte ne tirait pas et le créateur devenait rétrogradable (#4008).
  // Reste AVANT la comparaison de rang, et pas seulement par habitude : les
  // deux refusent, mais celui-ci NOMME la raison — « on ne touche pas au
  // créateur » — là où l'autre dirait seulement « vous n'êtes pas assez
  // haut », ce qui laisserait croire qu'un rang de plus suffirait.
  if (isMemberCreator(targetParticipant.role ?? 'member')) {
    return refuser(403, 'Cannot modify the conversation creator\'s role');
  }

  // La LOI, enfin — celle que `/ban` portait seul. Sans elle, un
  // administrateur rétrogradait ses pairs.
  const refusal = participantActionRefusal({
    actor,
    targetRole: targetParticipant.role,
    floor: MemberRole.ADMIN,
  });
  if (refusal) {
    return refuser(
      403,
      refusal === 'below-floor'
        ? 'Vous n\'avez pas les droits pour modifier les rôles des participants'
        : 'Vous ne pouvez pas modifier le rang d\'un participant de rang égal ou supérieur au vôtre',
    );
  }

  // Le résolveur atteint désormais un visiteur SANS COMPTE ; l'événement qui
  // annonce le changement, non. `ParticipantRoleUpdatedEvent.userId` est
  // déclaré NON optionnel chez les trois clients (Android l'a déjà payé une
  // fois : un champ manquant y faisait lever `MissingFieldException`, avalée
  // par le `runCatching` du listener — plus AUCUN changement de rang
  // n'atteignait le trombinoscope, en silence). Émettre `null` ferait perdre
  // l'événement ENTIER, pas seulement ce champ (#4009).
  //
  // On refuse donc explicitement, plutôt que de mentir dans les deux sens :
  // 404 « introuvable » était faux — la ligne existe —, et servir la
  // mutation en perdant sa diffusion l'aurait été plus encore. Le jour où
  // les trois décodeurs acceptent `userId: null` + `participantId`, cette
  // garde tombe et rien d'autre ne bouge.
  if (!targetParticipant.userId) {
    return refuser(
      400,
      'A participant without an account cannot hold a conversation rank yet',
      'PARTICIPANT_HAS_NO_ACCOUNT',
    );
  }

  const targetUserId = targetParticipant.userId;
  const newRole = normalizedRole;
  await prisma.participant.update({
    where: {
      id: targetParticipant.id
    },
    data: {
      role: newRole
    }
  });

  const updatedRow = await prisma.participant.findUnique({
    where: { id: targetParticipant.id },
    include: participantListUserSelect
  });

  // Cette route servait `updatedRow` TEL QUEL sous la clé `participant`, que
  // `conversationParticipantSchema` déclare. La réponse REST est gatée par
  // le viewer DEMANDEUR (régime STRICT — self/ADMIN+/ami) : elle seule a
  // un destinataire nommé capable de porter une visibilité. La diffusion
  // Socket.IO plus bas n'en a pas — toute la salle la reçoit — donc son
  // `participant` ne transporte plus `isOnline`/`lastActiveAt` du tout,
  // gaté ou non ; le type partagé (`ParticipantRoleUpdatedEventData`) ne
  // les déclare déjà pas.
  const rolePresenceViewer = demande.viewer;
  const rolePresenceVis = updatedRow?.userId
    ? await getPresenceVisibilityService(prisma).resolveForTarget(rolePresenceViewer, {
        id: updatedRow.userId,
        deactivatedAt: updatedRow.user?.deactivatedAt ?? null
      })
    : presenceFor(rolePresenceViewer, new Map(), null);
  const updatedParticipant = updatedRow
    ? serializeConversationParticipant(updatedRow, { presence: rolePresenceVis })
    : null;
  const participantForBroadcast = updatedParticipant
    ? (() => {
        const { isOnline: _broadcastIsOnline, lastActiveAt: _broadcastLastActiveAt, ...rest } = updatedParticipant;
        return rest;
      })()
    : null;

  const manager = demande.socketIO?.getManager();
  if (manager) {
    // Thread-only À JUSTE TITRE, vérifié plutôt que déduit — noté ici pour
    // qu'un prochain balayage de `to(ROOMS.conversation(` ne le rouvre pas.
    // Aucune ligne de liste ne rend un rôle : les seuls consommateurs sont
    // les écrans de participants (web `use-participants`, iOS
    // `ParticipantsView` / `ConversationSocketHandler`), tous ouverts DANS
    // la conversation. Élargir l'audience coûterait une requête et
    // diffuserait la hiérarchie d'un groupe à des écrans qui ne l'affichent
    // pas. À revoir seulement si la ligne de liste se met à montrer un rang.
    manager.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
      conversationId,
      // La cible RÉSOLUE, jamais le segment d'URL : celui-ci peut porter un
      // `Participant.id`, et recopier un `Participant.id` dans un champ qui
      // déclare un `User.id` est exactement ce que le CLAUDE.md du gateway
      // interdit.
      userId: targetUserId,
      newRole,
      updatedBy: currentUserId,
      participant: participantForBroadcast
    });
    // Invalidate the in-process participant-ID cache so the next message:send
    // from this user re-validates membership/role against the DB instead of
    // serving a stale 5-minute cached entry.
    manager.invalidateParticipantCache?.(targetUserId, conversationId);
  }

  const notificationService = demande.notifications;
  if (notificationService) {
    notificationService.createMemberRoleChangedNotification({
      recipientUserId: targetUserId,
      changedByUserId: currentUserId,
      conversationId,
      newRole: newRole.toUpperCase() as 'ADMIN' | 'MODERATOR' | 'MEMBER',
      previousRole: targetParticipant.role,
    }).catch((err: unknown) => logger.error('Notification error role_changed', err as Error));
  }

  return accorder({
    message: 'Rôle du participant mis à jour avec succès',
    userId: targetUserId,
    participantId: targetParticipant.id,
    role: newRole,
    participant: updatedParticipant
  });
}
