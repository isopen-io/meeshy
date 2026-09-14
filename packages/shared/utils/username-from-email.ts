import { USERNAME_PATTERN } from './validation-primitives.js';

/**
 * LE PSEUDO DÉRIVÉ D'UNE ADRESSE (#6424).
 *
 * Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte avec le
 * pseudo pris de la première partie de l'e-mail, le nom affiché pareil ».
 *
 * La partie locale d'une adresse n'est PAS un pseudo valide : le contrat du
 * dépôt exige `^[a-zA-Z0-9_-]+$` sur 2 à 16 caractères, quand une adresse
 * accepte les points, le `+` de sous-adressage, les accents, et peut être plus
 * longue ou plus courte que ces bornes. Prendre `email.split('@')[0]` tel quel
 * produirait des pseudos que le schéma refuse — un refus survenant APRÈS que
 * l'utilisateur a cru s'inscrire.
 *
 * Cette loi est PURE : elle ne connaît ni base ni réseau. L'unicité, qui
 * demande d'interroger la base, est traitée par `candidates()` — la loi propose
 * une suite de propositions, l'appelant prend la première libre.
 */

/** Bornes du contrat de pseudo (`api-schemas/auth.ts`, `usernameProperty`). */
export const USERNAME_MIN = 2;
export const USERNAME_MAX = 16;

/**
 * Le pseudo tiré d'une adresse, conforme au contrat — ou `null` si rien
 * d'exploitable n'en sort.
 *
 * Ce que la normalisation fait, et pourquoi :
 * - **le sous-adressage est coupé** (`jean+meeshy@…` → `jean`) : le `+` sert à
 *   filtrer son courrier, il ne fait pas partie de l'identité ;
 * - **les diacritiques sont dépliés** (`prénom` → `prenom`) plutôt que
 *   supprimés : `jérôme` doit donner `jerome`, pas `jrme` ;
 * - **tout caractère hors contrat devient `-`**, puis les séparateurs se
 *   réduisent et se taillent aux bords — `marie..dupont.` → `marie-dupont` ;
 * - **la casse tombe** : deux adresses qui ne diffèrent que par la casse ne
 *   doivent pas produire deux pseudos.
 *
 * `null` — jamais une chaîne vide, jamais un pseudo inventé — quand il ne reste
 * rien de conforme : l'appelant doit alors DEMANDER un pseudo, pas en fabriquer
 * un que l'utilisateur ne reconnaîtrait pas.
 */
export function usernameFromEmail(email: string): string | null {
  const local = String(email).split('@')[0] ?? '';
  const base = local
    .split('+')[0]
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');

  if (base === undefined || base.length === 0) return null;
  const coupe = base.slice(0, USERNAME_MAX);
  if (coupe.length < USERNAME_MIN) return null;
  return USERNAME_PATTERN.test(coupe) ? coupe : null;
}

/**
 * Une suite de propositions, de la plus proche de l'adresse à la plus
 * distante : `marie`, `marie2`, `marie3`… L'appelant prend la première que la
 * base ne connaît pas.
 *
 * Le suffixe est un COMPTEUR, jamais un aléa : deux inscriptions successives
 * depuis `marie@a.com` et `marie@b.com` donnent `marie` puis `marie2`, ce qu'un
 * humain comprend. Un suffixe aléatoire donnerait `marie7f3a`, que personne ne
 * reconnaît comme le sien.
 *
 * Le compteur est inséré en RESPECTANT la borne haute : `unnomtreslong` tronqué
 * à 16 cède la place à ses chiffres plutôt que de déborder — sans quoi la
 * deuxième proposition serait refusée par le schéma, et l'inscription
 * échouerait précisément sur les pseudos les plus disputés.
 */
export function usernameCandidates(email: string, howMany = 20): readonly string[] {
  const base = usernameFromEmail(email);
  if (base === null) return [];
  const out: string[] = [base];
  for (let n = 2; out.length < howMany; n += 1) {
    const suffixe = String(n);
    const tronque = base.slice(0, Math.max(USERNAME_MIN, USERNAME_MAX - suffixe.length));
    out.push(`${tronque}${suffixe}`);
  }
  return out;
}

/**
 * Le nom affiché tiré de l'adresse — le porteur le veut « pareil » que le
 * pseudo, mais PRÉSENTABLE : c'est un nom qu'on lit, pas un identifiant.
 *
 * Les séparateurs redeviennent des espaces et chaque mot prend sa capitale :
 * `marie-dupont` → `Marie Dupont`. Le pseudo, lui, reste tel quel — les deux
 * n'ont pas le même métier.
 */
export function displayNameFromEmail(email: string): string | null {
  const base = usernameFromEmail(email);
  if (base === null) return null;
  const nom = base
    .split(/[-_]+/)
    .filter((mot) => mot.length > 0)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ');
  return nom.length === 0 ? null : nom;
}
