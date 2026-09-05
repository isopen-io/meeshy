/**
 * Schémas d’API pour l’authentification : connexion, inscription, vérifications, mot de passe, lien magique.
 *
 * Extrait de `types/api-schemas.ts` par #4635 (découpage du contrat de réponse
 * du dépôt, directive 2026-08-28). Le texte des schémas est INCHANGÉ : seule
 * leur adresse de fichier bouge. `types/api-schemas.ts` reste la FAÇADE qui les
 * ré-exporte, et aucun importeur n’a bougé.
 *
 * @module @meeshy/shared/types/api-schemas/auth
 */

import { sessionMinimalSchema, sessionSchema } from './session.js';
import { userSchema } from './user.js';

// =============================================================================
// AUTH RESPONSE SCHEMAS
// =============================================================================

/**
 * Login response schema
 */
export const loginResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        user: userSchema,
        token: { type: 'string', description: 'JWT access token for API authentication' },
        sessionToken: { type: 'string', description: 'Session token for device management (store securely)' },
        session: sessionMinimalSchema,
        expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
      }
    }
  }
} as const;

/**
 * Register response schema
 */
export const registerResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        user: userSchema,
        token: { type: 'string', description: 'JWT access token for API authentication' },
        expiresIn: { type: 'number', description: 'Token expiration time in seconds', example: 86400 }
      }
    }
  }
} as const;

/**
 * Sessions list response schema
 */
export const sessionsListResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        sessions: {
          type: 'array',
          items: sessionSchema
        },
        totalCount: { type: 'number', description: 'Total number of active sessions' }
      }
    }
  }
} as const;

// =============================================================================
// REQUEST BODY SCHEMAS
// =============================================================================

/**
 * Login request body schema
 */
export const loginRequestSchema = {
  type: 'object',
  required: ['username', 'password'],
  properties: {
    username: {
      type: 'string',
      minLength: 2,
      maxLength: 50,
      description: 'Username, email, or phone number'
    },
    // Borne alignée sur `PASSWORD_MIN_LENGTH` (utils/validation.ts). Ce
    // schéma est celui que Fastify applique AVANT le handler : c'est lui qui
    // rendait « body/password must NOT have fewer than 8 characters » à la
    // dernière étape du wizard web, qui en acceptait 6.
    password: {
      type: 'string',
      minLength: 1,
      description: 'User password'
    }
  }
} as const;

/**
 * Nom de personne (prénom / nom) : au moins une lettre, uniquement lettres,
 * marques combinantes (NFD), espaces, apostrophes — droite `'` ET
 * typographiques `’` (U+2019, insérée par défaut par le clavier iOS) / `ʼ`
 * (U+02BC) — points et tirets. ANCRÉ (`^...$`) : JSON Schema `pattern` est une
 * recherche partielle, sans ancres Ajv accepterait n'importe quelle chaîne
 * contenant une sous-chaîne valide alors que le Zod (anchored) la refuserait —
 * les deux couches doivent rendre le même verdict.
 *
 * Source unique partagée : consommée telle quelle ci-dessous (Ajv) et compilée
 * en RegExp par `AuthSchemas.register` (utils/validation.ts). Miroir iOS :
 * `RegistrationViewModel.isNameValidLocally`.
 */
export const personNamePatternSource = "^(?=.*\\p{L})[\\p{L}\\p{M}\\s'’ʼ.-]+$";

/**
 * Nom d'utilisateur : ASCII strict — lettres, chiffres, `-`, `_`. Aucun espace.
 *
 * Source unique partagée : consommée telle quelle par Ajv (`pattern` ci-dessous,
 * et body de `PATCH /users/me/username`) et compilée en RegExp par les schémas
 * Zod (`utils/validation.ts`, `types/validation.ts`, `types/validation/admin-user.ts`)
 * ainsi que par `normalizeUsername` (gateway/utils/normalize.ts), pour que toutes
 * les couches rendent le même verdict.
 *
 * Ancré (`^…$`) parce que `pattern` en JSON Schema est une recherche PARTIELLE :
 * sans ancres, Ajv accepterait `"la lionne noire"` (elle contient `"la"`) là où le
 * Zod, ancré par construction, la refuse. Même raison que `personNamePatternSource`.
 *
 * Miroirs clients : `RegistrationViewModel.isUsernameValidLocally` (iOS),
 * `SignupFieldValidation.isUsernameValidLocally` (Android). Le charset est ASCII
 * et NON Unicode : `josé` doit être refusé côté client comme côté serveur.
 */
export const usernamePatternSource = "^[a-zA-Z0-9_-]+$";

/**
 * Les trois champs d'identité, déclarés UNE fois et cités deux — dans
 * `properties`, et dans la branche d'`anyOf` qui les exige.
 *
 * La duplication n'est pas cosmétique : Ajv en mode strict REFUSE (ou journalise,
 * selon le réglage) un `required` dont la propriété n'est pas déclarée dans le
 * MÊME sous-schéma — `strict mode: required property "displayName" is not
 * defined at "#/anyOf/0" (strictRequired)`. Des branches nues compilent, mais
 * bruitent le démarrage du serveur d'un avertissement par propriété, et un
 * durcissement du réglage les transformerait en refus de compilation, donc en
 * route qui ne se monte plus. Citer les mêmes objets, plutôt que les recopier,
 * garantit que les deux emplacements ne peuvent pas diverger.
 */
const displayNameProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 100,
  pattern: personNamePatternSource,
  description: 'Display name as typed (1-100 chars, at least one letter). Required unless firstName AND lastName are provided — firstName/lastName are derived from it when absent.'
} as const;

const firstNameProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 50,
  pattern: personNamePatternSource,
  description: 'User first name (must contain at least one Unicode letter). Optional: derived from displayName when absent.'
} as const;

const lastNameProperty = {
  type: 'string',
  minLength: 1,
  maxLength: 50,
  pattern: personNamePatternSource,
  description: 'User last name (must contain at least one Unicode letter). Optional: derived from displayName when absent.'
} as const;

/**
 * L'inscription tient sur UN écran à TROIS champs — nom affiché, e-mail, mot
 * de passe (#5216) — sans cesser d'accepter la charge HÉRITÉE
 * (`username` + `firstName` + `lastName`) que les applications en circulation
 * envoient encore.
 *
 * ## Ce que `required` et `anyOf` disent chacun
 *
 * `required: ['email','password']` porte ce qu'AUCUN parcours ne peut omettre.
 * L'identité, elle, se donne de deux façons — d'où l'`anyOf` : soit un
 * `displayName` (le formulaire court), soit le couple `firstName`/`lastName`
 * (le formulaire hérité). Ce que le serveur ne reçoit pas, il le DÉRIVE : le
 * pseudo est généré, les deux noms sont découpés depuis le nom affiché.
 *
 * Une moitié de couple ne vaut pas identité : `firstName` seul est refusé, la
 * branche exigeant les deux.
 *
 * ## Aucun `default` de langue, et c'est la partie qui coûte
 *
 * `systemLanguage` et `regionalLanguage` portaient `default: 'fr'`. Ajv
 * APPLIQUE les défauts : il ÉCRIT la clé dans le corps avant que le handler ne
 * le voie. Une inscription qui n'exprime aucune langue arrivait donc au service
 * en DEMANDANT du français, ce qui rendait inatteignable la descente de
 * `services/gateway/src/services/auth/registration-languages.ts` — laquelle ne
 * consulte la locale appareil (rang 4) que si l'inscription n'exprime AUCUN
 * rang. Le littéral était déjà là.
 *
 * > Un `default` de schéma n'est pas une commodité de documentation : c'est une
 * > écriture dans la charge, faite avant le seul code qui saurait s'en passer.
 */
export const registerRequestSchema = {
  type: 'object',
  required: ['email', 'password'],
  anyOf: [
    { required: ['displayName'], properties: { displayName: displayNameProperty } },
    {
      required: ['firstName', 'lastName'],
      properties: { firstName: firstNameProperty, lastName: lastNameProperty }
    }
  ],
  properties: {
    displayName: displayNameProperty,
    username: {
      type: 'string',
      minLength: 2,
      maxLength: 16,
      pattern: usernamePatternSource,
      description: 'Unique username (2-16 chars: letters, digits, - and _ only — no spaces). Optional: generated from the display name when absent.'
    },
    // Borne alignée sur `PASSWORD_MIN_LENGTH` (utils/validation.ts). C'est CE
    // schéma que Fastify applique avant le handler : il rendait
    // « body/password must NOT have fewer than 8 characters » à la dernière
    // étape du wizard web, lequel ouvrait le pas suivant dès 6.
    password: {
      type: 'string',
      minLength: 6,
      description: 'Password (minimum 6 characters)'
    },
    firstName: firstNameProperty,
    lastName: lastNameProperty,
    email: {
      type: 'string',
      format: 'email',
      description: 'Valid email address (verification email will be sent)'
    },
    phoneNumber: {
      type: 'string',
      description: 'Phone number (with or without country code, e.g., "+33612345678")'
    },
    phoneCountryCode: {
      type: 'string',
      minLength: 2,
      maxLength: 2,
      description: 'ISO 3166-1 alpha-2 country code (e.g., "FR", "US")'
    },
    // Aucun `default` — voir le doc-comment ci-dessus : Ajv les ÉCRIT dans le
    // corps, ce qui rendait la descente du Prisme à l'inscription inatteignable.
    systemLanguage: {
      type: 'string',
      description: 'Interface language (ISO 639-1 code). Omit it and the server derives rank 1 from the other ranks, then from the device locale.'
    },
    regionalLanguage: {
      type: 'string',
      description: 'Regional language for translations'
    },
    phoneTransferToken: {
      type: 'string',
      description: 'Token proving SMS verification when the phone number is being transferred from another account'
    }
  }
} as const;

/**
 * Refresh token request body schema
 */
export const refreshTokenRequestSchema = {
  type: 'object',
  required: ['token'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Current JWT token to refresh'
    },
    sessionToken: {
      type: 'string',
      description: 'Session token for trusted device refresh when JWT is expired'
    }
  }
} as const;

/**
 * Verify email request body schema
 */
export const verifyEmailRequestSchema = {
  type: 'object',
  oneOf: [
    {
      required: ['token', 'email'],
      properties: {
        token: {
          type: 'string',
          minLength: 1,
          description: 'Verification token from email link'
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address to verify'
        }
      },
      additionalProperties: false
    },
    {
      required: ['code', 'email'],
      properties: {
        code: {
          type: 'string',
          minLength: 6,
          maxLength: 6,
          pattern: '^[0-9]{6}$',
          description: '6-digit verification code for mobile'
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Email address to verify'
        }
      },
      additionalProperties: false
    }
  ]
} as const;

/**
 * Resend verification email request body schema
 */
export const resendVerificationRequestSchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to send verification to'
    }
  }
} as const;

/**
 * Send phone verification code request body schema
 */
export const sendPhoneCodeRequestSchema = {
  type: 'object',
  required: ['phoneNumber'],
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 8,
      description: 'Phone number to send verification code to'
    }
  }
} as const;

/**
 * Verify phone request body schema
 */
export const verifyPhoneRequestSchema = {
  type: 'object',
  required: ['phoneNumber', 'code'],
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 8,
      description: 'Phone number to verify'
    },
    code: {
      type: 'string',
      minLength: 6,
      maxLength: 6,
      description: '6-digit verification code from SMS'
    }
  }
} as const;

/**
 * Change password request body schema
 */
export const changePasswordRequestSchema = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: {
      type: 'string',
      minLength: 1,
      description: 'Current password'
    },
    newPassword: {
      type: 'string',
      minLength: 6,
      description: 'New password (minimum 6 characters)'
    }
  }
} as const;

/**
 * Reset password request body schema
 */
export const resetPasswordRequestSchema = {
  type: 'object',
  required: ['token', 'newPassword'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Password reset token from email'
    },
    newPassword: {
      type: 'string',
      minLength: 6,
      description: 'New password (minimum 6 characters)'
    }
  }
} as const;

/**
 * Request password reset request body schema
 */
export const requestPasswordResetRequestSchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to send reset link to'
    }
  }
} as const;

// =============================================================================
// MAGIC LINK AUTHENTICATION SCHEMAS
// =============================================================================

/**
 * Request magic link (passwordless login) request body schema
 * POST /api/v1/auth/magic-link/request
 */
export const magicLinkRequestSchema = {
  type: 'object',
  required: ['email'],
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email address to send magic link to'
    },
    deviceFingerprint: {
      type: 'string',
      nullable: true,
      description: 'Optional device fingerprint for additional security'
    }
  }
} as const;

/**
 * Magic link request response schema
 */
export const magicLinkRequestResponseSchema = {
  type: 'object',
  required: ['success', 'message'],
  properties: {
    success: {
      type: 'boolean',
      description: 'Always true to prevent email enumeration'
    },
    message: {
      type: 'string',
      description: 'Generic message (same for success/failure)'
    }
  }
} as const;

/**
 * Validate magic link token request body schema
 * POST /api/v1/auth/magic-link/validate
 */
export const magicLinkValidateRequestSchema = {
  type: 'object',
  required: ['token'],
  properties: {
    token: {
      type: 'string',
      minLength: 1,
      description: 'Magic link token from email URL'
    }
  }
} as const;

/**
 * Magic link validation success response schema
 */
export const magicLinkValidateSuccessResponseSchema = {
  type: 'object',
  required: ['success', 'user', 'token', 'sessionToken', 'session'],
  properties: {
    success: { type: 'boolean', enum: [true] },
    user: {
      type: 'object',
      description: 'Authenticated user data',
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        displayName: { type: 'string' },
        avatar: { type: 'string', nullable: true },
        role: { type: 'string' },
        isOnline: { type: 'boolean' },
        systemLanguage: { type: 'string' },
        regionalLanguage: { type: 'string', nullable: true },
        autoTranslateEnabled: { type: 'boolean' },
        twoFactorEnabledAt: { type: 'string', format: 'date-time', nullable: true }
      }
    },
    token: {
      type: 'string',
      description: 'JWT token for API authentication (24h validity)'
    },
    sessionToken: {
      type: 'string',
      description: 'Session token for session management'
    },
    session: {
      type: 'object',
      description: 'Session details with device/location tracking',
      properties: {
        id: { type: 'string' },
        deviceType: { type: 'string', nullable: true },
        osName: { type: 'string', nullable: true },
        browserName: { type: 'string', nullable: true },
        isMobile: { type: 'boolean' },
        ipAddress: { type: 'string', nullable: true },
        location: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' }
      }
    }
  }
} as const;

/**
 * Magic link validation error response schema
 */
export const magicLinkValidateErrorResponseSchema = {
  type: 'object',
  required: ['success', 'error'],
  properties: {
    success: { type: 'boolean', enum: [false] },
    error: {
      type: 'string',
      description: 'Error message (e.g., "Invalid or expired link")'
    }
  }
} as const;
