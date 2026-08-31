/**
 * `GET /me/consents` et `PUT /me/consents/{purpose}` — l'adresse CANONIQUE
 * d'un consentement (#4348, fusion de #4335, suite de #4180).
 *
 * Avant ce lot, un consentement se lisait par `GET /voice/profile/consent`
 * (trois clés seulement — pas `dataProcessingConsentAt`) et s'écrivait par
 * `POST /voice/profile/consent` (`VoiceProfileService.updateConsent`), deux
 * routes montées sous `/voice/profile`, hors de tout préfixe `/me` — la
 * raison structurelle nommée par #4335 : aucune route enregistrée à
 * l'intérieur de ce plugin ne peut exposer un chemin `/me`. Ce fichier NEUF
 * ouvre l'adresse `/me/consents`, montage AUTONOME au même préfixe que
 * `me-permissions` (#4350) et `me-categories` (#4359) — même patron : pas de
 * parent qui pose déjà l'authentification, donc `onRequest:
 * [fastify.authenticate]` posé ICI, sur les deux routes.
 *
 * `POST /voice/profile/consent` n'est PAS touchée par ce lot : elle reste la
 * seule porte qui CASCADE l'octroi (accorder le clonage vocal accorde aussi,
 * en silence, ses trois dépendances si elles manquent). `PUT
 * /me/consents/{purpose}` reproduit la MÊME cascade au moment d'ACCORDER
 * (jamais au moment de RETIRER — retirer une clé ne touche que sa propre
 * colonne, comme `VoiceProfileService.updateConsent`) : sans elle, accorder
 * `voice-cloning` seul par cette route laisserait `voiceCloningEnabledAt`
 * posé pendant que `ConsentValidationService.hasVoiceCloningConsent` reste
 * `false` faute d'ancêtre — un consentement affiché « accordé » ici et
 * inactif partout ailleurs, exactement la divergence que #4180 a fermée côté
 * lecture. La hiérarchie reproduite est celle que documente
 * `ConsentValidationService` en tête de fichier :
 * `dataProcessingConsentAt → voiceDataConsentAt → voiceProfileConsentAt →
 * voiceCloningEnabledAt`. Fusionner les deux écrivains dans une seule route
 * (retirer `/voice/profile/consent`) est un suivi distinct — #4348 nomme
 * explicitement « compter les appels Android avant de retirer
 * `/voice/profile/consent` » comme un préalable non fait ici.
 *
 * ## Le régime des quatre `purpose`, et pourquoi `analytics` n'y est pas
 *
 * Quatre `purpose` seulement, chacun adossé à UNE colonne `User.*ConsentAt`
 * horodatée par le SERVEUR — jamais un cinquième fabriqué pour l'apparence
 * de la conformité. `allowAnalytics` (`PrivacyPreferenceSchema`) reste une
 * PRÉFÉRENCE booléenne, opt-out, décidée dans le commentaire de fusion de
 * #4348 : un consentement horodaté n'a de sens que s'il gouverne un
 * traitement qui, sans lui, ne peut pas avoir lieu — ce n'est pas le cas
 * aujourd'hui pour l'analytique produit. `analyticsConsentAt` n'existe nulle
 * part dans `schema.prisma`, et ce fichier ne l'invente pas.
 *
 * ## `policyVersion` — une version, pas un historique par consentement
 *
 * `schema.prisma` ne porte AUCUNE colonne pour horodater « sous quelle
 * version de la politique ce consentement précis a été donné » — ni sur
 * `User`, ni ailleurs. Ajouter quatre colonnes pour le savoir est un choix de
 * schéma que ni #4348 ni #4335 ne tranchent, et qui engage une décision de
 * gouvernance (garder un historique versionné) hors du périmètre de ce lot.
 * `CONSENT_POLICY_VERSION` est donc une valeur UNIQUE, globale, qui nomme la
 * politique EN VIGUEUR : `GET` la sert identique sur les quatre `purpose`
 * (elle ne prétend pas savoir sous quelle version tel consentement a été
 * donné — seulement quelle version est en vigueur AUJOURD'HUI), et `PUT`
 * EXIGE qu'elle soit citée en retour et REFUSE (409) toute valeur différente
 * — un client qui accepterait une politique déjà périmée ne consentirait pas
 * à celle qui compte. C'est le sens que `policyVersion` peut porter SANS
 * schéma nouveau ; un historique par consentement reste un suivi ouvert, pas
 * une omission silencieuse.
 *
 * ## `revokedAt` — toujours `null`, jamais fabriqué
 *
 * Aucune colonne ne conserve la date d'un retrait : `*ConsentAt` repasse à
 * `null` sur revocation, et la date du retrait lui-même n'est nulle part.
 * `revokedAt` est donc rendu (clé présente uniquement quand `granted` est
 * `false`, jamais aux côtés de `grantedAt`) mais vaut toujours `null` — c'est
 * une réponse honnête (« nous ne savons pas quand »), jamais une date
 * inventée. Fabriquer une date ici referait exactement l'erreur que #4180 a
 * fermée : une affirmation datée que le serveur ne peut pas prouver.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CONSENT_PURPOSES,
  CONSENT_POLICY_VERSION_DEFAULT,
  isConsentPurpose,
  type ConsentPurpose,
} from '@meeshy/shared/types/consents';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ConsentValidationService } from '../../services/ConsentValidationService';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendUnauthorized,
  sendNotFound,
  sendBadRequest,
  sendError,
  sendInternalError,
} from '../../utils/response.js';

/**
 * Les QUATRE `purpose`, dans l'ORDRE de la hiérarchie de dépendance
 * (racine → feuille) — c'est cet ORDRE, pas une table séparée, qui porte la
 * chaîne : les ancêtres d'un `purpose` sont tout ce qui le précède dans ce
 * tableau.
 */
export { CONSENT_PURPOSES, type ConsentPurpose } from '@meeshy/shared/types/consents';

type ConsentColumn =
  | 'dataProcessingConsentAt'
  | 'voiceDataConsentAt'
  | 'voiceProfileConsentAt'
  | 'voiceCloningEnabledAt';

const PURPOSE_COLUMN: Readonly<Record<ConsentPurpose, ConsentColumn>> = {
  'data-processing': 'dataProcessingConsentAt',
  'voice-data': 'voiceDataConsentAt',
  'voice-profile': 'voiceProfileConsentAt',
  'voice-cloning': 'voiceCloningEnabledAt',
};

type ConsentColumns = Record<ConsentColumn, Date | null>;

const CONSENT_SELECT: Readonly<Record<ConsentColumn, true>> = {
  dataProcessingConsentAt: true,
  voiceDataConsentAt: true,
  voiceProfileConsentAt: true,
  voiceCloningEnabledAt: true,
};

/**
 * La politique EN VIGUEUR — voir le doc-comment de module. Un override par
 * variable d'environnement permet de la faire évoluer sans redéploiement de
 * code ; la valeur par défaut date ce lot.
 */
export const CONSENT_POLICY_VERSION =
  process.env.CONSENT_POLICY_VERSION || CONSENT_POLICY_VERSION_DEFAULT;

/** Les ancêtres d'un `purpose`, racine d'abord — jamais lui-même. */
function ancestorsOf(purpose: ConsentPurpose): readonly ConsentPurpose[] {
  return CONSENT_PURPOSES.slice(0, CONSENT_PURPOSES.indexOf(purpose));
}

type ConsentEntry = {
  purpose: ConsentPurpose;
  granted: boolean;
  grantedAt?: string;
  revokedAt?: null;
  policyVersion: string;
  source: 'server';
};

/**
 * L'UNIQUE projection colonne → entrée servie — partagée par `GET` (les
 * quatre `purpose`) et par `PUT` (le `purpose` visé, dans sa réponse). Un
 * consentement accordé ne porte QUE `grantedAt` ; un consentement absent ou
 * retiré ne porte QUE `revokedAt` (toujours `null`, voir doc-comment de
 * module) — jamais les deux à la fois sur la même entrée.
 */
function buildConsentEntry(purpose: ConsentPurpose, grantedAt: Date | null): ConsentEntry {
  if (grantedAt) {
    return {
      purpose,
      granted: true,
      grantedAt: grantedAt.toISOString(),
      policyVersion: CONSENT_POLICY_VERSION,
      source: 'server',
    };
  }
  return {
    purpose,
    granted: false,
    revokedAt: null,
    policyVersion: CONSENT_POLICY_VERSION,
    source: 'server',
  };
}

/**
 * Débit par COMPTE, jamais par IP — même piège que #4334/#4347/#4359 :
 * `hook: 'preHandler'` place le seau APRÈS l'authentification, posée ICI en
 * `onRequest` (montage autonome, voir doc-comment de module). Deux seuils
 * distincts, comme le fixe le commentaire de fusion de #4348/#4335:
 * `read` (120/min, un écran de réglages relit souvent) et `write` (20 PAR
 * HEURE — un consentement ne se bascule pas en boucle, et c'est un geste
 * juridiquement significatif).
 */
function consentRateLimitConfig(usage: 'read' | 'write') {
  const max = usage === 'read' ? 120 : 20;
  const timeWindow = usage === 'read' ? '1 minute' : '1 hour';
  return {
    max,
    timeWindow,
    hook: 'preHandler' as const,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `consents:${usage}:${userId}` : `consents:${usage}:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requêtes (consents/${usage}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

const consentEntrySchema = {
  type: 'object',
  properties: {
    purpose: { type: 'string', enum: [...CONSENT_PURPOSES] },
    granted: { type: 'boolean' },
    grantedAt: { type: 'string', format: 'date-time' },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    policyVersion: { type: 'string' },
    source: { type: 'string', example: 'server' },
  },
} as const;

const derivedSchema = {
  type: 'object',
  properties: {
    canTranscribeAudio: { type: 'boolean' },
    canTranslateAudio: { type: 'boolean' },
    canUseVoiceCloning: { type: 'boolean' },
  },
} as const;

/**
 * ## Pourquoi un refus doit DÉCLARER ce qu'il ajoute (#4487)
 *
 * `sendError` étale `details` à la RACINE de l'enveloppe, et
 * fast-json-stringify RETIRE en silence toute propriété que le schéma de
 * réponse ne déclare pas. Un champ d'appoint non déclaré est donc calculé,
 * passé, sérialisé — puis jeté au dernier mètre : le serveur savait quel
 * champ manquait et n'avait aucun moyen de le dire. C'est ce silence qui a
 * fait conclure à tort à une route cassée pendant la vérification de #4348.
 *
 * L'enveloppe reste à site UNIQUE (`errorResponseSchema`) : on l'ÉTEND, on ne
 * la recopie pas — recopier l'aurait figée au jour de ce lot. Et la forme
 * déclarée est celle que Zod émet RÉELLEMENT, jamais une projection maison :
 * une seconde forme divergerait de la première au premier changement de
 * version de Zod, et `path` seul ne dit pas tout (une clé refusée par
 * `.strict()` vit dans `keys`, `path` restant vide).
 */
const zodIssueSchema = {
  type: 'object',
  properties: {
    code: {
      type: 'string',
      description: 'Code Zod : invalid_type, unrecognized_keys, too_small…',
    },
    path: { type: 'array', items: { type: 'string' }, description: 'Chemin du champ fautif' },
    keys: {
      type: 'array',
      items: { type: 'string' },
      description: 'Clés refusées quand `path` est vide (unrecognized_keys)',
    },
    message: { type: 'string', description: 'Message Zod, déjà lisible' },
  },
} as const;

const badRequestResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    issues: {
      type: 'array',
      items: zodIssueSchema,
      description: 'Une entrée par champ refusé par le schéma du corps',
    },
    allowedPurposes: {
      type: 'array',
      items: { type: 'string', enum: [...CONSENT_PURPOSES] },
      description: "Les purpose acceptés, quand celui de l'URL est inconnu",
    },
  },
} as const;

const policyConflictResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    expectedPolicyVersion: {
      type: 'string',
      description:
        'La version EN VIGUEUR, lisible par une machine : un client dont la ' +
        'constante a dérivé se recale sans relire GET /me/consents.',
    },
  },
} as const;

/**
 * `PUT` n'accepte QUE `{ granted, policyVersion }` — `.strict()` rejette
 * toute clé de plus, en particulier `grantedAt`/`revokedAt` : le serveur
 * pose la date, JAMAIS le client (#4180, répété par le critère 2 de #4335).
 */
const PutConsentBodySchema = z
  .object({
    granted: z.boolean(),
    policyVersion: z.string().min(1),
  })
  .strict();

export async function meConsentsRoutes(fastify: FastifyInstance) {
  const consentService = new ConsentValidationService(fastify.prisma);

  // ═══════════════════════════════════════════════════════════════════════
  // GET /me/consents
  // ═══════════════════════════════════════════════════════════════════════
  fastify.get(
    '/consents',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: consentRateLimitConfig('read') },
      schema: {
        description:
          'Lire les quatre consentements horodatés côté serveur (data-processing, ' +
          'voice-data, voice-profile, voice-cloning), plus le bloc dérivé calculé ' +
          'par ConsentValidationService.',
        tags: ['me', 'consents'],
        summary: 'Get consents',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  consents: { type: 'array', items: consentEntrySchema },
                  derived: derivedSchema,
                },
              },
            },
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      try {
        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: CONSENT_SELECT,
        });

        if (!user) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const consents = CONSENT_PURPOSES.map((purpose) =>
          buildConsentEntry(purpose, (user as ConsentColumns)[PURPOSE_COLUMN[purpose]])
        );

        // Le bloc dérivé vient de `ConsentValidationService` — jamais
        // recalculé sur place (critère de #4335/#4348 repris tel quel).
        const status = await consentService.getConsentStatus(userId);

        return sendSuccess(reply, {
          consents,
          derived: {
            canTranscribeAudio: status.canTranscribeAudio,
            canTranslateAudio: status.canTranslateAudio,
            canUseVoiceCloning: status.canUseVoiceCloning,
          },
        });
      } catch (error) {
        logError('Error fetching consents', error, { source: 'me-consents-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch consents' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PUT /me/consents/:purpose
  // ═══════════════════════════════════════════════════════════════════════
  fastify.put<{ Params: { purpose: string } }>(
    '/consents/:purpose',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: consentRateLimitConfig('write') },
      schema: {
        description:
          'Accorder ou retirer UN consentement. Le serveur pose `new Date()` ou ' +
          '`null` — aucune date reçue du client. `policyVersion` doit citer la ' +
          'politique en vigueur, sinon 409.',
        tags: ['me', 'consents'],
        summary: 'Update one consent',
        params: {
          type: 'object',
          properties: { purpose: { type: 'string' } },
          required: ['purpose'],
        },
        body: { type: 'object' },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: consentEntrySchema,
            },
          },
          400: badRequestResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: policyConflictResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { purpose: string } }>, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const { purpose } = request.params;
      if (!isConsentPurpose(purpose)) {
        return sendBadRequest(reply, 'UNKNOWN_CONSENT_PURPOSE', {
          message: `purpose doit être l'un de : ${CONSENT_PURPOSES.join(', ')}`,
          details: { allowedPurposes: [...CONSENT_PURPOSES] },
        });
      }

      let body: z.infer<typeof PutConsentBodySchema>;
      try {
        body = PutConsentBodySchema.parse(request.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // #4487 — DEUX projections d'UNE source, à deux niveaux de déclaration.
          //
          // Ce n'est pas une jumelle divergente : les deux sortent de
          // `error.issues`, dans cette expression, en un seul endroit. Elles ne
          // peuvent pas diverger, exactement comme `message` ne peut pas
          // diverger d'`error`. Ce qui les sépare est le NIVEAU où elles sont
          // déclarées, et donc ce qu'elles ont le droit de porter :
          //
          // - `violations` est la clé GÉNÉRIQUE de l'enveloppe partagée
          //   (`errorResponseSchema`), que toute route peut poser et qu'un
          //   client traitant ses erreurs uniformément sait lire. Son schéma
          //   déclare `items: { path: string, message: string }` — elle ne PEUT
          //   pas porter autre chose, et son `path` est une chaîne.
          // - `issues` est l'extension que CETTE route déclare
          //   (`badRequestResponseSchema`, 170 lignes plus haut, lié au 400),
          //   avec la forme que Zod émet réellement : `code`, `path` en
          //   TABLEAU, `keys`, `message`.
          //
          // La seconde n'est pas un luxe. Le doc-comment de `zodIssueSchema` le
          // dit : `path` seul ne suffit pas, une clé refusée par `.strict()`
          // laisse `path` VIDE et vit dans `keys`. Sur un refus
          // `unrecognized_keys`, `violations` rend donc `path: ''` et ne nomme
          // RIEN — c'est-à-dire précisément l'information que cette issue
          // existe pour livrer. Servir `violations` seule rouvrait le défaut
          // sous une autre clé.
          //
          // L'enveloppe partagée prévoit ce cas en toutes lettres : une route
          // qui pose des clés propres « les déclare EN PLUS ». C'est ce que
          // fait `badRequestResponseSchema`.
          return sendBadRequest(reply, 'VALIDATION_ERROR', {
            details: { issues: error.issues },
            violations: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          });
        }
        throw error;
      }

      if (body.policyVersion !== CONSENT_POLICY_VERSION) {
        return sendError(reply, 409, 'CONSENT_POLICY_VERSION_MISMATCH', {
          message:
            `La politique de confidentialité a changé (version en vigueur : ` +
            `${CONSENT_POLICY_VERSION}) — relire GET /me/consents avant de renvoyer ce PUT.`,
          details: { expectedPolicyVersion: CONSENT_POLICY_VERSION },
        });
      }

      try {
        const existing = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: CONSENT_SELECT,
        });

        if (!existing) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const existingColumns = existing as ConsentColumns;
        const targetColumn = PURPOSE_COLUMN[purpose];
        const updateData: Partial<ConsentColumns> = {};

        if (body.granted) {
          const now = new Date();
          // La cible reçoit TOUJOURS `now()` — un octroi explicite est un
          // évènement neuf, même si la colonne portait déjà une date.
          updateData[targetColumn] = now;
          // Les ANCÊTRES ne sont posés que s'ils manquent — reproduit la
          // cascade de `VoiceProfileService.updateConsent` (voir doc-comment
          // de module) sans jamais écraser un octroi antérieur.
          for (const ancestor of ancestorsOf(purpose)) {
            const ancestorColumn = PURPOSE_COLUMN[ancestor];
            if (!existingColumns[ancestorColumn]) {
              updateData[ancestorColumn] = now;
            }
          }
        } else {
          // Un retrait ne touche QUE sa propre colonne — jamais ses
          // ancêtres ni ses dépendants (même choix que
          // `VoiceProfileService.updateConsent`).
          updateData[targetColumn] = null;
        }

        const updated = await fastify.prisma.user.update({
          where: { id: userId },
          data: updateData,
          select: CONSENT_SELECT,
        });

        const entry = buildConsentEntry(purpose, (updated as ConsentColumns)[targetColumn]);
        return sendSuccess(reply, entry);
      } catch (error) {
        logError('Error updating consent', error, { source: 'me-consents-routes' });
        return sendInternalError(reply, 'UPDATE_ERROR', { message: 'Failed to update consent' });
      }
    }
  );
}
