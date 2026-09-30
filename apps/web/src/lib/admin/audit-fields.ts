import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import {
  interpretConversationType,
  interpretInvitationStatus,
  interpretParticipantRole,
  interpretReportStatus,
  interpretReportType,
  interpretReportedEntity,
  interpretRole,
} from './interpret/enums';
import { languageName, sentenceCase } from './interpret/language';
import { formatCount } from './interpret/numbers';
import { adminMomentOf } from './interpret/time';

/**
 * **LES CHAMPS MODIFIÉS, DITS EN MOTS** (#8876, #6727) — le journal grave des
 * `changes` (champ, avant, après) que la passerelle normalise en chaînes ; ce module
 * les rend lisibles : le champ par son libellé traduit, la valeur par ce qu'elle
 * SIGNIFIE (booléen en mots, date en clair, rôle nommé, langue nommée).
 *
 * Un champ que la table ne connaît pas est HUMANISÉ (« slowModeSeconds » → « Slow
 * mode seconds ») plutôt que peint en identifiant. Une valeur masquée par la
 * passerelle (« ••• ») reste masquée TELLE QUE SERVIE : ce module ne tente jamais de
 * la révéler, ni de la deviner.
 */
export const KNOWN_AUDIT_FIELDS = [
  'firstName',
  'lastName',
  'displayName',
  'username',
  'bio',
  'email',
  'phoneNumber',
  'role',
  'isActive',
  'twoFactorEnabled',
  'emailVerified',
  'phoneVerified',
  'ageVerified',
  'unlock',
  'verificationRequested',
  'voiceProfile',
  'voiceData',
  'dataProcessing',
  'avatar',
  'banner',
  'systemLanguage',
  'regionalLanguage',
  'customDestinationLanguage',
  'timezone',
  'status',
  'isPrivate',
  'closed',
  'title',
  'name',
  'description',
  'type',
  'reportType',
  'reportedType',
  'configs',
  'roles',
  'summaries',
  'analytics',
  'globalProfiles',
  'redisKeys',
  'value',
] as const;

type KnownAuditField = (typeof KNOWN_AUDIT_FIELDS)[number];

const isKnownField = (field: string): field is KnownAuditField => KNOWN_AUDIT_FIELDS.some((known) => known === field);

const NONE = '—';

const humanizeSegment = (segment: string): string =>
  segment
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();

export function auditFieldLabel(field: string, language: InterfaceLanguage): string {
  if (isKnownField(field)) return translateAdmin(language, `admin.audit.field.${field}`);
  const segments = field.split('.').map(humanizeSegment).filter((segment) => segment !== '');
  return segments.length === 0 ? NONE : sentenceCase(segments.join(' › '), language);
}

/** `text` est ce qui se lit ; `kind` dit si c'est une absence, un secret masqué ou une valeur. */
export type AuditValue = { readonly kind: 'text' | 'empty' | 'masked'; readonly text: string };

const MASK = '•••';
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const COUNT = /^\d{1,12}$/;
const LANGUAGE_FIELDS: ReadonlySet<string> = new Set(['systemLanguage', 'regionalLanguage', 'customDestinationLanguage']);

/** L'énumération d'un champ dépend de CE QUI change : le rôle d'un compte n'est pas celui d'un participant. */
function enumerated(entity: string, field: string, value: string, language: InterfaceLanguage): string | null {
  if (field === 'role') return (entity === 'Conversation' ? interpretParticipantRole(value, language) : interpretRole(value, language)).label;
  if (field === 'status' && entity === 'Report') return interpretReportStatus(value, language).label;
  if (field === 'status' && entity === 'FriendRequest') return interpretInvitationStatus(value, language).label;
  if (field === 'reportType') return interpretReportType(value, language).label;
  if (field === 'reportedType') return interpretReportedEntity(value, language).label;
  if (field === 'type' && entity === 'Conversation') return interpretConversationType(value, language).label;
  return null;
}

export function auditValue(
  params: { readonly field: string; readonly value: string | null; readonly entity: string },
  language: InterfaceLanguage,
  now: Date,
): AuditValue {
  const { field, value, entity } = params;
  if (value === null) return { kind: 'empty', text: translateAdmin(language, 'admin.audit.change.none') };
  if (value === MASK) return { kind: 'masked', text: MASK };
  if (value === 'true') return { kind: 'text', text: translateAdmin(language, 'admin.value.yes') };
  if (value === 'false') return { kind: 'text', text: translateAdmin(language, 'admin.value.no') };
  if (ISO_INSTANT.test(value)) {
    const moment = adminMomentOf(value, now, language);
    if (moment !== null) return { kind: 'text', text: moment.absolute };
  }
  if (LANGUAGE_FIELDS.has(field)) return { kind: 'text', text: languageName(value, language) };
  const named = enumerated(entity, field, value, language);
  if (named !== null) return { kind: 'text', text: named };
  if (COUNT.test(value)) return { kind: 'text', text: formatCount(Number(value), language) };
  return { kind: 'text', text: value };
}

export type UserAgentSummary = { readonly browser: string; readonly os: string };

type Rule = { readonly name: string; readonly test: RegExp };

/** L'ordre compte : Edge et Opera se disent Chrome, Chrome se dit Safari. */
const BROWSERS: readonly Rule[] = [
  { name: 'Meeshy', test: /Meeshy\//i },
  { name: 'Edge', test: /Edg(?:e|A|iOS)?\//i },
  { name: 'Opera', test: /OPR\/|Opera/i },
  { name: 'Firefox', test: /Firefox\/|FxiOS\//i },
  { name: 'Chrome', test: /Chrome\/|CriOS\//i },
  { name: 'Safari', test: /Safari\//i },
];

/** L'ordre compte : un iPhone se dit « like Mac OS X », Android se dit « Linux ». */
const SYSTEMS: readonly Rule[] = [
  { name: 'iPhone', test: /iPhone/i },
  { name: 'iPad', test: /iPad/i },
  { name: 'Android', test: /Android/i },
  { name: 'Windows', test: /Windows/i },
  { name: 'macOS', test: /Macintosh|Mac OS X/i },
  { name: 'ChromeOS', test: /CrOS/i },
  { name: 'Linux', test: /Linux|X11/i },
];

/** Le navigateur et le système d'un agent utilisateur ; `null` quand rien ne se reconnaît — l'écran le dit, il n'invente pas. */
export function summarizeUserAgent(agent: string | null): UserAgentSummary | null {
  if (agent === null || agent.trim() === '') return null;
  const browser = BROWSERS.find((rule) => rule.test.test(agent));
  const os = SYSTEMS.find((rule) => rule.test.test(agent));
  return browser === undefined || os === undefined ? null : { browser: browser.name, os: os.name };
}
