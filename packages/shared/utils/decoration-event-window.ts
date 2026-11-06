/**
 * LA FENÊTRE D'UNE DÉCORATION D'ÉVÉNEMENT (#16447, calendrier #16272) — la loi unique dont dérive la fenêtre
 * `availability` (#11274) d'un pack rattaché à un événement : de `MONTHS_BEFORE_EVENT` mois calendaires avant la
 * date de l'événement à `MONTHS_AFTER_EVENT` mois après, en UTC, début inclus et fin exclue.
 *
 * Une date ÉCRITE prime toujours sur la règle (décision porteur du 2026-11-06) : un pack qui porte `startsAt` et
 * `endsAt` les garde tels quels ; une seule borne écrite s'applique et l'autre vient de la règle. La règle ne sert
 * donc que la borne absente d'un pack qui déclare son `event`.
 *
 * Un jour sans équivalent dans le mois visé (le 31 août, deux mois plus tôt) est borné au dernier jour de ce mois.
 * Les clients ne lisent que `availability.startsAt` / `endsAt` : la génération matérialise la fenêtre
 * (`materializePackWindow`) et la déclaration `event` ne voyage pas.
 */
import type { PackAvailability } from '../types/pack-availability';

export const MONTHS_BEFORE_EVENT = 2;
export const MONTHS_AFTER_EVENT = 1;

export type EventDate = { readonly month: number; readonly day: number };

/** Les événements à date fixe. Les fêtes lunaires (Ramadan, Aïd) et mobiles (Pâques) écrivent leurs dates. */
export const DECORATION_EVENTS = {
  noel: { month: 12, day: 25 },
  'nouvel-an': { month: 1, day: 1 },
  'saint-valentin': { month: 2, day: 14 },
  'fete-de-la-musique': { month: 6, day: 21 },
  halloween: { month: 10, day: 31 },
} as const satisfies Readonly<Record<string, EventDate>>;

export type DecorationEventId = keyof typeof DECORATION_EVENTS;

/** Ce qu'un pack déclare : l'événement et l'année de SON occurrence (Noël 2026, Nouvel An 2027). */
export type PackEventDeclaration = { readonly id: string; readonly year: number };

type Occurrence = { readonly id: string; readonly year: number } | { readonly date: EventDate; readonly year: number };

const isKnownEvent = (id: string): id is DecorationEventId => Object.prototype.hasOwnProperty.call(DECORATION_EVENTS, id);

const dateOf = (occurrence: Occurrence): EventDate => {
  if ('date' in occurrence) return occurrence.date;
  if (!isKnownEvent(occurrence.id)) throw new Error(`Événement de décoration inconnu : « ${occurrence.id} »`);
  return DECORATION_EVENTS[occurrence.id];
};

const daysInMonth = (year: number, monthIndex: number): number => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const shiftMonths = (year: number, date: EventDate, months: number): string => {
  const target = new Date(Date.UTC(year, date.month - 1 + months, 1));
  const day = Math.min(date.day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)).toISOString().replace('.000Z', 'Z');
};

/** La fenêtre que la règle donne à une occurrence d'événement. */
export function decorationEventWindow(occurrence: Occurrence): Required<PackAvailability> {
  const date = dateOf(occurrence);
  return {
    startsAt: shiftMonths(occurrence.year, date, -MONTHS_BEFORE_EVENT),
    endsAt: shiftMonths(occurrence.year, date, MONTHS_AFTER_EVENT),
  };
}

/** La fenêtre effective : chaque borne écrite gagne, la règle ne remplit que la borne absente d'un pack d'événement. */
export function effectiveEventWindow(pack: { readonly event?: PackEventDeclaration; readonly availability?: PackAvailability }): PackAvailability | undefined {
  if (pack.event === undefined) return pack.availability;
  const derived = decorationEventWindow(pack.event);
  return {
    startsAt: pack.availability?.startsAt ?? derived.startsAt,
    endsAt: pack.availability?.endsAt ?? derived.endsAt,
  };
}

/** Le pack tel que les clients le lisent : la fenêtre effective posée dans `availability`, à la place de la déclaration retirée. */
export function materializePackWindow<P extends { readonly event?: PackEventDeclaration; readonly availability?: PackAvailability }>(pack: P): Omit<P, 'event'> {
  if (pack.event === undefined) return pack;
  const availability = effectiveEventWindow(pack);
  const entries = Object.entries(pack)
    .filter(([key]) => key !== 'availability')
    .map(([key, value]) => (key === 'event' ? ['availability', availability] : [key, value]));
  return Object.fromEntries(entries) as Omit<P, 'event'>;
}
