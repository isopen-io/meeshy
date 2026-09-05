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
 * ## Où la locale appareil intervient — et où elle n'intervient PAS (#5216)
 *
 * Ce doc-comment affirmait l'inverse jusqu'au 2026-09-05 : « `deviceLocale`
 * (rang 4) […] reste `null` à la création ». La phrase était juste sur le
 * DANGER — écrire la locale appareil au rang 1 « servirait en priorité ABSOLUE
 * une langue que le lecteur n'a jamais choisie » — et fausse sur le remède,
 * parce qu'elle comparait la locale à une PRÉFÉRENCE alors qu'elle ne concourt
 * qu'au repli terminal.
 *
 * **La locale appareil n'écrase JAMAIS une préférence exprimée.** Elle ne
 * remplit le rang 1 que lorsque l'inscription n'exprime AUCUN rang — c'est-à-dire
 * exactement là où le code écrivait auparavant le littéral `'fr'`. Le choix
 * n'est donc pas entre « la locale » et « la préférence » : il est entre
 * « la locale » et « le français, quoi qu'il arrive ». Un compte créé depuis un
 * appareil espagnol, sans aucune langue au formulaire, repartait en français.
 *
 * L'ordre est celui du Prisme, et il est TOTAL :
 *
 * | rang | source |
 * |---|---|
 * | 1 | `systemLanguage` explicite |
 * | 2-3 | le plus haut rang exprimé par l'inscription (`resolveUserLanguagesOrdered`) |
 * | 4 | `deviceLocale`, normalisée |
 * | — | `REGISTRATION_FALLBACK_LANGUAGE`, quand rien n'est connu |
 *
 * La colonne `deviceLocale` est de plus PERSISTÉE à la création quand elle est
 * connue, plutôt qu'attendue de la première requête authentifiée
 * (`middleware/deviceLocale.ts`) : la connaître dès la ligne d'origine évite
 * qu'un tout premier message parte avant que le rang 4 n'existe.
 *
 * Un `default` de schéma rendait cette descente INATTEIGNABLE : Ajv et Zod
 * posaient tous deux `'fr'` sur `systemLanguage`/`regionalLanguage` avant le
 * handler, donc l'inscription exprimait TOUJOURS un rang. Les deux sont retirés
 * (#5216) — c'est le témoin de ce lot.
 *
 * La descente vient de `resolveUserLanguagesOrdered` — la SSOT partagée — et non
 * du raccord de lecture du gateway (`utils/recipient-language.ts`) : celui-ci
 * tient ENSEMBLE la forme d'un `select` et la descente, or ici aucune ligne
 * n'est lue. Le prisme EST la charge d'inscription.
 */

import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';

/**
 * Le repli TERMINAL du Prisme. C'est un PARAMÈTRE de résolution, pas une
 * préférence : il ne s'écrit en base que si l'inscription n'exprime AUCUNE
 * langue, et le seul rang qu'il puisse remplir est celui que le schéma refuse
 * de laisser vide.
 */
export const REGISTRATION_FALLBACK_LANGUAGE = 'fr';

/**
 * Ce qu'une inscription peut exprimer : les trois rangs de PRÉFÉRENCE, plus la
 * locale APPAREIL — qui n'est pas une préférence et se tient donc à part, au
 * rang 4, jamais mêlée aux trois autres.
 */
export type RegistrationLanguageInput = {
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string;
  readonly customDestinationLanguage?: string;
  /** L'en-tête `X-Device-Locale`, ou l'étiquette la mieux notée d'`Accept-Language`. */
  readonly deviceLocale?: string;
};

/** Les colonnes de langue que le `user.create` de l'inscription reçoit. */
export type RegistrationLanguages = {
  readonly systemLanguage: string;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
  /**
   * La colonne du rang 4, persistée dès la création quand elle est connue —
   * `null` sinon. Normalisée, comme le fait `middleware/deviceLocale.ts` :
   * la base ne garde que des codes servables.
   */
  readonly deviceLocale: string | null;
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
  const deviceLocale = normalizeLanguageCode(data.deviceLocale) ?? null;

  return {
    systemLanguage:
      preferenceRenseignee(data.systemLanguage) ??
      resolveUserLanguagesOrdered({ regionalLanguage, customDestinationLanguage })[0] ??
      deviceLocale ??
      REGISTRATION_FALLBACK_LANGUAGE,
    regionalLanguage,
    customDestinationLanguage,
    deviceLocale,
  };
}
