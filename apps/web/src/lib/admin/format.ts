/**
 * **CE QU'UN ÉCRAN D'ADMINISTRATION AFFICHE D'UN HORODATAGE** (#6819) — le site
 * UNIQUE, partagé par la fiche d'un membre et le pilotage de l'agent.
 *
 * Il existait déjà, en privé, dans `admin-agent-parts.tsx` ; la fiche d'un
 * membre, elle, rendait `createdAt` et `lastActiveAt` TELS QUELS. Le défaut
 * était invisible à tout témoin — la valeur peinte ÉTAIT la valeur servie,
 * donc chaque assertion sur « la fiche montre la date d'inscription » passait.
 * Seule la recette au navigateur le voit.
 *
 * Une CHARGE ILLISIBLE SE DIT COMME UNE ABSENCE. `new Date('…')` rend une
 * `Invalid Date` et `Intl` la formate en « Invalid Date » : une chaîne
 * anglaise, non traduite, au milieu d'une fiche en sept langues. Le tiret dit
 * la vérité — on ne sait pas quand.
 */
export function adminMoment(iso: string | null, langue: string): string {
  if (iso === null || iso === '') return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(langue, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

/**
 * UN COMPTEUR, groupé selon la langue de la page (#7845) — « 12 345 » en
 * français, « 12,345 » en anglais. Un nombre illisible (négatif, `NaN`) se dit
 * par le même tiret qu'une date absente : les compteurs servis sont des `count`,
 * jamais négatifs, et en afficher un serait afficher une erreur comme un fait.
 */
export function adminCount(n: number, langue: string): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  return new Intl.NumberFormat(langue).format(n);
}

/**
 * UN JOUR, sans heure — une date de naissance, de consentement, de fin de
 * série. L'heure y serait du bruit, et pour une date de naissance servie à
 * minuit UTC, une heure LOCALE fausse (la veille, à l'ouest de Greenwich) :
 * le jour est donc formaté en UTC.
 */
export function adminDay(iso: string | null, langue: string): string {
  if (iso === null || iso === '') return '—';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(langue, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
