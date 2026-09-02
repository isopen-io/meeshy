/**
 * Ce qu'une inscription ÉCRIT dans les trois colonnes de langue du Prisme (#4682).
 *
 * ## Pourquoi un module, et pas une méthode
 *
 * La règle n'utilise aucun `this` : elle ne dépend ni de Prisma, ni du service
 * d'e-mail, ni d'une session. Logée dans `AuthService`, c'était une fonction
 * libre dans une classe — et un fichier déjà hors budget (#4426) qui grossit.
 * Ici elle se relit et s'exerce seule.
 *
 * ## Le défaut qu'elle corrige
 *
 * `AuthService.register` écrivait, dans le `data` du `user.create` :
 *
 * ```ts
 * systemLanguage: data.systemLanguage || 'fr',
 * regionalLanguage: data.regionalLanguage || 'fr',
 * ```
 *
 * **Un défaut qui remplit un trou avec une valeur plausible ne se voit pas dans
 * les lecteurs — il se voit à l'ÉCRITURE.** Le repli `|| 'fr'` a l'air d'un
 * défaut de robustesse ; c'était une décision produit prise dans une expression
 * booléenne. Le Prisme lisant `systemLanguage` en priorité ABSOLUE, un compte
 * créé en ne demandant que `regionalLanguage: 'de'` repartait avec un rang 1
 * `'fr'` : l'allemand réellement demandé était définitivement surclassé par un
 * littéral que personne n'avait choisi.
 *
 * ## Les deux règles, une par NATURE de colonne
 *
 * - **Rangs 2 et 3** — `regionalLanguage`, `customDestinationLanguage`, tous
 *   deux `String?` au schéma : un rang que l'utilisateur n'a pas rempli n'est
 *   PAS matérialisé. `null` dit « non réglé » et laisse la lecture descendre ;
 *   `'fr'` disait « je veux du français », ce que personne n'avait demandé.
 * - **Rang 1** — `systemLanguage`, `String @default("en")`, donc **NON
 *   nullable** : la colonne EXIGE une valeur. Le littéral ne peut pas
 *   disparaître ici ; il peut seulement cesser d'être ARBITRAIRE. On y écrit
 *   donc le rang le plus haut que l'inscription a RÉELLEMENT exprimé, et le
 *   repli terminal seulement lorsqu'elle n'en exprime AUCUN. Un compte inscrit
 *   en `regionalLanguage: 'de'` repart en allemand, jamais en français.
 *
 * Poser `null` au rang 1 changerait la nature du remède : il faudrait rendre la
 * colonne nullable dans `packages/shared/prisma/schema.prisma`, et relire tous
 * les lecteurs qui la tiennent aujourd'hui pour non-nulle
 * (`SocketIOUser.systemLanguage: string`, `userSchema`). C'est un lot à part.
 *
 * ## Ce que la descente ne fait PAS
 *
 * Elle s'arrête au rang 3. `deviceLocale` (rang 4) est une OBSERVATION du client
 * — l'en-tête `X-Device-Locale` — et non une préférence d'inscription : l'écrire
 * au rang 1 servirait en priorité ABSOLUE une langue que le lecteur n'a jamais
 * choisie, ce qui est le défaut qu'on corrige, avec une autre provenance. Cette
 * colonne a son écrivain (`middleware/deviceLocale.ts`, sur les requêtes
 * authentifiées) et reste `null` à la création.
 *
 * La descente vient de `resolveUserLanguagesOrdered` — la SSOT partagée — et non
 * du raccord de lecture du gateway (`utils/recipient-language.ts`) : celui-ci
 * tient ENSEMBLE la forme d'un `select` et la descente, or ici aucune ligne
 * n'est lue. Le prisme EST la charge d'inscription.
 */

import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

/**
 * Le repli TERMINAL du Prisme. C'est un PARAMÈTRE de résolution, pas une
 * préférence : il ne s'écrit en base que si l'inscription n'exprime AUCUNE
 * langue, et le seul rang qu'il puisse remplir est celui que le schéma refuse
 * de laisser vide.
 */
export const REGISTRATION_FALLBACK_LANGUAGE = 'fr';

/** Les trois rangs du Prisme qu'une inscription peut exprimer. */
export type RegistrationLanguageInput = {
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
};

/** Les trois colonnes de langue que le `user.create` de l'inscription reçoit. */
export type RegistrationLanguages = {
  readonly systemLanguage: string;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
};

/**
 * Un rang non rempli est `undefined`, jamais `''` : c'est la notion de « rang
 * renseigné » du résolveur partagé (`normalizeInAppLanguage` tient `''`, `'  '`
 * et `'-'` pour NON DÉFINIS), portée à l'ÉCRITURE pour que la base ne garde pas
 * une valeur que la lecture ignorerait.
 */
const preferenceRenseignee = (valeur?: string | null): string | undefined =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : undefined;

/**
 * Une préférence explicite est gardée VERBATIM — les prefs sont persistées sans
 * normalisation et le résolveur normalise à la lecture. Seule la valeur DÉRIVÉE
 * du rang 1 traverse la normalisation, parce qu'elle doit être un code servable.
 */
export function registrationLanguages(data: RegistrationLanguageInput): RegistrationLanguages {
  const regionalLanguage = preferenceRenseignee(data.regionalLanguage) ?? null;
  const customDestinationLanguage = preferenceRenseignee(data.customDestinationLanguage) ?? null;

  return {
    systemLanguage:
      preferenceRenseignee(data.systemLanguage) ??
      resolveUserLanguagesOrdered({ regionalLanguage, customDestinationLanguage })[0] ??
      REGISTRATION_FALLBACK_LANGUAGE,
    regionalLanguage,
    customDestinationLanguage,
  };
}
