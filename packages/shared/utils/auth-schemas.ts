/**
 * Les schémas Zod d'AUTHENTIFICATION — extraits de `utils/validation.ts` par
 * #5216.
 *
 * ## Pourquoi ils partent
 *
 * `utils/validation.ts` porte 2700 lignes pour un plafond de 1000, et le dépôt
 * INTERDIT d'ajouter à un fichier hors budget : on extrait d'abord, on ajoute
 * ensuite (directive 2026-09-02). Le lot qui ouvre l'inscription à un écran de
 * trois champs devait faire grossir `AuthSchemas` — c'est donc `AuthSchemas`
 * qui sort, avec sa responsabilité entière plutôt qu'une tranche.
 *
 * `validation.ts` le ré-exporte : aucune adresse d'import n'a bougé, et
 * `AuthSchemas` reste joignable par `@meeshy/shared/utils/validation` comme
 * par ce module.
 *
 * ## Ce que ces schémas gardent, et ce qu'ils ne gardent pas
 *
 * Ils sont la couche Zod, appliquée DANS le handler. La couche Ajv
 * (`types/api-schemas/auth.ts`) est appliquée par Fastify AVANT lui, et les
 * deux doivent rendre le MÊME verdict : une couche plus stricte que l'autre
 * produit un refus que la seconde n'explique pas. Le témoin de cette parité
 * est `__tests__/register-single-screen-contract.test.ts`.
 *
 * @module @meeshy/shared/utils/auth-schemas
 */

import { z } from 'zod';

import {
  PASSWORD_MIN_LENGTH,
  PERSON_NAME_PATTERN,
  USERNAME_PATTERN,
  passwordTooShort,
  supportedLanguageCode,
} from './validation-primitives.js';

/**
 * Schémas pour l'authentification
 */
export const AuthSchemas = {
  // Login request
  login: z.object({
    username: z.string().min(2).max(50),
    password: z.string().min(1),
    rememberDevice: z.boolean().optional().default(false), // Trust this device for longer sessions (365 days)
  }),

  /**
   * L'inscription à TROIS champs — nom affiché, e-mail, mot de passe (#5216) —
   * qui accepte encore la charge HÉRITÉE (`username` + `firstName` + `lastName`).
   *
   * Miroir Zod de `registerRequestSchema` (types/api-schemas/auth.ts) : la même
   * disjonction d'identité, exprimée ici par `superRefine` là où Ajv l'exprime
   * par `anyOf`. Les deux couches doivent rendre le même verdict — c'est ce que
   * garde `__tests__/register-single-screen-contract.test.ts`, et c'est la forme
   * la plus exposée à la dérive : chaque couche est relue seule.
   *
   * **Aucun `.default('fr')` sur les langues.** Un défaut posé ici ÉCRIT le rang
   * 1 avant que le serveur ne descende le Prisme, ce qui rend inatteignable la
   * locale appareil (rang 4) — même défaut que les `default` d'Ajv, une couche
   * plus haut, et même remède.
   */
  register: z.object({
    displayName: z.string().min(1).max(100)
      .regex(PERSON_NAME_PATTERN, 'Le nom affiché doit contenir au moins une lettre')
      .optional(),
    username: z.string()
      .min(2, 'Username trop court (min 2)')
      .max(16, 'Username trop long (max 16)')
      .regex(USERNAME_PATTERN, 'Username invalide (lettres, chiffres, - et _ uniquement)')
      .optional(),
    password: z.string()
      .min(PASSWORD_MIN_LENGTH, passwordTooShort),
    firstName: z.string().min(1).max(50)
      .regex(PERSON_NAME_PATTERN, 'Le prénom doit contenir au moins une lettre')
      .optional(),
    lastName: z.string().min(1).max(50)
      .regex(PERSON_NAME_PATTERN, 'Le nom doit contenir au moins une lettre')
      .optional(),
    email: z.email('Email invalide'),
    phoneNumber: z.string().optional(),
    phoneCountryCode: z.string().length(2).optional(),
    systemLanguage: supportedLanguageCode.optional(),
    regionalLanguage: supportedLanguageCode.optional(),
    phoneTransferToken: z.string().optional(), // Token proving SMS verification for phone transfer
  }).superRefine((data, ctx) => {
    if (data.displayName) return;
    if (data.firstName && data.lastName) return;

    // Le refus DÉSIGNE `displayName` : c'est le champ que le formulaire court
    // affiche, et un 400 dont les `violations` ne nomment aucun champ n'aide ni
    // le client ni les journaux.
    ctx.addIssue({
      code: 'custom',
      path: ['displayName'],
      message: 'Nom affiché requis (ou prénom ET nom)',
    });
  }),

  // Refresh token
  refreshToken: z.object({
    token: z.string().min(1),
    sessionToken: z.string().optional(),
  }),

  // Verify email (token from link OR 6-digit code from mobile)
  verifyEmail: z.object({
    token: z.string().min(1).optional(),
    code: z.string().length(6).regex(/^[0-9]{6}$/).optional(),
    email: z.email(),
  }).refine(
    (data) => !!data.token || !!data.code,
    { message: 'Either token or code must be provided' }
  ),

  // Resend verification
  resendVerification: z.object({
    email: z.email(),
  }),

  // Phone verification
  sendPhoneCode: z.object({
    phoneNumber: z.string().min(8),
  }),

  verifyPhone: z.object({
    phoneNumber: z.string().min(8),
    code: z.string().length(6).regex(/^[0-9]{6}$/),
  }),

  // Password reset
  requestPasswordReset: z.object({
    email: z.email(),
  }),

  resetPassword: z.object({
    token: z.string().min(1),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, passwordTooShort),
  }),

  // Change password (authenticated)
  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, passwordTooShort),
  }),
};

