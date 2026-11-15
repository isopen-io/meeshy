import { getLanguageInfo } from '@meeshy/shared/utils/languages';
import type { WorldParticipantCard } from '@meeshy/shared/types/world-participant-card';

import type { PlainWorldParticipantCardKey } from '../i18n-world-participant-card-catalog';
import type { InterfaceLanguage } from '../interface-language';

import { initialsOf } from './conversation';

/**
 * **CE QUE LA FICHE D'UN PARTICIPANT DE WORLD WIDE MONTRE** (#10102) — la
 * projection PURE de la charge servie en sections de lignes libellées, dans la
 * langue d'interface du lecteur. La feuille (`world-participant-card-sheet.tsx`)
 * ne fait que la peindre.
 *
 * DEUX ABSENCES QUI NE SE CONFONDENT PAS. Un champ `null` dit soit que rien n'a
 * été RELEVÉ (un invité entré avant le relevé du poste, un compte sans
 * session), soit que la passerelle l'a RETENU (`accountDetailsWithheld` : le
 * compte n'est pas sous le rang du lecteur). Les écrire pareil laisserait
 * croire au modérateur qu'il n'y a rien à savoir là où on le lui refuse.
 *
 * Les noms de langue et de pays viennent d'`Intl.DisplayNames`, dans la langue
 * d'interface — jamais d'une table recopiée ; le drapeau d'une langue de
 * `getLanguageInfo` (le catalogue partagé), celui d'un pays de son code ISO.
 */

export type WorldParticipantCardRowTone = 'missing' | 'withheld';

export type WorldParticipantCardRow = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly leading?: string;
  readonly detail?: string;
  readonly tone?: WorldParticipantCardRowTone;
};

export type WorldParticipantCardSection = {
  readonly id: 'world' | 'languages' | 'origin' | 'account';
  readonly title: string;
  readonly rows: readonly WorldParticipantCardRow[];
};

export type WorldParticipantCardView = {
  readonly header: {
    readonly name: string;
    readonly handle: string | null;
    readonly kind: 'anonymous' | 'account' | 'bot';
    readonly kindLabel: string;
    readonly initials: string;
    /** La photo servie (#12571), `null` ⇒ les initiales. */
    readonly avatar: string | null;
  };
  readonly withheldNotice: string | null;
  readonly sections: readonly WorldParticipantCardSection[];
};

type Translate = (key: PlainWorldParticipantCardKey) => string;

const REGION = /^[A-Za-z]{2}$/;
const REGIONAL_INDICATOR_A = 0x1f1e6;

const displayName = (language: InterfaceLanguage, type: 'language' | 'region', code: string): string | null => {
  try {
    return new Intl.DisplayNames([language], { type, fallback: 'none' }).of(code) ?? null;
  } catch {
    return null;
  }
};

const countryFlag = (code: string): string =>
  [...code.toUpperCase()].map((letter) => String.fromCodePoint(REGIONAL_INDICATOR_A + letter.charCodeAt(0) - 65)).join('');

const known = <K extends string>(prefix: string, value: string, keys: readonly K[]): K | null => {
  const key = `${prefix}${value}`;
  return (keys as readonly string[]).includes(key) ? (key as K) : null;
};

const CONVERSATION_ROLE_KEYS = ['worldCard.role.creator', 'worldCard.role.admin', 'worldCard.role.moderator', 'worldCard.role.member'] as const;
const ACCOUNT_ROLE_KEYS = [
  'worldCard.accountRole.BIGBOSS',
  'worldCard.accountRole.ADMIN',
  'worldCard.accountRole.MODERATOR',
  'worldCard.accountRole.AUDIT',
  'worldCard.accountRole.ANALYST',
  'worldCard.accountRole.USER',
  'worldCard.accountRole.AGENT',
] as const;
const DEVICE_KEYS = ['worldCard.device.mobile', 'worldCard.device.tablet', 'worldCard.device.desktop'] as const;

const joined = (...parts: readonly (string | null)[]): string | null => {
  const kept = parts.filter((part): part is string => part !== null && part.trim() !== '');
  return kept.length === 0 ? null : kept.join(' ');
};

export function worldParticipantCardView(
  card: WorldParticipantCard,
  { language, t }: { readonly language: InterfaceLanguage; readonly t: Translate },
): WorldParticipantCardView {
  const isAccount = card.participantType !== 'anonymous';
  const withheld = isAccount && card.accountDetailsWithheld;
  const absent = (id: string, label: string): WorldParticipantCardRow =>
    withheld ? { id, label, value: t('worldCard.withheld'), tone: 'withheld' } : { id, label, value: t('worldCard.notRecorded'), tone: 'missing' };
  const text = (id: string, label: string, value: string | null): WorldParticipantCardRow => (value === null ? absent(id, label) : { id, label, value });

  const languageRow = (id: string, label: string, code: string): WorldParticipantCardRow => {
    const base = code.split(/[-_]/)[0] ?? code;
    return { id, label, value: displayName(language, 'language', code) ?? getLanguageInfo(base).name, leading: getLanguageInfo(base).flag };
  };

  const countryRow = (): WorldParticipantCardRow => {
    const label = t('worldCard.row.country');
    if (card.country === null) return absent('country', label);
    if (!REGION.test(card.country)) return { id: 'country', label, value: card.country };
    return { id: 'country', label, value: displayName(language, 'region', card.country.toUpperCase()) ?? card.country, leading: countryFlag(card.country) };
  };

  const conversationRoleKey = known('worldCard.role.', card.conversationRole, CONVERSATION_ROLE_KEYS);
  const joinedDate = new Date(card.joinedAt);
  const joinedAt = Number.isNaN(joinedDate.getTime())
    ? card.joinedAt
    : new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' }).format(joinedDate);
  const link = card.shareLink;

  const world: WorldParticipantCardSection = {
    id: 'world',
    title: t('worldCard.section.world'),
    rows: [
      { id: 'conversationRole', label: t('worldCard.row.conversationRole'), value: conversationRoleKey === null ? card.conversationRole : t(conversationRoleKey) },
      { id: 'status', label: t('worldCard.row.status'), value: t(`worldCard.status.${card.status}`) },
      { id: 'joinedAt', label: t('worldCard.row.joinedAt'), value: joinedAt },
      link === null
        ? { id: 'link', label: t('worldCard.row.link'), value: t('worldCard.noLink') }
        : {
            id: 'link',
            label: t('worldCard.row.link'),
            value: link.name ?? link.identifier ?? link.linkId,
            ...(link.name !== null && link.identifier !== null ? { detail: link.identifier } : {}),
          },
    ],
  };

  const prism = [
    ['language.system', 'worldCard.row.language.system', card.languages.system],
    ['language.regional', 'worldCard.row.language.regional', card.languages.regional],
    ['language.customDestination', 'worldCard.row.language.customDestination', card.languages.customDestination],
    ['language.deviceLocale', 'worldCard.row.language.deviceLocale', card.languages.deviceLocale],
  ] as const;
  const languages: WorldParticipantCardSection = {
    id: 'languages',
    title: t('worldCard.section.languages'),
    rows: [
      languageRow('language.conversation', t('worldCard.row.language.conversation'), card.languages.conversation),
      ...(withheld
        ? [absent('language.account', t('worldCard.row.language.account'))]
        : isAccount
          ? prism.flatMap(([id, key, code]) => (code === null ? [] : [languageRow(id, t(key), code)]))
          : []),
    ],
  };

  const client = card.client;
  const deviceKey = client?.deviceType == null ? null : known('worldCard.device.', client.deviceType, DEVICE_KEYS);
  const origin: WorldParticipantCardSection = {
    id: 'origin',
    title: t('worldCard.section.origin'),
    rows: [
      countryRow(),
      ...(client === null
        ? [absent('client', t('worldCard.row.client'))]
        : [
            text('browser', t('worldCard.row.browser'), joined(client.browser, client.browserVersion)),
            text('system', t('worldCard.row.system'), joined(client.os, client.osVersion)),
            text('device', t('worldCard.row.device'), deviceKey === null ? client.deviceType : t(deviceKey)),
            ...(isAccount && (client.platform !== null || client.appVersion !== null)
              ? [{ id: 'app', label: t('worldCard.row.app'), value: [client.platform, client.appVersion].filter((part) => part !== null).join(' · ') }]
              : []),
          ]),
    ],
  };

  const accountRoleKey = card.accountRole === null ? null : known('worldCard.accountRole.', card.accountRole.toUpperCase(), ACCOUNT_ROLE_KEYS);
  const account: readonly WorldParticipantCardSection[] = isAccount
    ? [
        {
          id: 'account',
          title: t('worldCard.section.account'),
          rows: [
            card.accountRole === null
              ? absent('accountRole', t('worldCard.row.accountRole'))
              : { id: 'accountRole', label: t('worldCard.row.accountRole'), value: accountRoleKey === null ? card.accountRole : t(accountRoleKey) },
          ],
        },
      ]
    : [];

  const kind = card.participantType === 'anonymous' ? 'anonymous' : card.participantType === 'bot' ? 'bot' : 'account';

  return {
    header: {
      name: card.displayName,
      handle: card.username === null || card.username === '' ? null : `@${card.username}`,
      kind,
      kindLabel: t(`worldCard.kind.${kind}`),
      initials: initialsOf(card.displayName),
      avatar: card.avatar,
    },
    withheldNotice: withheld ? t('worldCard.withheld.note') : null,
    sections: [world, languages, origin, ...account],
  };
}
