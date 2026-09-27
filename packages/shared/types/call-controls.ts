import { z } from 'zod';

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

/**
 * Les huit réactions d'un appel. Liste FERMÉE : un emoji hors liste est refusé
 * à la frontière, et un compte lu en base qui n'y figure pas est ignoré.
 */
export const CALL_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🎉', '🔥'] as const;

export type CallReactionEmoji = typeof CALL_REACTION_EMOJIS[number];

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

export const CALL_CONTROL_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'VALIDATION_ERROR',
  'RATE_LIMITED',
  'NOT_A_PARTICIPANT',
  'CALL_NOT_ACTIVE',
  'NOT_A_CONTACT',
  'ALREADY_IN_CALL',
  'MAX_PARTICIPANTS_REACHED',
  'TARGET_NOT_IN_CALL',
  'PERMISSION_DENIED',
  'INTERNAL_ERROR',
] as const;

export type CallControlErrorCode = typeof CALL_CONTROL_ERROR_CODES[number];

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

export type CallReactionCounts = Partial<Record<CallReactionEmoji, number>>;

const KNOWN_EMOJIS: ReadonlySet<string> = new Set(CALL_REACTION_EMOJIS);

export const isCallReactionEmoji = (value: string): value is CallReactionEmoji => KNOWN_EMOJIS.has(value);

/** Les comptes persistés (`CallSession.reactionCounts`), relus sans confiance. */
export function parseCallReactionCounts(raw: unknown): CallReactionCounts {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.entries(raw).reduce<CallReactionCounts>(
    (counts, [emoji, count]) =>
      isCallReactionEmoji(emoji) && typeof count === 'number' && Number.isInteger(count) && count > 0
        ? { ...counts, [emoji]: count }
        : counts,
    {}
  );
}
