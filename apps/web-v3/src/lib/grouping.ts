import type { Message } from './api/types';

/**
 * LE REGROUPEMENT DES MESSAGES — la meme loi que iOS
 * (`Bubble/MessageDayGrouping.swift`), le web (`utils/message-grouping.ts`) et
 * Android (`MessageGrouping.kt`).
 *
 * DEUX criteres, et deux seulement : MEME AUTEUR et MEME JOUR LOCAL.
 *
 * Il n'y a PAS de fenetre temporelle, contrairement a iMessage : deux messages
 * du meme auteur separes de six heures dans la meme journee restent groupes.
 * L'ecrire avec un « et moins de N minutes » produirait un fil visuellement
 * different d'iOS sur exactement les conversations lentes — celles d'une zone
 * ou le reseau coupe, c'est-a-dire la cible.
 */
/**
 * Une horloge de message voyage en `Date` depuis la passerelle et en chaîne
 * ISO depuis une charge JSON non désérialisée. Les deux entrent ici : c'est
 * `new Date(x)` qui tranche, pas l'appelant.
 */
type Clock = Date | string;

export function continues(previous: Message | undefined, next: Message | undefined): boolean {
  if (!previous || !next) return false;
  if (previous.senderId === '' || previous.senderId !== next.senderId) return false;
  return sameLocalDay(previous.createdAt, next.createdAt);
}

/** Les parties calendaires (année/mois/jour) d'une date, dans un fuseau donné (le système si omis). */
function calendarParts(date: Date, timeZone?: string): { readonly year: number; readonly month: number; readonly day: number } {
  if (timeZone === undefined) {
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const read = (type: 'year' | 'month' | 'day'): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: read('year'), month: read('month') - 1, day: read('day') };
}

/** Différence en JOURS CALENDAIRES entre `from` et `to` (positive si `from` est avant `to`). */
function daysBetween(from: Date, to: Date, timeZone?: string): number {
  const a = calendarParts(from, timeZone);
  const b = calendarParts(to, timeZone);
  const aUtc = Date.UTC(a.year, a.month, a.day);
  const bUtc = Date.UTC(b.year, b.month, b.day);
  return Math.round((bUtc - aUtc) / 86_400_000);
}

export function sameLocalDay(a: Clock, b: Clock, timeZone?: string): boolean {
  return daysBetween(new Date(a), new Date(b), timeZone) === 0;
}

export type PlacedMessage = {
  readonly message: Message;
  /** Premier d'une suite du meme auteur le meme jour. */
  readonly head: boolean;
  /** DERNIER d'une suite — c'est LUI qui porte l'avatar et le nom (choix iOS). */
  readonly tail: boolean;
  /** Non nul quand ce message ouvre un nouveau JOUR : le libelle du separateur. */
  readonly opensDay: string | null;
};

export type PlaceOptions = {
  readonly locale: string;
  readonly labels?: DayLabels;
  readonly timeZone?: string;
};

/**
 * LA FUSION DU FIL (revue-correction #5813, défaut majeur 5) — `place()`,
 * juste en dessous, suppose un ordre ASCENDANT : c'est lui qui décide
 * `head`/`tail`/`opensDay` à partir des voisins d'INDICE. `[...confirmed,
 * ...pending]` (`routes/thread.tsx`, avant ce correctif) CONCATÉNAIT au lieu
 * de fusionner : `pending` (l'outbox) grandit dans l'ordre du GESTE (l'ordre
 * de saisie), `confirmed` (le cache) dans l'ordre du SERVEUR (`createdAt`) —
 * deux envois rapprochés dont le second répond plus vite s'affichaient donc
 * dans l'ordre INVERSE de leur saisie, et un renvoi après une reprise
 * plaçait le message repris APRÈS un message parti entre-temps alors que son
 * `createdAt` est plus ANCIEN. L'ordre changeait en prime au rechargement,
 * puisque le serveur, lui, trie toujours par `createdAt`.
 *
 * Départage STABLE par `id` : deux messages à la même milliseconde (un
 * bouchon de test, un double envoi très rapide) gardent un ordre
 * déterministe plutôt que celui, arbitraire, du tri natif sur des clés
 * égales.
 */
export function mergeTimeline(confirmed: readonly Message[], pending: readonly Message[]): readonly Message[] {
  return [...confirmed, ...pending].sort((a, b) => {
    const delta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

export function place(messages: readonly Message[], options: PlaceOptions): readonly PlacedMessage[] {
  return messages.map((message, i) => {
    const previous = messages[i - 1];
    const next = messages[i + 1];
    return {
      message,
      head: !continues(previous, message),
      tail: !continues(message, next),
      opensDay:
        previous && sameLocalDay(previous.createdAt, message.createdAt, options.timeZone)
          ? null
          : dayLabel(message.createdAt, options),
    };
  });
}

/**
 * Les trois libellés relatifs — miroir des paramètres `today`/`yesterday`/
 * `dayBeforeYesterday` de `MessageDayLabel.label` (défauts français, comme
 * côté Swift). Le catalogue i18n (dimension 9, non mûre sur toute la v3.1)
 * les remplacera par une résolution i18n sans toucher `dayLabel`.
 */
export type DayLabels = {
  readonly today: string;
  readonly yesterday: string;
  readonly dayBeforeYesterday: string;
};

export const FRENCH_DAY_LABELS: DayLabels = {
  today: "Aujourd'hui",
  yesterday: 'Hier',
  dayBeforeYesterday: 'Avant-hier',
};

/** Capitalise uniquement la première lettre — jamais tous les mots (`.toUpperCase()` capitaliserait la phrase entière). */
function capitalizeFirst(text: string, locale: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
}

function weekdayName(date: Date, locale: string, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  return capitalizeFirst(formatter.format(date), locale);
}

function fullDate(date: Date, locale: string, timeZone: string | undefined, includeYear: boolean): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(includeYear ? { year: 'numeric' as const } : {}),
    ...(timeZone === undefined ? {} : { timeZone }),
  });
  return capitalizeFirst(formatter.format(date), locale);
}

export type DayLabelOptions = {
  readonly now?: Date | number;
  readonly locale: string;
  readonly labels?: DayLabels;
  readonly timeZone?: string;
};

/**
 * Le libellé d'un séparateur de jour — miroir mot pour mot de
 * `MessageDayLabel.label` : J0 (et futur) → `today` ; J-1 → `yesterday` ;
 * J-2 → `dayBeforeYesterday` ; J-3..J-6 → jour de semaine localisé ; J-7+ →
 * jour de semaine + jour + mois (+ année si différente).
 *
 * `locale` est OBLIGATOIRE — un appel sans locale ne compile plus : c'est le
 * témoin que le compilateur tient contre un prisme à un seul échelon
 * (`CLAUDE.md`, leçon 261).
 */
export function dayLabel(iso: Clock, options: DayLabelOptions): string {
  const date = new Date(iso);
  const now = options.now === undefined ? new Date() : new Date(options.now);
  const labels = options.labels ?? FRENCH_DAY_LABELS;
  const daysDiff = daysBetween(date, now, options.timeZone);

  // Une date au futur le même jour calendaire reste « Aujourd'hui ».
  if (daysDiff <= 0) return labels.today;
  if (daysDiff === 1) return labels.yesterday;
  if (daysDiff === 2) return labels.dayBeforeYesterday;
  if (daysDiff <= 6) return weekdayName(date, options.locale, options.timeZone);

  const sameYear = calendarParts(date, options.timeZone).year === calendarParts(now, options.timeZone).year;
  return fullDate(date, options.locale, options.timeZone, !sameYear);
}

export function time(iso: Clock): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
