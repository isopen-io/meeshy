import { z } from 'zod';

import { CALL_REACTION_EMOJIS, type CallControlErrorCode, type CallReactionEmoji } from './call-control-law.js';

export * from './call-control-law.js';

/**
 * Les contrôles d'un appel EN COURS — inviter une personne (#8433), couper le
 * micro d'un participant (#8438), réagir (#8439).
 *
 * Les schémas sont la loi de FORME, écrite une fois pour la passerelle (qui les
 * exécute à la frontière du socket) et pour les clients (qui peuvent refuser
 * avant l'aller-retour). Les types en dérivent. Qui a le DROIT de faire quoi ne
 * se lit pas ici : c'est la passerelle qui le décide, sur l'état de l'appel.
 */

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

/** Client → serveur : inviter `userId` (un ami accepté) dans l'appel en cours. */
export const callInviteParticipantSchema = z
  .object({ callId: objectId, userId: objectId })
  .strict();

export type CallInviteParticipantEvent = z.infer<typeof callInviteParticipantSchema>;

/**
 * Client → serveur : couper le micro de `targetUserId` — la clé du roster
 * (`userId` d'un inscrit, `participantId` d'un anonyme). Il n'existe pas de
 * « rallumer » : seul le participant rouvre son propre micro.
 */
export const callMuteParticipantSchema = z
  .object({ callId: objectId, targetUserId: z.string().min(1).max(64) })
  .strict();

export type CallMuteParticipantEvent = z.infer<typeof callMuteParticipantSchema>;

/** Client → serveur : envoyer une réaction à tout l'appel. */
export const callReactionSchema = z
  .object({ callId: objectId, emoji: z.enum(CALL_REACTION_EMOJIS) })
  .strict();

export type CallReactionEvent = z.infer<typeof callReactionSchema>;

/** L'accusé commun aux trois verbes. */
export type CallControlAck =
  | { readonly success: true }
  | { readonly success: false; readonly code: CallControlErrorCode };

export type CallInvitedUser = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

/**
 * Serveur → participants de l'appel : une personne vient d'être invitée et
 * sonne. `isGroup` est vrai dès qu'une invitation existe — un duo qui en reçoit
 * une devient un appel de groupe, et le client bascule sa présentation.
 */
export type CallParticipantInvitedEvent = {
  readonly callId: string;
  readonly invitedBy: string;
  readonly invitee: CallInvitedUser;
  readonly participantCount: number;
  readonly isGroup: true;
};

/**
 * Serveur → les participants : l'invitation de `userId` s'est résolue sans
 * décroché — refusée (`call:invite-declined`) ou restée sans réponse
 * (`call:invite-expired`). Sa puce « Sonne… » s'en va et l'inviteur le lit.
 */
export type CallInviteSettledEvent = {
  readonly callId: string;
  readonly userId: string;
};

/**
 * Serveur → la personne visée SEULEMENT : son micro a été coupé par
 * `byUserId`. Le client coupe lui-même sa piste ; il peut la rouvrir.
 */
export type CallMutedByModeratorEvent = {
  readonly callId: string;
  readonly byUserId: string;
};

/** Serveur → les autres participants connectés de l'appel. */
export type CallReactionReceivedEvent = {
  readonly callId: string;
  readonly userId: string;
  readonly emoji: CallReactionEmoji;
  readonly at: string;
};
