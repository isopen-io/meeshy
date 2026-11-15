/**
 * LA FENÊTRE D'UNE DÉCORATION D'ÉVÉNEMENT (#16447, #16450, calendrier #16272) — la loi unique dont dérive la
 * fenêtre d'offre (`availability`, #11274) d'un pack rattaché à un événement : de `MONTHS_BEFORE_EVENT` mois
 * calendaires avant la date de l'événement à `MONTHS_AFTER_EVENT` mois après, en UTC, début inclus et fin exclue.
 *
 * Un pack déclare son événement sous deux formes :
 *  - `{ id, recurrence: 'yearly', startsOn?, endsOn? }` : l'événement revient chaque année. La passerelle et les
 *    clients calculent, à la date du jour, l'occurrence EN COURS sinon la PROCHAINE (`resolveEventWindow`). Des
 *    bornes écrites en mois-jour (`MM-DD`) priment ; une seule écrite, l'autre vient de la règle.
 *  - `{ id, year }` : une occurrence unique ; ses bornes écrites sont des instants ISO dans `availability`, qui
 *    priment de la même façon (décision porteur du 2026-11-06).
 *
 * Un jour sans équivalent dans le mois visé (le 31 août deux mois plus tôt, le 29 février d'une année commune) est
 * borné au dernier jour de ce mois. Les générateurs écrivent TOUJOURS `availability` — l'occurrence en cours ou
 * prochaine à `GENERATED_WINDOW_REFERENCE` — pour les anciens clients, et transmettent `event` aux nouveaux.
 *
 * Miroirs : `DecorationEventWindow.swift` (MeeshySDK) et `DecorationEventWindow.kt` (core/model) — toute
 * évolution touche les TROIS.
 */
import * as z from 'zod/mini';
import type { PackAvailability } from '../types/pack-availability.js';

export const MONTHS_BEFORE_EVENT = 2;
export const MONTHS_AFTER_EVENT = 1;

/** La date à laquelle les générateurs figent l'instantané `availability` des packs récurrents : à avancer en régénérant. */
export const GENERATED_WINDOW_REFERENCE = '2026-11-06T00:00:00Z';

export const EVENT_RECURRENCES = ['yearly', 'none'] as const;
export type EventRecurrence = (typeof EVENT_RECURRENCES)[number];

export type EventDate = { readonly month: number; readonly day: number };

/** Les événements à date fixe. Les fêtes lunaires (Ramadan, Aïd) et mobiles (Pâques) écrivent leurs dates. */
export const DECORATION_EVENTS = {
  christmas: { month: 12, day: 25 },
  'new-year': { month: 1, day: 1 },
  'valentines-day': { month: 2, day: 14 },
  'music-day': { month: 6, day: 21 },
  halloween: { month: 10, day: 31 },
} as const satisfies Readonly<Record<string, EventDate>>;

export type DecorationEventId = keyof typeof DECORATION_EVENTS;

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EVENT_ID = /^[a-z][a-z0-9-]{0,39}$/;

export const PackEventDeclarationSchema = z.union([
  z.strictObject({
    id: z.string().check(z.regex(EVENT_ID)),
    recurrence: z.literal('yearly'),
    startsOn: z.optional(z.string().check(z.regex(MONTH_DAY))),
    endsOn: z.optional(z.string().check(z.regex(MONTH_DAY))),
  }),
  z.strictObject({
    id: z.string().check(z.regex(EVENT_ID)),
    year: z.int().check(z.minimum(2000), z.maximum(2200)),
    recurrence: z.optional(z.literal('none')),
  }),
]);

export type YearlyEventDeclaration = {
  readonly id: string;
  readonly recurrence: 'yearly';
  /** Borne de début écrite, `MM-DD`, incluse : la dernière avant (ou le jour de) l'événement. */
  readonly startsOn?: string;
  /** Borne de fin écrite, `MM-DD`, exclue : la première après l'événement. */
  readonly endsOn?: string;
};
export type SingleEventDeclaration = { readonly id: string; readonly year: number; readonly recurrence?: 'none' };
export type PackEventDeclaration = YearlyEventDeclaration | SingleEventDeclaration;

type Occurrence = { readonly id: string; readonly year: number } | { readonly date: EventDate; readonly year: number };

const isKnownEvent = (id: string): id is DecorationEventId => Object.prototype.hasOwnProperty.call(DECORATION_EVENTS, id);

const eventDateOf = (id: string): EventDate => {
  if (!isKnownEvent(id)) throw new Error(`Événement de décoration inconnu : « ${id} »`);
  return DECORATION_EVENTS[id];
};

export const isYearlyEvent = (event: PackEventDeclaration | undefined): event is YearlyEventDeclaration =>
  event !== undefined && 'recurrence' in event && event.recurrence === 'yearly';

const daysInMonth = (year: number, monthIndex: number): number => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** Minuit UTC du jour, borné au dernier jour du mois ; `monthIndex` peut déborder (année suivante ou précédente). */
const clampedDay = (year: number, monthIndex: number, day: number): Date => {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth(y, m))));
};

const iso = (date: Date): string => date.toISOString().replace('.000Z', 'Z');

const shiftMonths = (year: number, date: EventDate, months: number): string => iso(clampedDay(year, date.month - 1 + months, date.day));

const parseMonthDay = (value: string): EventDate => {
  const match = MONTH_DAY.exec(value);
  if (match === null) throw new Error(`Borne mois-jour illisible : « ${value} »`);
  return { month: Number(match[1]), day: Number(match[2]) };
};

/** La fenêtre que la règle donne à une occurrence d'événement. */
export function decorationEventWindow(occurrence: Occurrence): Required<PackAvailability> {
  const date = 'date' in occurrence ? occurrence.date : eventDateOf(occurrence.id);
  return {
    startsAt: shiftMonths(occurrence.year, date, -MONTHS_BEFORE_EVENT),
    endsAt: shiftMonths(occurrence.year, date, MONTHS_AFTER_EVENT),
  };
}

/** La fenêtre de l'occurrence `year` d'un événement annuel : bornes écrites en mois-jour d'abord, règle sinon. */
function yearlyOccurrenceWindow(event: YearlyEventDeclaration, year: number): Required<PackAvailability> {
  const date = eventDateOf(event.id);
  const day = clampedDay(year, date.month - 1, date.day);
  const derived = decorationEventWindow({ date, year });
  const startOn = (bound: EventDate): string => {
    const same = clampedDay(year, bound.month - 1, bound.day);
    return iso(same.getTime() <= day.getTime() ? same : clampedDay(year - 1, bound.month - 1, bound.day));
  };
  const endOn = (bound: EventDate): string => {
    const same = clampedDay(year, bound.month - 1, bound.day);
    return iso(same.getTime() > day.getTime() ? same : clampedDay(year + 1, bound.month - 1, bound.day));
  };
  return {
    startsAt: event.startsOn === undefined ? derived.startsAt : startOn(parseMonthDay(event.startsOn)),
    endsAt: event.endsOn === undefined ? derived.endsAt : endOn(parseMonthDay(event.endsOn)),
  };
}

/**
 * La fenêtre d'un événement à la date `now` : pour un événement annuel, l'occurrence EN COURS sinon la PROCHAINE
 * (la première dont la fin n'est pas passée) ; pour une occurrence unique, la sienne.
 */
export function resolveEventWindow(event: PackEventDeclaration, now: Date): Required<PackAvailability> {
  if (!isYearlyEvent(event)) return decorationEventWindow({ id: event.id, year: event.year });
  const year = now.getUTCFullYear();
  const windows = [year - 1, year, year + 1, year + 2].map((candidate) => yearlyOccurrenceWindow(event, candidate));
  const current = windows.find((window) => Date.parse(window.endsAt) > now.getTime());
  return current ?? windows[windows.length - 1]!;
}

/** La fenêtre effective d'un pack : récurrent ⇒ l'occurrence à `now` ; unique ⇒ chaque borne ISO écrite gagne, la règle remplit l'absente. */
export function effectiveEventWindow(
  pack: { readonly event?: PackEventDeclaration; readonly availability?: PackAvailability },
  now: Date = new Date(GENERATED_WINDOW_REFERENCE),
): PackAvailability | undefined {
  if (pack.event === undefined) return pack.availability;
  if (isYearlyEvent(pack.event)) return resolveEventWindow(pack.event, now);
  const derived = resolveEventWindow(pack.event, now);
  return {
    startsAt: pack.availability?.startsAt ?? derived.startsAt,
    endsAt: pack.availability?.endsAt ?? derived.endsAt,
  };
}

/**
 * La fenêtre d'OFFRE qu'un lecteur applique maintenant : un pack récurrent se recalcule à `now` (l'instantané
 * `availability` des générateurs n'est là que pour les anciens clients) ; tout autre pack garde sa fenêtre servie.
 */
export const packOfferWindow = (pack: { readonly event?: PackEventDeclaration; readonly availability?: PackAvailability }, now: Date): PackAvailability | undefined =>
  isYearlyEvent(pack.event) ? resolveEventWindow(pack.event, now) : pack.availability;

/** Le pack tel que les générateurs l'écrivent : `availability` (fenêtre effective) posée juste avant `event`, qui voyage aussi. */
export function materializePackWindow<P extends { readonly event?: PackEventDeclaration; readonly availability?: PackAvailability }>(
  pack: P,
  now: Date = new Date(GENERATED_WINDOW_REFERENCE),
): P {
  if (pack.event === undefined) return pack;
  const availability = effectiveEventWindow(pack, now);
  const entries = Object.entries(pack)
    .filter(([key]) => key !== 'availability')
    .flatMap(([key, value]) => (key === 'event' ? [['availability', availability], [key, value]] : [[key, value]]));
  return Object.fromEntries(entries) as P;
}
