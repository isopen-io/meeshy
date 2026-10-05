/**
 * LA LOI SANS DÉPENDANCE des contrôles d'un appel (#8433, #8438, #8439) — la
 * liste fermée des réactions, les codes d'accusé et la relecture des comptes
 * persistés. Aucun schéma ici : un client qui ne lit que ces constantes (le
 * web, qui compte ses kilo-octets) ne paie pas Zod. `call-controls.ts` les
 * RÉEXPORTE, et ses schémas s'y adossent.
 */

/**
 * Les huit réactions d'un appel. Liste FERMÉE : un emoji hors liste est refusé
 * à la frontière, et un compte lu en base qui n'y figure pas est ignoré.
 */
export const CALL_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👏', '🎉', '🔥'] as const;

export type CallReactionEmoji = typeof CALL_REACTION_EMOJIS[number];

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
