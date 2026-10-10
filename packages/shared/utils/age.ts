/**
 * Âge calculé depuis une date de naissance, en années révolues.
 */
export function calculateAge(birthDate: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Majorité VÉRIFIÉE (18 ans) — fail-closed sur l'inconnu. `birthDate` absente
 * (compte n'ayant jamais renseigné sa date de naissance) rend `false`,
 * jamais `true` : pour une garde de protection des mineurs, l'ABSENCE de
 * preuve n'est pas une preuve d'âge adulte. Réservé aux décisions où une
 * majorité non prouvée doit se comporter comme une minorité (ex: précision
 * de découvrabilité géographique EXACT, #3637) — ne pas réutiliser pour un
 * affichage cosmétique qui préférerait l'inverse.
 */
export function isAdult(birthDate: Date | null | undefined, referenceDate: Date = new Date()): boolean {
  if (!birthDate) return false;
  return calculateAge(birthDate, referenceDate) >= 18;
}

/** Âge minimal pour ouvrir un compte : une date déclarée sous ce seuil est refusée (#9927). */
export const MINIMUM_ACCOUNT_AGE = 13;

/** Âge de la majorité : sous ce seuil, Meeshy Global est en lecture seule (#9927). */
export const ADULT_AGE = 18;

/** Au-delà, une date déclarée est improbable et refusée (#9927). */
export const MAXIMUM_PLAUSIBLE_AGE = 120;

/**
 * Années révolues entre `birthDate` et `now`, lues dans le calendrier UTC —
 * l'anniversaire compte le jour même (18 ans le jour de ses 18 ans), et un
 * 29 février prend son année le 1er mars d'une année non bissextile.
 *
 * UTC et non l'heure locale de la machine : une date déclarée `AAAA-MM-JJ` est
 * rangée à minuit UTC (`parseBirthDateDay`), et lire ses composantes en heure
 * locale déplacerait d'un jour l'anniversaire sur tout serveur à l'ouest de
 * Greenwich. `calculateAge` reste en heure locale pour ses appelants
 * historiques ; toute décision de la règle des 13-17 ans passe par celle-ci.
 */
export function ageInFullYearsUtc(birthDate: Date, now: Date): number {
  const years = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
  const birthdayNotYetReached =
    monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthDate.getUTCDate());
  return birthdayNotYetReached ? years - 1 : years;
}

/**
 * Mineur DÉCLARÉ — l'inverse exact d'`isAdult` sur l'inconnu : une date absente
 * ou illisible rend `false`. La règle des 13-17 ans (#9927) RESTREINT ce qu'une
 * déclaration établit, et l'étape d'âge de l'onboarding est facultative : ne
 * rien déclarer ne doit rien restreindre. Ne pas employer pour une garde qui
 * exige une majorité PROUVÉE — c'est `isAdult`.
 */
export function isDeclaredMinor(birthDate: Date | null | undefined, now: Date): boolean {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return false;
  return ageInFullYearsUtc(birthDate, now) < ADULT_AGE;
}

/**
 * Sous l'âge minimal DÉCLARÉ (#9927) : la déclaration a été refusée mais
 * ÉCRITE (un refus est définitif, il ne se contourne pas en redéclarant), et
 * le compte ne se connecte plus tant qu'il a moins de 13 ans révolus — la
 * porte se rouvre d'elle-même le jour de ses 13 ans. L'inconnu n'est pas refusé.
 */
export function isBelowMinimumAge(birthDate: Date | null | undefined, now: Date): boolean {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return false;
  return ageInFullYearsUtc(birthDate, now) < MINIMUM_ACCOUNT_AGE;
}

const BIRTH_DATE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `AAAA-MM-JJ` → minuit UTC de ce jour, ou `null` si la forme est autre ou si
 * le jour n'existe pas au calendrier (un 29 février d'année non bissextile, un
 * 31 avril) — `new Date('2009-02-29')` le reporterait en silence au 1er mars.
 */
export function parseBirthDateDay(value: string): Date | null {
  const match = BIRTH_DATE_DAY.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const dayOfMonth = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  const sameDay =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === dayOfMonth;
  return sameDay ? date : null;
}

export type BirthDateVerdict = 'admitted' | 'in-future' | 'implausible' | 'below-minimum';

/** Ce que la loi dit d'une date déclarée, à l'instant `now` (#9927). */
export function judgeDeclaredBirthDate(birthDate: Date, now: Date): BirthDateVerdict {
  if (birthDate.getTime() > now.getTime()) return 'in-future';
  const age = ageInFullYearsUtc(birthDate, now);
  if (age > MAXIMUM_PLAUSIBLE_AGE) return 'implausible';
  if (age < MINIMUM_ACCOUNT_AGE) return 'below-minimum';
  return 'admitted';
}
