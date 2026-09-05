/**
 * Les BORNES et MOTIFS que plusieurs familles de schémas Zod partagent —
 * extraits de `utils/validation.ts` par #5216.
 *
 * ## Pourquoi une extraction, et pourquoi celle-ci
 *
 * `utils/validation.ts` porte 2700 lignes pour un plafond de 1000 : le dépôt
 * interdit d'y AJOUTER, il faut en extraire d'abord (directive 2026-09-02). Le
 * lot qui ouvre l'inscription à un écran de trois champs devait faire grossir
 * `AuthSchemas` ; c'est donc `AuthSchemas` qui part (`utils/auth-schemas.ts`),
 * et ce fichier-ci porte ce dont il a besoin ET que le reste de
 * `validation.ts` partage.
 *
 * Le découpage suit la RESPONSABILITÉ, pas la tranche : ici vivent les valeurs
 * qui ne dépendent d'aucun schéma et dont plusieurs schémas dépendent — une
 * longueur, deux motifs compilés depuis leur source unique, deux codeurs de
 * langue. Les recopier chez chaque consommateur aurait fabriqué exactement les
 * jumelles divergentes que `password-min-length-parity.test.ts` existe pour
 * empêcher.
 *
 * `validation.ts` les ré-exporte quand ses importeurs les nommaient déjà
 * (`PASSWORD_MIN_LENGTH`) : aucune adresse d'import n'a bougé.
 *
 * @module @meeshy/shared/utils/validation-primitives
 */

import { z } from 'zod';
import { personNamePatternSource, usernamePatternSource } from '../types/api-schemas.js';
import { isSupportedLanguage } from './languages.js';
import { normalizeLanguageCode } from './language-normalize.js';

/**
 * Nom de personne (prénom / nom). Compilé depuis la source unique
 * `personNamePatternSource` (types/api-schemas.ts) pour que la couche Ajv
 * (body JSON schema Fastify) et la couche Zod rendent le même verdict —
 * notamment l'acceptation des apostrophes typographiques `’`/`ʼ` insérées par
 * le clavier iOS.
 */
export const PERSON_NAME_PATTERN = new RegExp(personNamePatternSource, 'u');

/**
 * Nom d'utilisateur. Compilé depuis la source unique `usernamePatternSource`
 * (types/api-schemas.ts) pour que la couche Ajv (body JSON schema Fastify) et la
 * couche Zod rendent le même verdict — notamment le refus de l'espace et des
 * lettres accentuées, que le charset ASCII exclut.
 */
export const USERNAME_PATTERN = new RegExp(usernamePatternSource);

/**
 * Longueur minimale d'un mot de passe — UNE règle, pour toutes les portes.
 *
 * Elle a valu onze déclarations indépendantes, et trois valeurs différentes :
 * le wizard web ouvrait le pas suivant dès 6, la checklist affichée à
 * l'utilisateur en promettait 8, et les schémas serveur en exigeaient 8. Une
 * saisie de 6 caractères franchissait donc tout le formulaire pour se faire
 * rejeter à la DERNIÈRE étape par un message Ajv brut, trois écrans après le
 * champ fautif.
 *
 * La borne s'applique aux mots de passe qu'on DÉFINIT. Un mot de passe qu'on
 * PROUVE (`currentPassword`) n'a qu'à être non vide : c'est le hash qui
 * l'arbitre, et lui imposer une longueur enfermerait tout compte créé sous une
 * borne plus basse.
 *
 * Garde : `__tests__/password-min-length-parity.test.ts`.
 */
export const PASSWORD_MIN_LENGTH = 6;

export const passwordTooShort = `Mot de passe trop court (min ${PASSWORD_MIN_LENGTH} caractères)`;


/**
 * Code de langue in-app supporté, **validé ET normalisé** (lowercase).
 *
 * Source de vérité unique de la normalisation à l'écriture : `isSupportedLanguage`
 * accepte les codes de manière insensible à la casse (`'EN'`, `'Fr'`) mais ne les
 * transforme pas — sans le `.transform` ci-dessous, un `systemLanguage: 'EN'` serait
 * persisté verbatim et casserait la résolution du Prisme Linguistique côté lecture
 * (les traductions sont stockées sous clé minuscule). On lowercase donc au point
 * d'écriture pour garantir l'invariant « la base ne contient que des codes
 * minuscules », rendant les compensations de lecture (`resolveUserLanguage`) purement
 * défensives.
 *
 * @see packages/shared/utils/conversation-helpers.ts — résolveurs de lecture
 */
export const supportedLanguageCode = z
  .string()
  .min(2)
  .max(5)
  .refine((code) => isSupportedLanguage(code), { message: 'Unsupported language code' })
  .transform((code) => code.toLowerCase());

/**
 * Code de langue de destination personnalisée (priorité 3 du Prisme). Contrairement
 * à {@link supportedLanguageCode}, ce champ n'exige pas que le code figure dans la
 * liste des langues supportées, mais il DOIT être canonique en base : un locale
 * région/script-taggé de plateforme (`'fr-FR'`, `'en_US'`) persisté verbatim comme
 * `'fr-fr'` / `'en-us'` ne matcherait aucune `MessageTranslation.targetLanguage`
 * (clé lowercase) et forcerait la résolution du Prisme sur le message original.
 *
 * Canonicalisation au write boundary via le SSOT {@link normalizeLanguageCode}
 * (`'fr-FR'`/`'fr_FR'` → `'fr'`, `'en-US'` → `'en'`), avec repli `.toLowerCase()`
 * pour les codes que le normaliseur ne sait pas réduire (ISO 639-3 supporté comme
 * `'bas'`, ou code plausible inconnu) : comportement d'acceptation strictement
 * inchangé, seul le stockage des codes région-taggés est corrigé.
 *
 * La borne `.max(6)` reflète la longueur MAXIMALE d'un code 639-3 région-taggé
 * (`[a-z]{3}` + `-` + `[A-Z]{2}` = 6, ex. `'bas-CM'`, `'ewo-CM'`), miroir de
 * {@link CommonSchemas.language}. Un `.max(5)` tombait AVANT la `.transform` et
 * rejetait ces locales de plateforme (`Locale.current` / `Accept-Language`) en
 * HTTP 400 — la même exclusion silencieuse que l'itération 266 a fermée sur les
 * langues de contenu, manquée ici parce que `.min`/`.max` sur deux lignes
 * échappaient à son grep mono-ligne.
 */
export const customDestinationLanguageCode = z
  .string()
  .min(2)
  .max(6)
  .transform((code) => normalizeLanguageCode(code) ?? code.toLowerCase());
