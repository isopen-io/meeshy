/**
 * L'IDENTITÉ DÉRIVÉE D'UNE ADRESSE — la loi, partagée (#6479).
 *
 * Elle vivait dans `services/gateway/src/services/auth/registration-identity.ts`
 * (#5216, #6424). Elle y était JUSTE et INATTEIGNABLE : un écran d'inscription
 * qui veut MONTRER le pseudo et le nom affiché qu'il va créer ne peut pas
 * importer un module du serveur, et la seule alternative — les recalculer —
 * fabrique une jumelle qui dérivera un jour autrement. L'écran promettrait
 * alors un pseudo que la passerelle ne crée pas.
 *
 * > Mesurer où la loi HABITE avant d'accuser qui ne l'applique pas.
 *
 * La passerelle RÉEXPORTE ce module et garde chez elle la seule partie qui ne
 * peut pas voyager : `generateUsername`, qui NÉGOCIE avec la base (un pseudo
 * doit être libre). La frontière est exactement là — ce qui est PUR est
 * partagé, ce qui interroge la base reste au serveur.
 *
 * ## Deux dérivations, deux natures
 *
 * - **Les noms** sont une PURE fonction du nom affiché : découper, capitaliser.
 *   Rien à demander à personne, donc rien à attendre.
 * - **Le pseudo** est une négociation avec la BASE : il doit être libre — et
 *   c'est la raison pour laquelle cette moitié-là n'est pas ici.
 *
 * Ce module ne sanitize pas, n'écrit rien, ne lève aucun refus.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Auth/RegistrationIdentity.swift`,
 * tenu par les mêmes témoins.
 *
 * @module utils/registration-identity
 */

/**
 * Capitalise un nom en respectant les composés — la MÊME fonction que
 * `services/gateway/src/utils/normalize.ts`, qui la réexporte désormais depuis
 * ici plutôt que d'en tenir une seconde copie.
 *
 * `"Jean-Pierre"` reste `"Jean-Pierre"` (et non `"Jean-pierre"`), `"O'Brien"`
 * reste `"O'Brien"`. Les préfixes non-alphabétiques (`"3john"`) sont préservés.
 */
export function capitalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'.-])(\p{L})/gu, (_match, separator, letter) => separator + letter.toUpperCase());
}

/** Longueur maximale d'un `username` — bornée par `registerRequestSchema`. */
export const PSEUDO_MAX = 16;
/** En deçà, un pseudo n'est pas recevable (borne basse du même schéma). */
export const PSEUDO_MIN = 2;
/** Le dernier recours quand le nom affiché ET l'adresse ne donnent rien de slugifiable. */
export const PSEUDO_DE_SECOURS = 'user';

/** Les deux colonnes de nom que la ligne `User` exige. */
export type DerivedNames = {
  readonly firstName: string;
  readonly lastName: string;
};

/**
 * Découpe un nom affiché en prénom / nom.
 *
 * **Un mononyme rend `lastName: ''`, et c'est voulu.** Le schéma Prisma déclare
 * `lastName String` — non nullable — donc la colonne EXIGE une valeur ; la
 * chaîne vide est la seule qui dise « cette personne n'a pas de nom de
 * famille » sans en inventer un. Inventer aurait un coût réel : `searchTokensFor`
 * indexerait un mot que personne n'a écrit, et l'annuaire le rendrait.
 * (`capitalizeName('')` et `searchTokensFor({ lastName: '' })` tolèrent la
 * chaîne vide — vérifié, pas supposé.)
 *
 * Les espaces multiples sont réduits AVANT le découpage : « Ana   María » a
 * deux mots, pas quatre dont deux vides.
 */
export function derivedNames(displayName: string): DerivedNames {
  const mots = displayName.trim().split(/\s+/).filter((mot) => mot !== '');

  return {
    firstName: capitalizeName(mots[0] ?? ''),
    lastName: capitalizeName(mots.slice(1).join(' ')),
  };
}

/**
 * La forme « pseudo » d'une chaîne quelconque.
 *
 * NFD puis retrait des marques combinantes : « Léa » et « Lea » donnent le même
 * slug, sans quoi le pseudo d'une inscription accentuée serait rejeté par
 * `usernamePatternSource` (ASCII strict) juste après avoir été généré.
 */
export function pseudoSlug(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, PSEUDO_MAX);
}

/**
 * La RACINE d'un pseudo généré : le nom affiché, sinon la partie locale de
 * l'adresse, sinon un secours.
 *
 * L'adresse n'est pas un repli cosmétique : un nom affiché entièrement
 * non-latin (« 李雷 », « Пётр ») donne un slug VIDE — les marques combinantes
 * partent, mais les idéogrammes ne sont pas de l'ASCII. Sans ce second essai,
 * toute une population repartirait avec le même `user`.
 */
export function pseudoRacine(input: { readonly displayName?: string; readonly email?: string }): string {
  const depuisNom = pseudoSlug(input.displayName ?? '');
  if (depuisNom.length >= PSEUDO_MIN) return depuisNom;

  const depuisEmail = slugDAdresse(input.email);
  if (depuisEmail.length >= PSEUDO_MIN) return depuisEmail;

  return PSEUDO_DE_SECOURS;
}

/**
 * La partie d'une adresse qui NOMME quelqu'un.
 *
 * Ce n'est pas `email.split('@')[0]` : le `+` ouvre le SOUS-ADRESSAGE, une
 * convention par laquelle on trie son courrier entrant. `jean+meeshy@…` et
 * `jean+banque@…` sont la même personne écrivant le même nom, et servent
 * précisément à s'inscrire quelque part — donc la forme que #6424 rencontrera
 * le plus. Sans cette coupe, ils donneraient `jeanmeeshy` et `jeanbanque` :
 * deux pseudos dont aucun n'est le nom de personne, et dont le second nomme
 * une banque.
 *
 * La coupe ne vaut QUE pour l'identité dérivée. L'adresse elle-même se stocke
 * entière : c'est elle qui reçoit le courrier.
 */
export function partieLocale(email: string | undefined): string {
  const avantArobase = (email ?? '').split('@')[0] ?? '';
  return avantArobase.split('+')[0] ?? '';
}

/**
 * La forme « pseudo » de la partie NOMMANTE d'une adresse.
 *
 * `pseudoSlug` ne connaît qu'un séparateur — l'ESPACE — parce qu'il a été écrit
 * pour un NOM AFFICHÉ, où le point n'en est pas un. Dans une ADRESSE, il l'est :
 * `prenom.nom@entreprise.com` est la façon dont le monde écrit un nom dans une
 * boîte mail. Le passer à `pseudoSlug` tel quel rendait `prenomnom`.
 *
 * Ce comportement était JUSTE tant que l'adresse n'était qu'un dernier recours
 * pour un nom affiché non-latin (#5216, où un témoin l'épinglait avec sa
 * raison). #6424 en fait la source NOMINALE de l'identité : le point redevient
 * ce qu'il est dans une adresse, une frontière de mot.
 *
 * `pseudoSlug` n'est pas touché — le chemin du nom affiché garde exactement son
 * comportement, et ses six témoins avec lui.
 */
export function slugDAdresse(email: string | undefined): string {
  return pseudoSlug(partieLocale(email).replace(/\./g, '-'));
}

/**
 * LE NOM AFFICHÉ tiré d'une adresse (#6424).
 *
 * Directive porteur 2026-09-14 : « on met un e-mail, tu crées un compte avec le
 * pseudo pris de la première partie de l'e-mail, **le display name pareil** ».
 *
 * « Pareil » désigne la SOURCE, pas la forme. Un pseudo IDENTIFIE et vit sous
 * le contrat `^[a-zA-Z0-9_-]+$` ; un nom affiché se LIT. Rendre `marie-dupont`
 * dans les deux colonnes donnerait à toute une population d'inscrits un nom
 * que personne n'écrirait — alors que la même source, lue comme un nom, donne
 * « Marie Dupont ».
 *
 * D'où : les séparateurs redeviennent des espaces, chaque mot prend sa
 * capitale (par `capitalizeName`, la même que `derivedNames` — un nom dérivé
 * ici et un nom découpé là doivent se capitaliser pareil), et le résultat est
 * la SEULE chaîne que `derivedNames` recevra ensuite.
 *
 * Les CHIFFRES séparent comme `.`, `-` et `_` (#7912) : le nom part au serveur,
 * dont `personNamePatternSource` refuse tout chiffre — `jean42@…` rend `Jean`.
 *
 * Rend `''` — jamais un nom inventé — quand rien ne se tire de l'adresse.
 * L'appelant DEMANDE alors, il ne fabrique pas.
 */
export function displayNameDepuisEmail(email: string | undefined): string {
  const slug = slugDAdresse(email);
  if (slug.length < PSEUDO_MIN) return '';

  return slug
    .split(/[^a-z]+/)
    .filter((mot) => mot !== '')
    .map((mot) => capitalizeName(mot))
    .join(' ');
}

/** Ce que la génération a besoin de LIRE — jamais un `PrismaClient` entier. */
