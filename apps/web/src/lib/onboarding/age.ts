/**
 * **CE QUE LA CARTE DE L'ÂGE VÉRIFIE** (#9928) — la forme de la date, rien de
 * plus : une date complète, déjà arrivée, de moins de cent vingt ans (les
 * bornes de la passerelle, #9927, qui refuserait sinon par un 400). La CLASSE
 * d'âge — moins de 13 ans refusé, 13 à 17 ans fermé à l'écriture dans Global —
 * n'est calculée qu'au serveur : la dupliquer ici ferait deux lois.
 */

export type BirthDateVerdict = 'ok' | 'incomplete' | 'future' | 'tooOld';

const OLDEST_YEARS = 120;
const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** La date LOCALE du jour, `AAAA-MM-JJ` — celle que le sélecteur natif compare. */
const localDay = (date: Date): string => `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;

const yearsBefore = (date: Date, years: number): string =>
  `${pad(date.getFullYear() - years, 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;

const isCalendarDate = (value: string): boolean => {
  const match = SHAPE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
};

export function birthDateBounds(today: Date): { readonly min: string; readonly max: string } {
  return { min: yearsBefore(today, OLDEST_YEARS), max: localDay(today) };
}

export function birthDateVerdict(value: string, today: Date): BirthDateVerdict {
  if (!isCalendarDate(value)) return 'incomplete';
  const { min, max } = birthDateBounds(today);
  if (value > max) return 'future';
  if (value < min) return 'tooOld';
  return 'ok';
}
