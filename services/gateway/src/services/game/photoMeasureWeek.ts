/**
 * LA FENÊTRE DE LA MESURE DE L'IMMORTALISATION (D15, #10185 — lot L20 #10176) : une SEMAINE ISO entière, du lundi
 * 00:00 UTC au lundi suivant, et rien d'autre.
 *
 * Une fenêtre libre se laisse soustraire : `[J, J+2)` moins `[J+1, J+2)` rend la journée J, et une fenêtre d'un seul
 * jour rend ses cellules à l'heure près. Des semaines ISO sont deux à deux identiques ou disjointes : aucune différence
 * entre deux rapports ne descend sous la semaine. Une semaine encore OUVERTE ne se mesure pas — la relire le lendemain
 * soustrairait la journée écoulée.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const ISO_WEEK = /^(\d{4})-W(\d{2})$/;

export type IsoWeekWindow = { readonly week: string; readonly from: Date; readonly to: Date };

const isoWeekday = (time: number): number => (new Date(time).getUTCDay() + 6) % 7;

const mondayOfFirstWeek = (year: number): number => {
  const fourthOfJanuary = Date.UTC(year, 0, 4);
  return fourthOfJanuary - isoWeekday(fourthOfJanuary) * DAY_MS;
};

/** `AAAA-Www` ⇒ `[lundi, lundi suivant)` en UTC ; `null` hors de la grammaire ou au-delà de la dernière semaine de l'année. */
export function isoWeekWindow(week: string): IsoWeekWindow | null {
  const match = ISO_WEEK.exec(week);
  if (match === null) return null;
  const year = Number(match[1]);
  const index = Number(match[2]);
  const from = mondayOfFirstWeek(year) + (index - 1) * WEEK_MS;
  if (index < 1 || from >= mondayOfFirstWeek(year + 1)) return null;
  return { week, from: new Date(from), to: new Date(from + WEEK_MS) };
}

/** La semaine ISO d'un instant : celle de son jeudi, qui en donne l'année. */
export function isoWeekOf(date: Date): string {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const thursday = day + (3 - isoWeekday(day)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const index = Math.floor((thursday - mondayOfFirstWeek(year)) / WEEK_MS) + 1;
  return `${year}-W${String(index).padStart(2, '0')}`;
}

/** La dernière semaine ISO CLOSE à l'instant `now` : celle qui précède la semaine en cours. */
export const lastClosedIsoWeek = (now: Date): string => isoWeekOf(new Date(now.getTime() - WEEK_MS));

export const isClosedWeek = (window: IsoWeekWindow, now: Date): boolean => window.to.getTime() <= now.getTime();
