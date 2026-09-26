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
 * Les bornes d'un pseudo d'inscription — LA source (#8082). Le schéma Ajv
 * ci-dessous, la dérivation (`utils/registration-identity.ts`), le changement
 * de pseudo (`PATCH /users/me/username`) et le verdict client
 * (`utils/username-rule.ts`) les citent ; le miroir Swift
 * (`RegistrationIdentity.pseudoMin/pseudoMax`) est tenu par sa suite.
 * Un pseudo de 17 caractères passait le formulaire iOS faute de les connaître.
 */
export const usernameMinLength = 2;
export const usernameMaxLength = 16;

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
  /**
   * L'ADRESSE SEULE SUFFIT (#6424) — ce `required` en portait deux de plus.
   *
   * Directive porteur 2026-09-14 : « tu vas t'assurer qu'on puisse créer un
   * compte à partir d'un e-mail ! On met un e-mail, tu crées un compte avec le
   * pseudo pris de la première partie de l'e-mail, le display name pareil ».
   *
   * Deux exigences tombent, pour deux raisons distinctes :
   *
   * - **`password`** — un compte peut désormais n'en avoir aucun. Sa seule
   *   porte est alors le LIEN MAGIQUE, et il en pose un quand il veut
   *   (`PATCH /users/me/password`, qui ne réclame plus d'ancien quand il n'y
   *   en a pas). `User.password` est nullable ; `null` DIT cet état, là où un
   *   hash inventé le rendrait indistinguable d'un vrai secret.
   *
   * - **La disjonction d'identité** (`anyOf` : `displayName`, ou
   *   `firstName` + `lastName`) — elle exigeait que la CHARGE nomme le compte.
   *   Le serveur sait le nommer sans elle : l'adresse est REQUISE, et
   *   `displayNameDepuisEmail` / `pseudoRacine` en tirent le nom affiché et le
   *   pseudo (`services/auth/registration-identity.ts`). La garder aurait
   *   refusé, au nom d'une donnée manquante, une inscription dont la donnée
   *   manquante est précisément ce que le serveur fabrique.
   *
   * Ce qui NE change pas : une charge qui nomme le compte est respectée telle
   * quelle — la dérivation ne s'applique qu'au silence, jamais par-dessus une
   * valeur fournie.
   */
  required: ['email'],
  properties: {
    displayName: displayNameProperty,
    username: {
      type: 'string',
      minLength: usernameMinLength,
      maxLength: usernameMaxLength,
      pattern: usernamePatternSource,
      description: 'Unique username (2-16 chars: letters, digits, - and _ only — no spaces). Optional: generated from the display name when absent.'
    },
    // Borne alignée sur `PASSWORD_MIN_LENGTH` (utils/validation.ts) — un
    // LITTÉRAL, délibérément, pas un import : `validation-primitives.ts`
    // importe déjà `usernamePatternSource` depuis la façade `api-schemas.js`,
    // qui ré-exporte CE fichier. Importer la constante ici la referait
    // boucler. La garde `password-min-length-parity.test.ts` tient le
    // littéral honnête — et c'est elle qui a trouvé ces trois-ci quand la
    // constante est passée de 12 à 6 (directive porteur 2026-09-13, après
    // mesure : 18 refus d'inscription pour 2 comptes créés en 24 h).
    password: {
      type: 'string',
      minLength: 6,
      description: 'Password (minimum PASSWORD_MIN_LENGTH characters). OPTIONAL since #6424: omit it and the account is created without one — its only door is then the magic link, until the holder sets a password from their profile.'
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
    },
    // #8058 — le parrainage voyage AVEC l'inscription : le rattachement se crée
    // à la création du compte, qu'il soit actif ou non (#8055). Même valeur que
    // `token` / `sessionKey` de `POST /affiliate/register`.
    affiliateToken: {
      type: 'string',
      description: 'OPTIONAL. Affiliate (referral) token from the invitation link — the referral is recorded when the account is created, active or not. An invalid token never blocks the registration.'
    },
    affiliateSessionKey: {
      type: 'string',
      description: 'OPTIONAL. Session key returned by POST /affiliate/track-visit, linking the prior visit to this signup.'
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
        },
        // #8033 — admis avec le CODE seulement ; appliqué uniquement à un compte
        // qui n'a pas encore de mot de passe. Littéral aligné sur
        // `PASSWORD_MIN_LENGTH` (garde `password-min-length-parity.test.ts`).
        password: {
          type: 'string',
          minLength: 6,
          description: 'OPTIONAL. Sets the account password when the account has none yet (ignored otherwise). Accepted only with `code`.'
        }
      },
      additionalProperties: false
    }
  ]
} as const;

/**
 * Le jeton d'ATTENTE remis à l'appareil qui vient de demander un code (#8083).
 *
 * Il ne sert qu'à `POST /auth/verification/status`, qui rend `pending` ou
 * `proven` — jamais une session (décision porteur « si et seulement si » :
 * l'appareil ne se connecte que par le code saisi sur lui ou le lien ouvert
 * sur lui), jamais l'adresse. Le nom historique du contrat est gardé.
 */
export const pendingSessionTokenProperty = {
  type: 'string',
  description: 'Opaque watch token for THIS device (#8083). Present it to POST /auth/verification/status to learn whether the address was proven elsewhere (`pending` / `proven`). It never yields a session.'
} as const;

/**
 * La branche « vérification requise » de `POST /auth/login` (#8033) et de
 * `POST /auth/register` (#8055) — UNE forme, deux routes.
 *
 * Login : l'identifiant est une adresse VALIDE sans compte actif (le compte
 * est alors créé, sans mot de passe), celle d'un compte ainsi créé et jamais
 * vérifié, ou le BON mot de passe d'un compte non vérifié et sans numéro (le
 * code est renvoyé, `accountCreated: false`).
 * Register : inscription SANS numéro de téléphone — le compte est créé, mot
 * de passe compris, mais n'est pas actif (`accountCreated: true`).
 * Aucune session, aucun jeton : la session ne s'ouvre qu'à
 * `POST /auth/verify-email`.
 */
export const verificationRequiredProperties = {
  status: {
    type: 'string',
    enum: ['verification-required'],
    description: 'Present only when no session is opened: a code and a link were emailed, to be presented to POST /auth/verify-email'
  },
  accountCreated: {
    type: 'boolean',
    description: 'True when this request created the account; false when the account already existed and the code was re-sent'
  },
  email: {
    type: 'string',
    description: 'The normalized address the code was sent to'
  },
  pendingSessionToken: pendingSessionTokenProperty
} as const;

/** Nom historique (#8033) de `verificationRequiredProperties`. */
export const loginVerificationRequiredProperties = verificationRequiredProperties;

/**
 * Réponse de `POST /auth/verify-email` (#8033) — la vérification OUVRE la
 * session, sous la même forme que `POST /login`. Un compte protégé par un
 * second facteur reçoit à la place `requires2FA` + `twoFactorToken`, à
 * présenter à `POST /login/2fa`.
 */
export const verifyEmailResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        verified: { type: 'boolean', example: true },
        message: { type: 'string' },
        alreadyVerified: { type: 'boolean', description: 'True when the address was already verified before this proof (a sign-in code)' },
        verifiedAt: { type: 'string', format: 'date-time' },
        user: userSchema,
        token: { type: 'string', description: 'JWT access token (absent when a second factor is required)' },
        sessionToken: { type: 'string', description: 'Session token (absent when a second factor is required)' },
        session: sessionMinimalSchema,
        expiresIn: { type: 'number', example: 86400 },
        passwordSet: { type: 'boolean', description: 'True when the optional password was applied' },
        requires2FA: { type: 'boolean' },
        twoFactorToken: { type: 'string', description: 'Present it to POST /login/2fa with the second-factor code' }
      }
    }
  }
} as const;

/**
 * `POST /auth/verification/status` (#8083) — l'écran du code demande si
 * l'adresse a été prouvée ailleurs.
 */
export const verificationStatusRequestSchema = {
  type: 'object',
  required: ['pendingSessionToken'],
  properties: {
    pendingSessionToken: { type: 'string', minLength: 1, maxLength: 256 }
  },
  additionalProperties: false
} as const;

/**
 * Réponse de `POST /auth/verification/status` : un ÉTAT, rien d'autre. Un jeton
 * inconnu rend 401 (`PENDING_TOKEN_INVALID`), un jeton expiré 410
 * (`PENDING_TOKEN_EXPIRED`).
 */
export const verificationStatusResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'proven'],
          description: '`proven`: the address was proven (code or link) after this token was issued — the device still signs in only with the code typed on it or the link opened on it'
        }
      }
    }
  }
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
      description: 'New password (minimum PASSWORD_MIN_LENGTH characters)'
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
      description: 'New password (minimum PASSWORD_MIN_LENGTH characters)'
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
