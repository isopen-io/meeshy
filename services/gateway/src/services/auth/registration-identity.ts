/**
 * L'identité DÉRIVÉE d'une inscription à trois champs (#5216).
 *
 * L'écran d'inscription demande un nom affiché, une adresse et un mot de passe.
 * La ligne `User`, elle, exige un `username` UNIQUE, un `firstName` et un
 * `lastName` (`String`, non nullable). Ce module est le seul endroit où l'écart
 * se comble — **la complexité se paie dans le CODE, jamais chez l'utilisateur**
 * (dimension 12).
 *
 * ## Deux dérivations, deux natures
 *
 * - **Les noms** sont une PURE fonction du nom affiché : découper, capitaliser.
 *   Rien à demander à personne, donc rien à attendre.
 * - **Le pseudo** est une négociation avec la BASE : il doit être libre. La
 *   fonction qui le rend est donc asynchrone et prend un lecteur — mais elle
 *   coûte UNE requête pour sept candidats, pas sept requêtes.
 *
 * ## Ce qui reste à l'appelant
 *
 * Ce module ne sanitize pas, n'écrit rien, ne lève aucun refus. Un pseudo
 * FOURNI par l'inscription n'entre pas ici : il traverse `normalizeUsername`,
 * et sa collision est un refus (`USERNAME_TAKEN`), pas une occasion de
 * renommer quelqu'un dans son dos.
 *
 * @module services/auth/registration-identity
 */

import { PSEUDO_MAX, PSEUDO_MIN, pseudoRacine } from '@meeshy/shared/utils/registration-identity';

import { candidatsDePseudo } from '../../utils/username-candidates';

/**
 * Longueur de la racine quand il faut lui coller quatre chiffres : 12 + 4 = 16,
 * la borne exacte. Tronquer APRÈS coup couperait les chiffres et rendrait des
 * candidats identiques entre eux.
 */
const RACINE_AVEC_SUFFIXE = 12;
/** Combien de tirages avant d'abandonner. Trois collisions de suite sur 10 000 valeurs est déjà improbable. */
const TIRAGES_MAX = 3;

/**
 * LA PARTIE PURE EST PARTAGÉE (#6479) — elle n'habite plus ici.
 *
 * `pseudoSlug`, `partieLocale`, `slugDAdresse`, `displayNameDepuisEmail`,
 * `derivedNames` et `pseudoRacine` sont montés dans `@meeshy/shared` pour que
 * les CLIENTS puissent montrer, avant l'envoi, le pseudo et le nom affiché que
 * cette passerelle va créer. Une jumelle côté client aurait dérivé autrement un
 * jour, et l'écran aurait promis ce que le serveur ne fait pas.
 *
 * Ce qui RESTE ici est ce qui ne peut pas voyager : `generateUsername` négocie
 * avec la BASE — un pseudo doit être LIBRE, et cette question n'a de réponse
 * que côté serveur.
 */
export {
  capitalizeName,
  derivedNames,
  displayNameDepuisEmail,
  partieLocale,
  pseudoRacine,
  pseudoSlug,
  slugDAdresse,
  type DerivedNames,
} from '@meeshy/shared/utils/registration-identity';

export type UsernameLookup = {
  findMany(args: {
    where: { username: { in: string[]; mode: 'insensitive' } };
    select: { username: true };
  }): Promise<Array<{ username: string }>>;
  findFirst(args: {
    where: { username: { equals: string; mode: 'insensitive' } };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

const quatreChiffres = (): string => String(Math.floor(Math.random() * 10000)).padStart(4, '0');

/**
 * Un pseudo LIBRE dérivé du nom affiché (ou de l'adresse).
 *
 * ## Le coût : UNE requête pour sept candidats
 *
 * La racine et ses six candidats déterministes (`utils/username-candidates.ts`)
 * partent en un seul `findMany … { in }`, et le premier libre gagne. Tester un
 * candidat par requête — ce que faisait l'ancienne route d'availability — coûte
 * sept allers-retours sur le chemin le plus sensible du produit : la première
 * seconde d'un nouveau compte.
 *
 * ## Le dernier recours, et pourquoi il est ALÉATOIRE
 *
 * Sept candidats pris signifie un nom très commun. Continuer de manière
 * déterministe (`base8`, `base9`, …) ferait converger toutes les inscriptions
 * simultanées vers la MÊME suite, donc vers la même collision. Quatre chiffres
 * tirés au sort les dispersent, et trois essais suffisent : la probabilité que
 * les trois tombent sur des valeurs déjà prises est négligeable devant celle
 * d'une panne réseau.
 *
 * La racine est tronquée à 12 AVANT le suffixe, jamais après : tronquer après
 * couperait les chiffres et rendrait des candidats identiques entre eux — un
 * « repli » qui ne replie sur rien.
 */
export async function generateUsername(
  lookup: UsernameLookup,
  input: { readonly displayName?: string; readonly email?: string },
): Promise<string> {
  const racine = pseudoRacine(input);
  const candidats = [racine, ...candidatsDePseudo(racine)].map((c) => c.slice(0, PSEUDO_MAX));

  const pris = await lookup.findMany({
    where: { username: { in: candidats, mode: 'insensitive' } },
    select: { username: true },
  });
  const occupes = new Set(pris.map((u) => u.username.toLowerCase()));

  const libre = candidats.find((c) => c.length >= PSEUDO_MIN && !occupes.has(c.toLowerCase()));
  if (libre) return libre;

  const base = racine.slice(0, RACINE_AVEC_SUFFIXE);
  for (let essai = 0; essai < TIRAGES_MAX; essai += 1) {
    const tire = `${base}${quatreChiffres()}`;
    const collision = await lookup.findFirst({
      where: { username: { equals: tire, mode: 'insensitive' } },
      select: { id: true },
    });
    if (!collision) return tire;
  }

  // Les trois tirages ont collisionné. On rend quand même un candidat : c'est
  // l'unicité de la BASE qui arbitre en dernier ressort, et un échec y est un
  // refus honnête plutôt qu'une boucle sans fin sur un chemin de requête.
  return `${base}${quatreChiffres()}`;
}
