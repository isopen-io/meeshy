/**
 * La semaine ISO, en UTC (#13932, cercles de proximité).
 *
 * Une « semaine active » d'un lien se compte du lundi 00:00 UTC au dimanche 23:59
 * UTC, quel que soit le fuseau des deux personnes : le serveur et les trois
 * clients lisent la même frontière. Aucun `Date#getDay` local ici — un calcul de
 * semaine qui dépend du fuseau de la machine donne deux réponses à deux serveurs.
 *
 * Seule la clé de LIGUE du jeu (`dayKey`) nommait un jour avant ce module ; aucune
 * semaine ISO réutilisable n'existait (relevé 2026-10-31).
 */

const DAY_MS = 86_400_000;

export const utcDayKey = (date: Date): string => date.toISOString().slice(0, 10);

export const utcDayStart = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const addUtcDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);

/** Le lundi 00:00 UTC de la semaine ISO qui contient `date`. */
export const isoWeekStart = (date: Date): Date => {
  const start = utcDayStart(date);
  const sinceMonday = (start.getUTCDay() + 6) % 7;
  return addUtcDays(start, -sinceMonday);
};

/** « 2026-W44 » : l'année est celle du JEUDI de la semaine (règle ISO 8601). */
export const isoWeekKey = (date: Date): string => {
  const thursday = addUtcDays(isoWeekStart(date), 3);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
};
