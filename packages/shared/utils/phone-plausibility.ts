/**
 * LA PLAUSIBILITÉ D'UN NUMÉRO (#6479) — distincte de sa VALIDITÉ.
 *
 * `normalizePhoneWithCountry` (libphonenumber) répond « ce numéro peut-il
 * exister dans ce pays ». Elle dit oui à `0600000000` et à `0642424242` : ils
 * ont la bonne longueur et le bon préfixe. Ce module répond à l'autre
 * question — « quelqu'un a-t-il tapé son numéro, ou a-t-il rempli la case pour
 * qu'elle se taise ». Les deux se posent ; aucune ne remplace l'autre.
 *
 * Directive porteur 2026-09-14 : « vérifier que c'est pas un faux numéro non
 * plus (> 8 chiffres, pas de chiffres identiques à la suite ex. 1111100000 ou
 * de répétition ex 42424242) ».
 *
 * Le refus est MOTIVÉ, jamais un booléen nu : « numéro invalide » n'apprend
 * rien à qui a tapé le sien de travers, et les trois motifs se corrigent
 * différemment.
 */

/** « > 8 chiffres » — la borne du porteur, lue à la lettre. */
export const PHONE_MIN_DIGITS = 9;

/**
 * Le plus long train de chiffres IDENTIQUES qu'un vrai numéro peut porter.
 *
 * Quatre est courant (`06 44 44 12 30` existe) ; cinq ne l'est plus, et
 * `1111100000` — l'exemple du porteur — en porte deux de cinq.
 */
export const PHONE_MAX_IDENTICAL_RUN = 5;

/**
 * Le plus court motif dont une RÉPÉTITION intégrale trahit un remplissage.
 *
 * `42424242` est « 42 » quatre fois. On borne le motif à 4 chiffres : au-delà,
 * la répétition intégrale d'un groupe plus long est trop rare pour distinguer
 * un faux d'un vrai, et refuser un vrai numéro coûte plus cher que d'en
 * accepter un faux — le numéro n'est même pas requis.
 */
export const PHONE_MAX_REPEATED_UNIT = 4;

export type PhoneImplausibility = 'too-short' | 'identical-run' | 'repeated-pattern';

/** Les chiffres seuls — tout le reste (espaces, points, indicatif, tirets) sort. */
export function phoneDigitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Le motif du refus, ou `null` quand le numéro est plausible.
 *
 * Une chaîne VIDE est plausible : le numéro n'est pas requis (#6424), et
 * refuser l'absence rendrait obligatoire ce que le produit dit facultatif.
 * C'est la même distinction que `isPasswordValid` / `hasPassword` côté
 * formulaire — « cette saisie est-elle acceptable » n'est pas « y a-t-il une
 * saisie ».
 */
export function phoneImplausibility(raw: string): PhoneImplausibility | null {
  const digits = phoneDigitsOnly(raw);
  if (digits.length === 0) return null;
  if (digits.length < PHONE_MIN_DIGITS) return 'too-short';
  if (hasIdenticalRun(digits)) return 'identical-run';
  if (isWhollyRepeated(digits)) return 'repeated-pattern';
  return null;
}

export function isPlausiblePhone(raw: string): boolean {
  return phoneImplausibility(raw) === null;
}

function hasIdenticalRun(digits: string): boolean {
  let run = 1;
  for (let i = 1; i < digits.length; i += 1) {
    run = digits[i] === digits[i - 1] ? run + 1 : 1;
    if (run >= PHONE_MAX_IDENTICAL_RUN) return true;
  }
  return false;
}

/**
 * `true` quand TOUTE la chaîne est un motif court répété — jamais quand elle
 * le contient seulement.
 *
 * La nuance porte le lot : `0642424242` CONTIENT « 42 » quatre fois et reste
 * un numéro parfaitement ordinaire. Seule la répétition INTÉGRALE trahit.
 */
function isWhollyRepeated(digits: string): boolean {
  for (let unit = 1; unit <= PHONE_MAX_REPEATED_UNIT; unit += 1) {
    if (digits.length % unit !== 0) continue;
    if (digits.length / unit < 3) continue;
    const head = digits.slice(0, unit);
    if (digits.match(new RegExp(`^(?:${head})+$`)) !== null) return true;
  }
  return false;
}
