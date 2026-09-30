import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

import { platformLabel } from './interpret/language';

/**
 * **INTERPRÉTER UNE FICHE MEMBRE** (#8005) — les fonctions PURES qui disent en mots
 * ce que la passerelle sert en valeurs : l'âge depuis une date de naissance,
 * l'appareil depuis un agent utilisateur, une durée en jours. La langue et
 * l'horloge sont toujours passées, jamais lues.
 */

/**
 * L'ÂGE EN ANNÉES RÉVOLUES depuis la date de naissance, à `now` — l'anniversaire
 * de l'année compte : un membre né le 12 mars a 31 ans le 12 mars, pas avant.
 * Une date illisible, dans le futur ou au-delà de 130 ans n'est pas un âge : `null`.
 */
export function ageOf(birthDate: string | null, now: Date): number | null {
  if (birthDate === null || birthDate === '') return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime()) || born.getTime() > now.getTime()) return null;
  const years =
    now.getUTCFullYear() -
    born.getUTCFullYear() -
    (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate()) ? 1 : 0);
  return years >= 0 && years <= 130 ? years : null;
}

type DeviceFamily = 'ios' | 'android' | 'desktop' | 'web' | 'unknown';

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bMeeshy\b/i, 'Meeshy'],
  [/\bEdg(?:e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|CriOS)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
];

function familyOf(userAgent: string): DeviceFamily {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X|Windows|Linux|X11|CrOS/i.test(userAgent)) return 'desktop';
  return 'unknown';
}

/**
 * L'APPAREIL, DIT EN MOTS — « Safari · iPhone / iPad », « Chrome · Ordinateur ».
 * `lastLoginDevice` et `registrationDevice` sont l'agent utilisateur brut de la
 * requête : une chaîne de soixante caractères qu'aucun administrateur ne lit. Le
 * navigateur est un nom propre (il ne se traduit pas), la plateforme passe par
 * `platformLabel`. Un agent qu'on ne sait pas lire ne s'affiche PAS tel quel :
 * « Plateforme inconnue ». Vide ⇒ `null` (l'appelant dit « Non renseigné »).
 */
export function deviceLabel(userAgent: string | null | undefined, language: AdminLanguage): string | null {
  const agent = userAgent?.trim() ?? '';
  if (agent === '') return null;
  const family = familyOf(agent);
  const browser = BROWSERS.find(([pattern]) => pattern.test(agent))?.[1] ?? null;
  const platform = platformLabel(family, language);
  return browser === null ? platform : `${browser} · ${platform}`;
}

/** Une durée en JOURS, avec l'unité de la langue (« 4 jours », « 4 days ») — pluriels compris. */
export function formatDays(days: number, language: AdminLanguage): string {
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'day', unitDisplay: 'long' }).format(days);
}

/** Des ANNÉES, avec l'unité de la langue (« 31 ans », « 31 years »). */
export function formatYears(years: number, language: AdminLanguage): string {
  return new Intl.NumberFormat(language, { style: 'unit', unit: 'year', unitDisplay: 'long' }).format(years);
}
