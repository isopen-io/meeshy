/**
 * LES SAISONS ANNONCÉES SUR L'APP STORE (#10016, point 4).
 *
 * Une saison programmée devient un ÉVÉNEMENT IN-APP `NEW_SEASON` du bloc
 * `store.app_events` d'`apps/ios/andp.yml` (andp ≥ 1.18.0, `Documentation/StoreConfig.md`).
 * Apple borne un événement à 31 jours et sa publication à 14 jours avant le
 * début : une saison de huit semaines s'annonce donc par son OUVERTURE — ses
 * quatre premières semaines (du lundi 0 h au dimanche 20 h de la 4e), publiée
 * sept jours avant. Les heures sont celles de Paris.
 *
 * Les visuels (`<metadata_dir>/app_events/<key>/<locale>/event_card|event_details_page`)
 * ne sont pas produits ici : ils se fournissent à la main.
 */

import { addDays, dayNumber } from './day-prng.js';
import type { LeagueMoment } from './league.js';
import {
  SEASON_COPY_LIMITS,
  SEASON_COPY_LOCALES,
  SEASON_EDIT_FREEZE_DAYS,
  scheduledSeasonCalendar,
  seasonDefinitionOf,
  type SeasonCopy,
  type SeasonCopyLocale,
  type SeasonSchedule,
} from './season-schedule.js';

export const APP_EVENT_TIME_ZONE = 'Europe/Paris';
/** La même que `SEASON_EDIT_FREEZE_DAYS` : une saison annoncée ne se décale plus. */
export const APP_EVENT_PUBLISH_DAYS_BEFORE = SEASON_EDIT_FREEZE_DAYS;
/** Le dimanche 20 h de la 4e semaine : 27 jours et 20 heures après l'ouverture. */
export const APP_EVENT_SEASON_WEEKS = 4;
export const APP_EVENT_MAX_DAYS = 31;
export const APP_EVENT_MAX_PUBLISH_DAYS = 14;
export const APP_EVENT_REFERENCE_NAME_MAX = 64;
export const APP_EVENT_DEEP_LINK_BASE = 'https://meeshy.me/me/progression/saison/';

/** La langue de l'app → la localisation App Store (les dossiers de `fastlane/metadata`). */
export const APP_EVENT_STORE_LOCALES: Readonly<Record<SeasonCopyLocale, string>> = {
  fr: 'fr-FR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it',
  'pt-BR': 'pt-BR',
  ar: 'ar-SA',
};

export type AppEventLocalization = {
  readonly name: string;
  readonly short_description: string;
  readonly long_description: string;
};

export type SeasonAppEvent = {
  readonly key: string;
  readonly reference_name: string;
  readonly badge: 'NEW_SEASON';
  readonly purpose: 'KEEP_ACTIVE_USERS_INFORMED';
  readonly priority: 'HIGH' | 'NORMAL';
  readonly purchase_requirement: 'NO_COST_ASSOCIATED';
  readonly deep_link: string;
  readonly primary_locale: 'fr-FR';
  readonly territories: 'all';
  readonly publish_start: string;
  readonly event_start: string;
  readonly event_end: string;
  readonly localizations: Readonly<Record<string, AppEventLocalization>>;
};

/**
 * Les textes par défaut d'une saison sans texte propre — `{n}` est son numéro. Le joueur la vit comme un
 * VOYAGE en terre de langue (épopée, #11175) : la clé `saison-<n>` et le lien `…/saison/<n>` restent ceux du fil.
 */
export const DEFAULT_SEASON_EVENT_COPY: Readonly<Record<SeasonCopyLocale, SeasonCopy>> = {
  fr: { title: 'Voyage {n}', tagline: 'Huit semaines, 40 haltes', description: 'Un nouveau voyage en terre de langue dans le Jeu Meeshy : un rêve chaque nuit, des haltes et une coupe au bout.' },
  en: { title: 'Journey {n}', tagline: 'Eight weeks, 40 stops', description: 'A new journey to the land of a language in the Meeshy Game: a dream each night, strides, stops and a cup at the end.' },
  es: { title: 'Viaje {n}', tagline: 'Ocho semanas, 40 paradas', description: 'Un nuevo viaje a tierra de idioma en el Juego Meeshy: un sueño cada noche, pasos, paradas y una copa al final.' },
  de: { title: 'Reise {n}', tagline: 'Acht Wochen, 40 Rasten', description: 'Eine neue Reise in ein Sprachland im Meeshy-Spiel: jede Nacht ein Traum, Schritte, Rasten und ein Pokal am Ziel.' },
  it: { title: 'Viaggio {n}', tagline: 'Otto settimane, 40 soste', description: 'Un nuovo viaggio in terra di lingua nel Gioco Meeshy: un sogno ogni notte, passi, soste e una coppa alla fine.' },
  'pt-BR': { title: 'Viagem {n}', tagline: 'Oito semanas, 40 paradas', description: 'Uma nova viagem a uma terra de idioma no Jogo Meeshy: um sonho a cada noite, passos, paradas e uma taça no final.' },
  ar: { title: 'الرحلة {n}', tagline: 'ثمانية أسابيع و40 محطة', description: 'رحلة جديدة إلى أرض لغة في لعبة Meeshy: حلم كل ليلة، وخطوات، ومحطات، وكأس في النهاية.' },
};

/** Le décalage horaire de Paris à ce jour (midi UTC : du bon côté d'un changement d'heure du dimanche). */
function parisOffset(dayKey: string): string {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: APP_EVENT_TIME_ZONE, timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${dayKey}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')?.value;
  const match = /GMT([+-]\d{2}):?(\d{2})?/.exec(part ?? '');
  return match ? `${match[1]}:${match[2] ?? '00'}` : '+00:00';
}

const at = (dayKey: string, time: string): string => `${dayKey}T${time}${parisOffset(dayKey)}`;
const fill = (text: string, n: number): string => text.split('{n}').join(String(n));

/**
 * L'événement d'une saison programmée et pas encore ouverte ; `null` pour une
 * saison en pause, ouverte ou passée (Apple ne crée pas un événement commencé).
 */
export function seasonAppEvent(schedule: SeasonSchedule, number: number, now: LeagueMoment): SeasonAppEvent | null {
  const calendar = scheduledSeasonCalendar(schedule, number);
  const definition = seasonDefinitionOf(schedule, number);
  if (calendar === null || definition === null) return null;
  if (dayNumber(now.dayKey) >= dayNumber(calendar.startDay)) return null;
  const n = calendar.number;
  const copy = definition.copy ?? DEFAULT_SEASON_EVENT_COPY;
  const localizations = Object.fromEntries(
    SEASON_COPY_LOCALES.map((locale) => {
      const text = copy[locale];
      return [APP_EVENT_STORE_LOCALES[locale], { name: fill(text.title, n), short_description: fill(text.tagline, n), long_description: fill(text.description, n) }];
    }),
  );
  return {
    key: `saison-${n}`,
    reference_name: `Saison ${n}`,
    badge: 'NEW_SEASON',
    purpose: 'KEEP_ACTIVE_USERS_INFORMED',
    priority: 'HIGH',
    purchase_requirement: 'NO_COST_ASSOCIATED',
    deep_link: `${APP_EVENT_DEEP_LINK_BASE}${n}`,
    primary_locale: 'fr-FR',
    territories: 'all',
    publish_start: at(addDays(calendar.startDay, -APP_EVENT_PUBLISH_DAYS_BEFORE), '00:00:00'),
    event_start: at(calendar.startDay, '00:00:00'),
    event_end: at(addDays(calendar.startDay, APP_EVENT_SEASON_WEEKS * 7 - 1), '20:00:00'),
    localizations,
  };
}

/** Les événements des `count` prochaines saisons programmées (au plus 15 à venir : Apple plafonne). */
export function upcomingSeasonAppEvents(schedule: SeasonSchedule, now: LeagueMoment, count = 3): SeasonAppEvent[] {
  const events: SeasonAppEvent[] = [];
  const limit = Math.max(0, Math.min(15, Math.trunc(count)));
  for (let n = 1; events.length < limit && n < 10_000; n += 1) {
    const calendar = scheduledSeasonCalendar(schedule, n);
    if (calendar === null) break;
    const ev = seasonAppEvent(schedule, n, now);
    if (ev) events.push(ev);
  }
  return events;
}

const instant = (value: string): number => Date.parse(value);

/** Les règles d'Apple vérifiées hors ligne : la liste des champs fautifs, vide si l'événement est conforme. */
export function validateAppEvent(event: SeasonAppEvent): string[] {
  const faults: string[] = [];
  if ([...event.reference_name].length === 0 || [...event.reference_name].length > APP_EVENT_REFERENCE_NAME_MAX) faults.push('reference_name');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(event.key)) faults.push('key');
  if (!event.deep_link.startsWith('https://meeshy.me/')) faults.push('deep_link');
  const [publish, start, end] = [instant(event.publish_start), instant(event.event_start), instant(event.event_end)];
  if (![publish, start, end].every(Number.isFinite)) faults.push('dates');
  else {
    const duration = end - start;
    if (duration < 15 * 60_000 || duration > APP_EVENT_MAX_DAYS * 86_400_000) faults.push('duration');
    if (publish > start || start - publish > APP_EVENT_MAX_PUBLISH_DAYS * 86_400_000) faults.push('publish_start');
  }
  if (!event.localizations[event.primary_locale]) faults.push(`localizations.${event.primary_locale}`);
  for (const [locale, text] of Object.entries(event.localizations)) {
    if ([...text.name].length === 0 || [...text.name].length > SEASON_COPY_LIMITS.title) faults.push(`localizations.${locale}.name`);
    if ([...text.short_description].length === 0 || [...text.short_description].length > SEASON_COPY_LIMITS.tagline) faults.push(`localizations.${locale}.short_description`);
    if ([...text.long_description].length === 0 || [...text.long_description].length > SEASON_COPY_LIMITS.description) faults.push(`localizations.${locale}.long_description`);
  }
  return faults;
}

/** Une chaîne YAML toujours entre guillemets doubles, échappée (JSON est un sous-ensemble de YAML). */
const q = (value: string): string => JSON.stringify(value);

/** Le bloc `app_events:` (indenté pour vivre sous `store:`), prêt à coller dans `apps/ios/andp.yml`. */
export function seasonAppEventsYaml(events: readonly SeasonAppEvent[], indent = 2): string {
  const pad = ' '.repeat(indent);
  const lines: string[] = [`${pad}app_events:`];
  if (events.length === 0) return `${pad}app_events: []\n`;
  for (const ev of events) {
    lines.push(
      `${pad}  - key: ${ev.key}`,
      `${pad}    reference_name: ${q(ev.reference_name)}`,
      `${pad}    badge: ${ev.badge}`,
      `${pad}    purpose: ${ev.purpose}`,
      `${pad}    priority: ${ev.priority}`,
      `${pad}    purchase_requirement: ${ev.purchase_requirement}`,
      `${pad}    deep_link: ${ev.deep_link}`,
      `${pad}    primary_locale: ${ev.primary_locale}`,
      `${pad}    territories: ${ev.territories}`,
      `${pad}    publish_start: ${ev.publish_start}`,
      `${pad}    event_start: ${ev.event_start}`,
      `${pad}    event_end: ${ev.event_end}`,
      `${pad}    submit: true`,
      `${pad}    localizations:`,
    );
    for (const [locale, text] of Object.entries(ev.localizations)) {
      lines.push(
        `${pad}      ${locale}:`,
        `${pad}        name: ${q(text.name)}`,
        `${pad}        short_description: ${q(text.short_description)}`,
        `${pad}        long_description: ${q(text.long_description)}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Remplace (ou ajoute à la fin de `store:`) le bloc `app_events:` d'un `andp.yml`, sans toucher au reste :
 * c'est ce que `apps/ios/scripts/season-app-events.mjs` écrit pour une PR. `block` vient de `seasonAppEventsYaml`.
 */
export function replaceAppEventsBlock(andpYaml: string, block: string): string {
  const lines = andpYaml.split('\n');
  const storeAt = lines.findIndex((line) => /^store:\s*$/.test(line));
  if (storeAt < 0) throw new Error('andp.yml sans bloc store:');
  let storeEnd = lines.findIndex((line, i) => i > storeAt && /^\S/.test(line));
  if (storeEnd < 0) storeEnd = lines.length;
  const blockLines = block.replace(/\n+$/, '').split('\n');
  const startAt = lines.findIndex((line, i) => i > storeAt && i < storeEnd && /^ {2}app_events:/.test(line));
  if (startAt >= 0) {
    let endAt = lines.findIndex((line, i) => i > startAt && i < storeEnd && /^ {0,2}\S/.test(line));
    if (endAt < 0) endAt = storeEnd;
    while (endAt - 1 > startAt && lines[endAt - 1]!.trim() === '') endAt -= 1;
    return [...lines.slice(0, startAt), ...blockLines, ...lines.slice(endAt)].join('\n');
  }
  let insertAt = storeEnd;
  while (insertAt - 1 > storeAt && lines[insertAt - 1]!.trim() === '') insertAt -= 1;
  return [...lines.slice(0, insertAt), '', ...blockLines, ...lines.slice(insertAt)].join('\n');
}
