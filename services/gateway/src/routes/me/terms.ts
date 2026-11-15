/**
 * `GET /me/terms` et `PUT /me/terms` — le re-consentement aux CGU (#3635).
 *
 * ## Ce que ce fichier ferme
 *
 * `registerAccount` grave `termsAcceptedAt`/`termsVersion` à la création du
 * compte (« l'acte de création vaut acceptation », voir le doc-comment de
 * `services/auth/registration.service.ts`). `packages/shared/types/terms.ts`
 * documente explicitement ce qu'il NE fait PAS : dire qu'un compte existant
 * doit ré-accepter quand `CURRENT_TERMS_VERSION` avance — « un lot à part, qui
 * commence par une décision produit ». Ce fichier est ce lot, côté serveur :
 * un moyen de LIRE l'écart et de le COMBLER. La décision produit qu'il tranche
 * est étroite — quel contrat le serveur expose — jamais l'ENFORCEMENT (bloquer
 * l'accès, afficher une bannière) : ça reste au client, sur chaque plateforme,
 * un lot à part entière que ce fichier rend seulement possible.
 *
 * ## Même patron que `/me/consents`, et ce n'est pas un hasard
 *
 * Les deux sont des consentements versionnés sur `User` : `PUT /me/consents/:purpose`
 * exige que le client CITE la version en vigueur et refuse (409) toute autre
 * valeur — « un client qui accepterait une politique périmée ne consentirait
 * pas à celle qui compte » (doc-comment de `me/consents.ts`). `PUT /me/terms`
 * reprend la même discipline avec `CURRENT_TERMS_VERSION` : jamais de
 * `.default()`, jamais une acceptation qui ne nomme pas ce qu'elle accepte.
 *
 * ## Le champ dérivé, et pourquoi il est calculé ici plutôt que par le client
 *
 * `upToDate` compare `termsVersion` à `CURRENT_TERMS_VERSION` COTÉ SERVEUR :
 * un client qui ferait la comparaison lui-même devrait porter la constante à
 * jour, exactement le défaut que `packages/shared/types/terms.ts` corrige déjà
 * pour la version elle-même (« deux côtés qui la tiennent séparément finissent
 * par diverger », leçon de `CONSENT_POLICY_VERSION_DEFAULT`). Un compte SANS
 * AUCUNE version gravée (créé avant #3688, ou par un chemin interne qui ne
 * grave rien) est `upToDate: false` — l'absence n'est jamais confondue avec
 * une version à jour.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CURRENT_TERMS_VERSION } from '@meeshy/shared/types/terms';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { zodIssueSchema, issuesServies } from '../../utils/zod-issue-schema';
import { logError } from '../../utils/logger';
import {
  sendSuccess,
  sendUnauthorized,
  sendNotFound,
  sendBadRequest,
  sendError,
  sendInternalError,
} from '../../utils/response.js';

const TERMS_SELECT = { termsVersion: true, termsAcceptedAt: true } as const;

type TermsColumns = { termsVersion: string | null; termsAcceptedAt: Date | null };

type TermsStatus = {
  version: string | null;
  acceptedAt: string | null;
  currentVersion: string;
  upToDate: boolean;
};

/** L'UNIQUE projection colonnes → réponse — partagée par `GET` et `PUT`. */
function buildTermsStatus(columns: TermsColumns): TermsStatus {
  return {
    version: columns.termsVersion,
    acceptedAt: columns.termsAcceptedAt ? columns.termsAcceptedAt.toISOString() : null,
    currentVersion: CURRENT_TERMS_VERSION,
    upToDate: columns.termsVersion === CURRENT_TERMS_VERSION,
  };
}

const termsStatusSchema = {
  type: 'object',
  properties: {
    version: { type: 'string', nullable: true, description: 'Version des CGU gravée sur le compte (null si aucune)' },
    acceptedAt: { type: 'string', format: 'date-time', nullable: true },
    currentVersion: { type: 'string', description: 'Version des CGU EN VIGUEUR' },
    upToDate: { type: 'boolean', description: 'true si `version` égale `currentVersion`' },
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
  },
} as const;

const versionConflictResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    expectedVersion: {
      type: 'string',
      description:
        'La version EN VIGUEUR, lisible par une machine : un client dont la ' +
        'constante a dérivé se recale sans relire GET /me/terms.',
    },
  },
} as const;

/** `.strict()` rejette toute clé de plus — le serveur pose la date, jamais le client. */
const PutTermsBodySchema = z.object({ version: z.string().min(1) }).strict();

/**
 * Débit par COMPTE — même seuils et même raison que `/me/consents`
 * (`consentRateLimitConfig`, `routes/me/consents.ts`) : pas de journal à
 * protéger (une seule colonne, écrasée à chaque écriture), rien qui parte vers
 * un tiers, et `skipOnError: true` pour ne pas enfermer quelqu'un qui cherche
 * justement à régulariser son consentement pendant une panne du magasin de
 * compteurs.
 */
function termsRateLimitConfig(usage: 'read' | 'write') {
  const max = usage === 'read' ? 120 : 20;
  const timeWindow = usage === 'read' ? '1 minute' : '1 hour';
  return {
    max,
    timeWindow,
    hook: 'preHandler' as const,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `terms:${usage}:${userId}` : `terms:${usage}:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requêtes (me/terms/${usage}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

export async function meTermsRoutes(fastify: FastifyInstance) {
  // ═══════════════════════════════════════════════════════════════════════
  // GET /me/terms
  // ═══════════════════════════════════════════════════════════════════════
  fastify.get(
    '/terms',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: termsRateLimitConfig('read') },
      schema: {
        description: 'Lire la version des CGU acceptée par le compte et si elle est à jour.',
        tags: ['me', 'terms'],
        summary: 'Get terms acceptance status',
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean', example: true }, data: termsStatusSchema },
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
        const user = await fastify.prisma.user.findUnique({ where: { id: userId }, select: TERMS_SELECT });
        if (!user) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        return sendSuccess(reply, buildTermsStatus(user));
      } catch (error) {
        logError('Error fetching terms status', error, { source: 'me-terms-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch terms status' });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════
  // PUT /me/terms — ré-accepter la version EN VIGUEUR
  // ═══════════════════════════════════════════════════════════════════════
  fastify.put(
    '/terms',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: termsRateLimitConfig('write') },
      schema: {
        description:
          "Ré-accepter les CGU. `version` doit citer la version EN VIGUEUR, sinon 409 — " +
          'le serveur pose `new Date()`, jamais le client.',
        tags: ['me', 'terms'],
        summary: 'Accept current terms version',
        body: { type: 'object' },
        response: {
          200: {
            type: 'object',
            properties: { success: { type: 'boolean', example: true }, data: termsStatusSchema },
          },
          400: badRequestResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          409: versionConflictResponseSchema,
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

      let body: z.infer<typeof PutTermsBodySchema>;
      try {
        body = PutTermsBodySchema.parse(request.body);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return sendBadRequest(reply, 'VALIDATION_ERROR', {
            details: { issues: issuesServies(error.issues) },
          });
        }
        throw error;
      }

      if (body.version !== CURRENT_TERMS_VERSION) {
        return sendError(reply, 409, 'TERMS_VERSION_MISMATCH', {
          message:
            `Les CGU ont changé (version en vigueur : ${CURRENT_TERMS_VERSION}) — ` +
            'relire GET /me/terms avant de renvoyer ce PUT.',
          details: { expectedVersion: CURRENT_TERMS_VERSION },
        });
      }

      try {
        const existing = await fastify.prisma.user.findUnique({ where: { id: userId }, select: TERMS_SELECT });
        if (!existing) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const updated = await fastify.prisma.user.update({
          where: { id: userId },
          data: { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION },
          select: TERMS_SELECT,
        });

        return sendSuccess(reply, buildTermsStatus(updated));
      } catch (error) {
        logError('Error accepting terms', error, { source: 'me-terms-routes' });
        return sendInternalError(reply, 'UPDATE_ERROR', { message: 'Failed to accept terms' });
      }
    }
  );
}
