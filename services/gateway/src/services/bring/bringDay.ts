/**
 * Le JOUR du quota du Bring (#13936, spec § 1.5 – 1.7) : le jour CALENDAIRE du
 * destinataire, dans son fuseau (`User.timezone`, IANA). Un fuseau absent ou
 * illisible retombe sur le jour UTC — jamais sur le fuseau du serveur, qui ne
 * dit rien de personne.
 *
 * `resetsAt` est le prochain minuit LOCAL, exprimé en UTC : le compteur repart à
 * cet instant, et c'est lui que le client affiche (« de nouveau demain »).
 */

const DAY_MS = 86_400_000;

type WallClock = { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly second: number };

const isUsableTimeZone = (timeZone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

const resolvedTimeZone = (timeZone: string | null | undefined): string =>
  typeof timeZone === 'string' && timeZone.trim() && isUsableTimeZone(timeZone.trim()) ? timeZone.trim() : 'UTC';

function wallClock(at: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));
  const read = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute'), second: read('second') };
}

/** Le décalage du fuseau à l'instant `at`, en millisecondes (local − UTC). */
const offsetAt = (at: number, timeZone: string): number => {
  const w = wallClock(at, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(at / 1000) * 1000;
};

/** L'instant UTC d'un minuit local, corrigé une seconde fois pour un changement d'heure entre les deux lectures. */
function localMidnightUtc(year: number, monthIndex: number, day: number, timeZone: string): number {
  const naive = Date.UTC(year, monthIndex, day);
  const first = naive - offsetAt(naive, timeZone);
  return naive - offsetAt(first, timeZone);
}

const pad = (n: number): string => String(n).padStart(2, '0');

export type BringDay = { readonly day: string; readonly resetsAt: Date };

export function bringDayOf(now: Date, timeZone: string | null | undefined): BringDay {
  const zone = resolvedTimeZone(timeZone);
  const w = wallClock(now.getTime(), zone);
  const next = new Date(Date.UTC(w.year, w.month - 1, w.day) + DAY_MS);
  return {
    day: `${w.year}-${pad(w.month)}-${pad(w.day)}`,
    resetsAt: new Date(localMidnightUtc(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), zone)),
  };
}
