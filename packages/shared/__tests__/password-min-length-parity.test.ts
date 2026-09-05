/**
 * Une seule longueur minimale de mot de passe, partout.
 *
 * Le 2026-08-18, l'inscription web échouait à la DERNIÈRE étape. Le wizard
 * ouvrait le pas suivant dès 6 caractères (`register-form-wizard.tsx`), la
 * checklist affichée à l'utilisateur en annonçait 8
 * (`PasswordRequirementsChecklist.tsx`), et `registerRequestSchema` en exigeait
 * 8 côté serveur. Quelqu'un qui saisissait 6 ou 7 caractères franchissait donc
 * tous les pas, remplissait tout le formulaire, et se faisait rejeter à la fin
 * par `body/password must NOT have fewer than 8 characters` — un message Ajv
 * brut qui ne désigne même pas l'étape fautive, à trois écrans de là.
 *
 * Le défaut n'est PAS le chiffre : c'est qu'il y en avait trois. Une règle
 * dupliquée en onze endroits dérive au premier changement, et la dérive ne se
 * voit qu'en production, sur le parcours d'entrée du produit.
 *
 * Deux pièges que ce garde ferme en même temps :
 *
 *   - `currentPassword` des routes de CHANGEMENT de mot de passe. Le laisser à
 *     8 pendant que l'inscription en accepte 6 enferme définitivement : un
 *     compte créé avec 6 caractères ne peut plus jamais changer son mot de
 *     passe, puisqu'il doit d'abord prouver l'ancien — refusé par le schéma.
 *   - la checklist. Elle ne valide rien, elle PROMET. Une promesse qui ne
 *     correspond pas à la règle appliquée est un mensonge à l'utilisateur.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PASSWORD_MIN_LENGTH,
  AuthSchemas,
  updatePasswordSchema,
} from '../utils/validation.js';
import { registerRequestSchema } from '../types/api-schemas.js';

const REPO = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/** Longueurs littérales d'un champ mot de passe, par fichier. */
function passwordLengthLiterals(source: string): readonly number[] {
  const patterns = [
    // Zod : `password: z.string().min(6…`  /  `newPassword: z.string().min(6…`
    /(?:^|\W)(?:new)?[Pp]assword\s*:\s*z\.string\(\)[^,\n]*?\.min\((\d+)/g,
    // Ajv : `password: { type: 'string', minLength: 6`
    /(?:new|current)?[Pp]assword\s*:\s*\{[^}]*?minLength:\s*(\d+)/g,
    // Vues : `password.length >= 6` / `password.length < 6`
    /[Pp]assword\.length\s*[<>]=?\s*(\d+)/g,
  ];

  const found: number[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const value = Number(match[1]);
      // `.min(1)` = « champ requis », pas une exigence de robustesse : le mot de
      // passe ACTUEL n'a qu'à être non vide, c'est le hash qui l'arbitre.
      if (value > 1) found.push(value);
    }
  }
  return found;
}

/**
 * Recensement EXPLICITE. Un balayage large attraperait des `.min(8)` sans
 * rapport (codes 2FA, jetons) ; cette liste force à classer chaque nouveau site
 * plutôt qu'à espérer qu'une regex le voie.
 */
const SITES: readonly string[] = [
  'packages/shared/utils/validation.ts',
  // #5216 — `utils/validation.ts` (2700 lignes) a été découpé pour que
  // `AuthSchemas` puisse grandir : la CONSTANTE vit désormais dans
  // `validation-primitives.ts` et les schémas qui l'appliquent dans
  // `auth-schemas.ts`. Recenser la seule façade ferait tomber la contre-épreuve
  // « gouverné, pas muet » par DISPARITION — même geste qu'aux deux découpages
  // recensés plus bas.
  'packages/shared/utils/validation-primitives.ts',
  'packages/shared/utils/auth-schemas.ts',
  // #4635 — `types/api-schemas.ts` (3995 lignes) a été découpé ; il n'est plus
  // qu'une façade de ré-export, et la règle de longueur vit avec les schémas
  // d'authentification qui l'appliquent (`registerRequestSchema`,
  // `changePasswordRequestSchema`, `resetPasswordRequestSchema`). Même geste
  // qu'au découpage de `users/profile.ts` ci-dessous : recenser la façade
  // ferait tomber la contre-épreuve « gouverné, pas muet » par DISPARITION.
  'packages/shared/types/api-schemas/auth.ts',
  'packages/shared/types/validation/admin-user.ts',
  'services/gateway/src/routes/password-reset.ts',
  // #4284 — `users/profile.ts` (1093 lignes) a été découpé ; il n'est plus
  // qu'une façade de ré-export, et la règle de longueur vit avec la route qui
  // l'applique (`PATCH /users/me/password`). Recenser la façade faisait tomber
  // la contre-épreuve « gouverné, pas muet » — exactement ce qu'elle existe
  // pour attraper : un site qui devient conforme PAR DISPARITION.
  'services/gateway/src/routes/users/profile-credentials.ts',
  'apps/web/components/auth/register-form-wizard.tsx',
  'apps/web/components/auth/wizard-steps/SecurityStep.tsx',
  'apps/web/components/auth/PasswordRequirementsChecklist.tsx',
  // `apps/web/components/settings/ProfileSettings.tsx` a été SUPPRIMÉ (#4189) :
  // huit de ses appels visaient des routes inexistantes, et son seul
  // importateur était son propre `.example.tsx`, lui-même importé nulle part.
  // Le formulaire monté par `app/settings/page.tsx` est `user-settings.tsx`,
  // dont l'homonymie a longtemps fait croire au contraire.
];

describe('longueur minimale du mot de passe — une règle, pas onze', () => {
  it.each(SITES)('%s n’impose aucune autre longueur que la constante', (path) => {
    const literals = passwordLengthLiterals(read(path));

    expect(literals.filter((n) => n !== PASSWORD_MIN_LENGTH)).toEqual([]);
  });

  /**
   * Un site doit être GOUVERNÉ : soit il référence la constante, soit il porte
   * un littéral qui lui est égal. Sans cette contre-épreuve, supprimer la règle
   * d'un fichier le rendrait « conforme » par disparition — le recensement
   * passerait au vert en ayant cessé de regarder.
   */
  it.each(SITES)('%s est gouverné par la constante, pas muet', (path) => {
    const source = read(path);
    const governed =
      source.includes('PASSWORD_MIN_LENGTH') || passwordLengthLiterals(source).length > 0;

    expect(governed).toBe(true);
  });
});

describe('la règle appliquée EST la constante', () => {
  const valid = {
    username: 'bobby',
    password: 'a'.repeat(PASSWORD_MIN_LENGTH),
    firstName: 'Bob',
    lastName: 'Smith',
    email: 'bob@example.com',
  };

  it('l’inscription accepte un mot de passe exactement à la borne', () => {
    expect(AuthSchemas.register.safeParse(valid).success).toBe(true);
  });

  it('l’inscription refuse un caractère de moins', () => {
    const short = { ...valid, password: 'a'.repeat(PASSWORD_MIN_LENGTH - 1) };

    expect(AuthSchemas.register.safeParse(short).success).toBe(false);
  });

  it('le schéma Ajv servi à Fastify porte la MÊME borne', () => {
    expect(registerRequestSchema.properties.password.minLength).toBe(PASSWORD_MIN_LENGTH);
  });

  it('le changement de mot de passe accepte la même borne', () => {
    const result = updatePasswordSchema.safeParse({
      currentPassword: 'a'.repeat(PASSWORD_MIN_LENGTH),
      newPassword: 'b'.repeat(PASSWORD_MIN_LENGTH),
      confirmPassword: 'b'.repeat(PASSWORD_MIN_LENGTH),
    });

    expect(result.success).toBe(true);
  });
});
