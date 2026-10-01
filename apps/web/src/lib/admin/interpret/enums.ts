import type { AdminGlyphName } from '@/components/glyphs-admin';
import { translateAdmin, translateAdminMaybe, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { AdminTone, Interpreted } from './types';

/**
 * LES ÉNUMÉRATIONS SERVIES, NOMMÉES (#8876) — une table par famille, un seul
 * interprète pour toutes.
 *
 * Le code brut ne vit JAMAIS dans `label` : un code que la table ne connaît pas
 * se dit « Non reconnu » et n'est gardé que dans `raw`. La recherche du code est
 * insensible à la casse — la passerelle sert `pending` ici et `PENDING` là — et
 * les clés de catalogue se COMPOSENT depuis la famille et le code
 * (`admin.enum.<famille>.<code>`, `.explain`) ; `enums.test.ts` mesure que
 * chacune existe dans les sept langues.
 */
type Explain = 'code' | 'family';
type Entry = { readonly tone: AdminTone; readonly glyph?: AdminGlyphName; readonly explain?: Explain };
type Table = Readonly<Record<string, Entry>>;

const N: Entry = { tone: 'neutral' };
const B: Entry = { tone: 'brand' };
const S: Entry = { tone: 'success' };
const W: Entry = { tone: 'warning' };
const D: Entry = { tone: 'danger' };
const I: Entry = { tone: 'info' };
const withExplain = (entry: Entry, explain: Explain = 'code'): Entry => ({ ...entry, explain });
const withGlyph = (entry: Entry, glyph: AdminGlyphName): Entry => ({ ...entry, glyph });

export const ENUM_FAMILIES = {
  role: {
    BIGBOSS: withExplain(B),
    ADMIN: withExplain(B),
    MODERATOR: withExplain(I),
    AUDIT: withExplain(I),
    ANALYST: withExplain(N),
    USER: withExplain(N),
  },
  accountState: {
    active: S,
    deactivated: withExplain(withGlyph(W, 'userMinus')),
    deleted: withExplain(withGlyph(D, 'trash')),
    banned: withExplain(withGlyph(D, 'prohibit')),
    locked: withExplain(withGlyph(W, 'lock')),
  },
  conversationType: { direct: N, group: N, public: N, global: N, broadcast: N },
  conversationState: { active: S, archived: N, closed: withExplain(W) },
  participantRole: { creator: N, admin: N, moderator: N, member: N },
  writeRole: { everyone: N, member: N, moderator: N, admin: N, creator: N },
  encryption: { e2ee: withExplain(withGlyph(N, 'lock')), server: N, hybrid: N, none: N },
  messageType: { text: N, image: N, file: N, audio: N, video: N, location: N, system: N },
  reportStatus: { pending: W, under_review: I, resolved: S, rejected: N, dismissed: withExplain(N) },
  reportType: { spam: N, inappropriate: N, harassment: N, violence: N, hate_speech: N, fake_profile: N, impersonation: N, other: N },
  reportedEntity: { message: N, user: N, conversation: N, community: N, post: N, story: N, comment: N, sound: N },
  reportAction: {
    none: withExplain(N, 'family'),
    warning_sent: withExplain(N, 'family'),
    content_removed: withExplain(N, 'family'),
    user_suspended: withExplain(N, 'family'),
    user_banned: withExplain(N, 'family'),
  },
  broadcastStatus: { DRAFT: N, TRANSLATING: withExplain(I), READY: withExplain(B), SENDING: I, SENT: S, FAILED: D },
  postType: { POST: N, REEL: N, STORY: N, STATUS: N },
  postVisibility: {
    PUBLIC: N,
    FRIENDS: N,
    COMMUNITY: N,
    PRIVATE: withExplain(N),
    EXCEPT: withExplain(N),
    ONLY: withExplain(N),
  },
  postState: { published: S, deleted: withExplain(D), expired: withExplain(N) },
  invitationStatus: { pending: W, accepted: S, rejected: withExplain(N) },
  shareLinkState: { active: S, expired: N, exhausted: withExplain(W), closed: withExplain(D) },
  trackingLinkState: { active: S, inactive: withExplain(N), expired: N },
  trackingTarget: { POST: N, REEL: N, STORY: N, STATUS: N, CONVERSATION: N, PROFILE: N, EXTERNAL: N },
  redirectStatus: { pending: withExplain(N), confirmed: S, failed: withExplain(D) },
  severity: { LOW: N, MEDIUM: W, HIGH: D, CRITICAL: D },
  securityStatus: { SUCCESS: S, FAILED: W, BLOCKED: D },
  serviceStatus: { up: S, down: D, unknown: N },
  circuitState: { CLOSED: withExplain(S), OPEN: withExplain(D), HALF_OPEN: withExplain(W) },
  quality: { excellent: S, good: S, fair: W, poor: D },
  activityBucket: { '0': S, '1': B, '2': I, '3': N },
  friendStatus: { pending: W, accepted: S, rejected: N, blocked: D },
  presence: { online: S, away: W, idle: N, offline: N, unknown: withExplain(N) },
} as const satisfies Readonly<Record<string, Table>>;

export type AdminEnumFamily = keyof typeof ENUM_FAMILIES;

const ROLE_ALIASES: Readonly<Record<string, string>> = { MODO: 'MODERATOR', CREATOR: 'ADMIN', MEMBER: 'USER' };

const TONE_GLYPH: Readonly<Partial<Record<AdminTone, AdminGlyphName>>> = {
  success: 'checkCircle',
  warning: 'warning',
  danger: 'warningCircle',
  info: 'info',
};

function codeOf(table: Table, raw: string, aliases: Readonly<Record<string, string>> | undefined): string | null {
  const lower = raw.toLowerCase();
  const direct = Object.keys(table).find((code) => code.toLowerCase() === lower);
  if (direct !== undefined) return direct;
  const aliased = aliases?.[raw.toUpperCase()];
  return aliased === undefined ? null : aliased;
}

const unrecognized = (language: AdminLanguage, raw: string): Interpreted => ({
  label: translateAdmin(language, 'admin.value.unrecognized'),
  tone: 'neutral',
  explain: null,
  raw,
});

const notProvided = (language: AdminLanguage): Interpreted => ({
  label: translateAdmin(language, 'admin.value.notProvided'),
  tone: 'neutral',
  explain: null,
  raw: '',
});

export function interpretEnum(family: AdminEnumFamily, code: string | null | undefined, language: AdminLanguage): Interpreted {
  const raw = code?.trim() ?? '';
  if (raw === '') return notProvided(language);

  const table: Table = ENUM_FAMILIES[family];
  const known = codeOf(table, raw, family === 'role' ? ROLE_ALIASES : undefined);
  const entry = known === null ? undefined : table[known];
  if (known === null || entry === undefined) return unrecognized(language, raw);

  const label = translateAdminMaybe(language, `admin.enum.${family}.${known}`);
  if (label === null) return unrecognized(language, raw);

  const explain =
    entry.explain === undefined
      ? null
      : translateAdminMaybe(language, entry.explain === 'code' ? `admin.enum.${family}.${known}.explain` : `admin.enum.${family}.explain`);
  const glyph = entry.glyph ?? TONE_GLYPH[entry.tone];

  return { label, tone: entry.tone, explain, ...(glyph === undefined ? {} : { glyph }), raw };
}

type Interpreter = (code: string | null | undefined, language: AdminLanguage) => Interpreted;

const interpreter =
  (family: AdminEnumFamily): Interpreter =>
  (code, language) =>
    interpretEnum(family, code, language);

export const interpretRole = interpreter('role');
export const interpretAccountState = interpreter('accountState');
export const interpretConversationType = interpreter('conversationType');
export const interpretConversationState = interpreter('conversationState');
export const interpretParticipantRole = interpreter('participantRole');
export const interpretWriteRole = interpreter('writeRole');
export const interpretEncryption = interpreter('encryption');
export const interpretMessageType = interpreter('messageType');
export const interpretReportStatus = interpreter('reportStatus');
export const interpretReportType = interpreter('reportType');
export const interpretReportedEntity = interpreter('reportedEntity');
export const interpretReportAction = interpreter('reportAction');
export const interpretBroadcastStatus = interpreter('broadcastStatus');
export const interpretPostType = interpreter('postType');
export const interpretPostVisibility = interpreter('postVisibility');
export const interpretPostState = interpreter('postState');
export const interpretInvitationStatus = interpreter('invitationStatus');
export const interpretShareLinkState = interpreter('shareLinkState');
export const interpretTrackingLinkState = interpreter('trackingLinkState');
export const interpretTrackingTarget = interpreter('trackingTarget');
export const interpretRedirectStatus = interpreter('redirectStatus');
export const interpretSeverity = interpreter('severity');
export const interpretSecurityStatus = interpreter('securityStatus');
export const interpretServiceStatus = interpreter('serviceStatus');
export const interpretCircuitState = interpreter('circuitState');
export const interpretCallQuality = interpreter('quality');
export const interpretTranslationQuality = interpreter('quality');
export const interpretFriendStatus = interpreter('friendStatus');
export const interpretPresence = interpreter('presence');

/** Par POSITION (0 à 3) : la passerelle sert les tranches d'activité dans un ordre fixe, avec des libellés français que l'on ignore. */
export const interpretActivityBucket = (index: number, language: AdminLanguage): Interpreted =>
  interpretEnum('activityBucket', Number.isInteger(index) ? String(index) : null, language);

const isFuture = (iso: string | null | undefined, now: Date): boolean => {
  if (iso === null || iso === undefined || iso === '') return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time > now.getTime();
};

const isPast = (iso: string | null | undefined, now: Date): boolean => {
  if (iso === null || iso === undefined || iso === '') return false;
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && time <= now.getTime();
};

const isSet = (iso: string | null | undefined): boolean => iso !== null && iso !== undefined && iso !== '';

export type AccountStateFacts = {
  readonly isActive?: boolean | null;
  readonly deletedAt?: string | null;
  readonly deactivatedAt?: string | null;
  readonly lockedUntil?: string | null;
  readonly activeBan?: boolean | null;
};

/** UN seul état, le plus grave d'abord : supprimé > banni > verrouillé > désactivé > actif. */
export function accountStateOf(facts: AccountStateFacts, now: Date, language: AdminLanguage): Interpreted {
  if (isSet(facts.deletedAt)) return interpretAccountState('deleted', language);
  if (facts.activeBan === true) return interpretAccountState('banned', language);
  if (isFuture(facts.lockedUntil, now)) return interpretAccountState('locked', language);
  if (isSet(facts.deactivatedAt) || facts.isActive === false) return interpretAccountState('deactivated', language);
  return interpretAccountState('active', language);
}

export type ShareLinkFacts = {
  readonly isActive?: boolean | null;
  readonly expiresAt?: string | null;
  readonly maxUses?: number | null;
  readonly currentUses?: number | null;
};

/** Fermé à la main > expiré > quota atteint > actif. */
export function shareLinkStateOf(facts: ShareLinkFacts, now: Date, language: AdminLanguage): Interpreted {
  if (facts.isActive === false) return interpretShareLinkState('closed', language);
  if (isPast(facts.expiresAt, now)) return interpretShareLinkState('expired', language);
  const { maxUses, currentUses } = facts;
  const exhausted = typeof maxUses === 'number' && maxUses > 0 && typeof currentUses === 'number' && currentUses >= maxUses;
  return interpretShareLinkState(exhausted ? 'exhausted' : 'active', language);
}

export type TrackingLinkFacts = { readonly isActive?: boolean | null; readonly expiresAt?: string | null };

/** Désactivé > expiré > actif. */
export function trackingLinkStateOf(facts: TrackingLinkFacts, now: Date, language: AdminLanguage): Interpreted {
  if (facts.isActive === false) return interpretTrackingLinkState('inactive', language);
  if (isPast(facts.expiresAt, now)) return interpretTrackingLinkState('expired', language);
  return interpretTrackingLinkState('active', language);
}
