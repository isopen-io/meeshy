import type { ActiveSession, ActiveSessions } from '@/lib/api/account-security';
import type { SessionsText } from '@/lib/i18n-sessions-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **CE QUE L'ÉCRAN SÉCURITÉ > SESSIONS DIT D'UNE SESSION** (#6720) — toutes les
 * informations disponibles (décision porteur du 2026-10-08), dans la langue du
 * lecteur, chacune sous son libellé. Un champ que la passerelle ne sert pas
 * est TU : ni « null », ni tiret qui ressemblerait à une valeur.
 *
 * Le lieu est tiré de l'adresse IP par une base locale : il se dit
 * « approximatif » quand l'attribution servie le dit (`approximate`). Le pays
 * est servi en code (« SN ») et nommé ici dans la langue du lecteur.
 * L'adresse IP et le fuseau se lisent toujours de gauche à droite (`ltr`),
 * même dans une interface arabe.
 */

export type SessionFieldKey =
  | 'app'
  | 'platform'
  | 'device'
  | 'system'
  | 'browser'
  | 'ip'
  | 'place'
  | 'timezone'
  | 'opened'
  | 'lastActive'
  | 'method';

export type SessionField = { readonly key: SessionFieldKey; readonly label: string; readonly value: string; readonly ltr: boolean };

const LABEL = {
  app: 'sessions.field.app',
  platform: 'sessions.field.platform',
  device: 'sessions.field.device',
  system: 'sessions.field.system',
  browser: 'sessions.field.browser',
  ip: 'sessions.field.ip',
  place: 'sessions.field.place',
  timezone: 'sessions.field.timezone',
  opened: 'sessions.field.opened',
  lastActive: 'sessions.field.lastActive',
  method: 'sessions.field.method',
} as const satisfies Readonly<Record<SessionFieldKey, Parameters<SessionsText>[0]>>;

const LTR: ReadonlySet<SessionFieldKey> = new Set(['ip', 'timezone']);

const joined = (parts: readonly (string | null)[], separator = ' '): string | null => {
  const kept = parts.filter((part): part is string => part !== null && part !== '');
  return kept.length === 0 ? null : kept.join(separator);
};

export function sessionTitle(session: ActiveSession, t: SessionsText): string {
  return (
    session.deviceName ??
    joined([session.deviceVendor, session.deviceModel]) ??
    joined([session.browserName, session.osName], ' · ') ??
    t('sessions.unknownDevice')
  );
}

function countryName(code: string, language: InterfaceLanguage): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return code;
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function dateTime(iso: string | null, language: InterfaceLanguage): string | null {
  const date = iso === null ? Number.NaN : new Date(iso).getTime();
  if (Number.isNaN(date)) return null;
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

const STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

function sinceNow(iso: string | null, language: InterfaceLanguage, now: Date): string | null {
  const at = iso === null ? Number.NaN : new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const seconds = Math.min(0, Math.round((at - now.getTime()) / 1000));
  if (seconds > -60) return format.format(0, 'second');
  const step = STEPS.reduce<{ readonly value: number; readonly unit: Intl.RelativeTimeFormatUnit; readonly done: boolean }>(
    (current, [unit, size]) => {
      if (current.done) return current;
      return Math.abs(current.value) < size ? { value: current.value, unit, done: true } : { value: current.value / size, unit, done: false };
    },
    { value: seconds, unit: 'second', done: false },
  );
  return format.format(Math.round(step.value), step.unit);
}

export function sessionFields(
  session: ActiveSession,
  context: { readonly language: InterfaceLanguage; readonly now: Date; readonly t: SessionsText; readonly approximate: boolean },
): readonly SessionField[] {
  const { language, now, t } = context;
  const place = joined([session.city, session.country === null ? null : countryName(session.country, language)], ', ') ?? session.location;
  const values: Readonly<Record<SessionFieldKey, string | null>> = {
    app:
      session.appVersion === null
        ? null
        : session.appBuild === null
          ? t('sessions.version', { version: session.appVersion })
          : t('sessions.versionBuild', { version: session.appVersion, build: session.appBuild }),
    platform: session.platform === null ? null : t(`sessions.platform.${session.platform}`),
    device: joined([session.deviceVendor, session.deviceModel]),
    system: joined([session.osName, session.osVersion]),
    browser: joined([session.browserName, session.browserVersion]),
    ip: session.ipAddress,
    place: place === null ? null : context.approximate && place !== session.location ? t('sessions.place.approximate', { place }) : place,
    timezone: session.timezone,
    opened: dateTime(session.createdAt, language),
    lastActive: sinceNow(session.lastActivityAt, language, now),
    method: session.loginMethod === null ? null : t(`sessions.method.${session.loginMethod}`),
  };
  return (Object.keys(LABEL) as readonly SessionFieldKey[]).flatMap((key) => {
    const value = values[key];
    return value === null ? [] : [{ key, label: t(LABEL[key]), value, ltr: LTR.has(key) }];
  });
}

const activity = (session: ActiveSession): number => {
  const at = new Date(session.lastActivityAt ?? session.createdAt ?? 0).getTime();
  return Number.isNaN(at) ? 0 : at;
};

/** La courante en tête, puis la plus récemment active — l'ordre d'`ActiveSessionsView`. */
export function orderedSessions(sessions: readonly ActiveSession[]): readonly ActiveSession[] {
  return [...sessions].sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || activity(b) - activity(a));
}

/** L'effet IMMÉDIAT d'une fermeture sur la liste en cache ; une liste absente reste absente. */
export function withoutSessions(before: ActiveSessions | undefined, closed: (session: ActiveSession) => boolean): ActiveSessions | undefined {
  return before === undefined ? undefined : { ...before, sessions: before.sessions.filter((session) => !closed(session)) };
}
