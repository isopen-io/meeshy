/**
 * Les bornes de longueur d'une IDENTITÉ — pseudo et noms — dans un module sans
 * dépendance, pour que `auth.ts` (qui importe `user.ts`) et `user.ts` les citent
 * tous deux sans se boucler. `auth.ts` les ré-exporte : aucune adresse d'import
 * n'a bougé.
 */

/**
 * Les bornes d'un pseudo d'inscription — LA source (#8082). Le schéma Ajv
 * `registerRequestSchema` (`auth.ts`), la dérivation (`utils/registration-identity.ts`), le changement
 * de pseudo (`PATCH /users/me/username`) et le verdict client
 * (`utils/username-rule.ts`) les citent ; le miroir Swift
 * (`RegistrationIdentity.pseudoMin/pseudoMax`) est tenu par sa suite.
 * Un pseudo de 17 caractères passait le formulaire iOS faute de les connaître.
 */
export const usernameMinLength = 3;
export const usernameMaxLength = 16;

/**
 * La borne basse d'un NOM — prénom, nom, nom affiché — une fois rogné (#13825).
 *
 * Directive porteur 2026-10-30 : « on ne peut pas avoir pour pseudo ou pour nom
 * A ou B, mais Al, Li, Ly ou Sy sont autorisés ». Le pseudo commence à 3
 * (`usernameMinLength`), un nom à 2. Ajv ne sait pas rogner : son `minLength`
 * refuse « A », la couche Zod (`validation-primitives.ts`, `atLeastTrimmed`)
 * refuse « A » entouré d'espaces.
 *
 * Ni l'une ni l'autre ne s'applique à la CONNEXION : `loginRequestSchema` et
 * `AuthSchemas.login` gardent leur minimum, pour qu'un compte créé sous
 * l'ancienne borne (pseudo de 2 caractères) se connecte encore.
 */
export const nameMinLength = 2;
