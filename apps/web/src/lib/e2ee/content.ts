/**
 * CE QUE LIBSIGNAL CHIFFRE (spec § 4.2, #14592) : jamais le texte nu, la
 * structure versionnée `E2EEContent`, miroir à l'octet de
 * `packages/MeeshySDK/Sources/MeeshyE2EE/E2EEContent.swift` — JSON canonique,
 * clés triées, aucun champ absent écrit. Tout ce qui part à côté du corps (la
 * langue, la citation, la conversation, l'auteur) voyage DEDANS.
 */
import { e2eePaddedLength } from './wire';

export const E2EE_CONTENT_VERSION = 1;

export type E2EEContent = {
  readonly v: number;
  readonly text?: string;
  readonly language?: string;
  readonly replyTo?: string;
  readonly conversationId?: string;
  readonly clientMessageId?: string;
  readonly sentAt: number;
  readonly authorUserId?: string;
  readonly authorDeviceId?: number;
};

export class E2EEContentError extends Error {
  constructor(readonly reason: 'unsupported-version' | 'malformed' | 'misattributed' | 'misattributed-author') {
    super(`e2ee content: ${reason}`);
    this.name = 'E2EEContentError';
  }
}

type Draft = {
  readonly text?: string | null;
  readonly language?: string | null;
  readonly replyTo?: string | null;
  readonly conversationId: string;
  readonly clientMessageId?: string | null;
  readonly sentAt: number;
};

const present = <T>(key: string, value: T | null | undefined): Record<string, T> => (value === null || value === undefined ? {} : { [key]: value });

export function e2eeContent(draft: Draft): E2EEContent {
  return {
    v: E2EE_CONTENT_VERSION,
    sentAt: Math.round(draft.sentAt),
    conversationId: draft.conversationId,
    ...present('text', draft.text),
    ...present('language', draft.language),
    ...present('replyTo', draft.replyTo),
    ...present('clientMessageId', draft.clientMessageId),
  };
}

export const authored = (content: E2EEContent, userId: string, deviceId: number): E2EEContent => ({
  ...content,
  authorUserId: userId,
  authorDeviceId: deviceId,
});

/** L'auteur porté dans le chiffré est-il l'expéditeur annoncé ? Un contenu sans auteur (client plus ancien) n'en dit rien. */
export function isAuthoredBy(content: E2EEContent, userId: string, deviceId: number): boolean {
  if (content.authorUserId === undefined || content.authorDeviceId === undefined) {
    return content.authorUserId === undefined && content.authorDeviceId === undefined;
  }
  return content.authorUserId === userId && content.authorDeviceId === deviceId;
}

export const belongsTo = (content: E2EEContent, conversationId: string): boolean => content.conversationId === conversationId;

/** JSON canonique : clés triées, aucun champ absent. */
export function encodeContent(content: E2EEContent): Uint8Array {
  const sorted = Object.fromEntries(
    Object.entries(content)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  return new TextEncoder().encode(JSON.stringify(sorted));
}

const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new E2EEContentError('malformed');
  return value;
};

/** Refuse une version que cet appareil ne sait pas lire : un message d'une version future ne s'affiche jamais à moitié. */
export function decodeContent(plaintext: Uint8Array): E2EEContent {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  } catch {
    throw new E2EEContentError('malformed');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new E2EEContentError('malformed');
  const record = raw as Readonly<Record<string, unknown>>;
  if (typeof record.v !== 'number') throw new E2EEContentError('malformed');
  if (record.v !== E2EE_CONTENT_VERSION) throw new E2EEContentError('unsupported-version');
  if (typeof record.sentAt !== 'number' || !Number.isFinite(record.sentAt)) throw new E2EEContentError('malformed');
  const authorDeviceId = record.authorDeviceId;
  if (authorDeviceId !== undefined && authorDeviceId !== null && (typeof authorDeviceId !== 'number' || !Number.isInteger(authorDeviceId))) {
    throw new E2EEContentError('malformed');
  }
  const text = optionalString(record.text);
  const language = optionalString(record.language);
  const replyTo = optionalString(record.replyTo);
  const conversationId = optionalString(record.conversationId);
  const clientMessageId = optionalString(record.clientMessageId);
  const authorUserId = optionalString(record.authorUserId);
  return {
    v: record.v,
    sentAt: record.sentAt,
    ...present('text', text),
    ...present('language', language),
    ...present('replyTo', replyTo),
    ...present('conversationId', conversationId),
    ...present('clientMessageId', clientMessageId),
    ...present('authorUserId', authorUserId),
    ...present('authorDeviceId', typeof authorDeviceId === 'number' ? authorDeviceId : undefined),
  };
}

/** Un clair déchiffré porte un message (`v`) ou un signal (`s`, #13142). */
export function payloadKindOf(plaintext: Uint8Array): 'message' | 'signal' {
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(plaintext));
    return typeof raw === 'object' && raw !== null && typeof Reflect.get(raw, 's') === 'number' ? 'signal' : 'message';
  } catch {
    return 'message';
  }
}

/** Le remplissage par ESPACES au palier (`E2EEPadding`, #13142) : un JSON suivi d'espaces reste valide. */
export function padded(plaintext: Uint8Array, recipients: number): Uint8Array {
  const target = e2eePaddedLength(plaintext.length, recipients);
  if (target <= plaintext.length) return plaintext;
  const out = new Uint8Array(target).fill(0x20);
  out.set(plaintext);
  return out;
}
