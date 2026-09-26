/**
 * Les préférences d'un membre, lues et écrites par l'administration web (#7845).
 *
 * - `GET /admin/users/:userId/preferences` — les sept catégories du registre
 *   (`PREFERENCE_REGISTRY` : privacy, audio, message, notification, video,
 *   document, application), complétées par leurs défauts. Seuil de lecture de
 *   la fiche (`requireUserViewAccess` ⇒ `canViewUsers`) ; chaque lecture est
 *   tracée (`VIEW_USER` + `metadata.surface`), comme le profil vocal : des
 *   réglages de confidentialité sont une pièce de la vie privée du membre.
 * - `PATCH /admin/users/:userId/preferences/:category` — écriture PARTIELLE
 *   d'une catégorie, sous les gardes des écritures de compte
 *   (`users-write.ts` : `requireUserModifyAccess` ⇒ `canUpdateUsers`, puis
 *   `requireHierarchy` — on n'écrit pas les réglages d'un rang que l'on ne
 *   surclasse pas, fail-closed sur une cible introuvable).
 *
 * Rien n'est redéfini ici : le corps passe par `parseSubmittedKeys` (le schéma
 * STRICT de la catégorie, celui du `PATCH /me/preferences`), la base de fusion
 * par `resolveCompleteCategories`, la garde de consentement par
 * `ConsentValidationService` — un administrateur n'allume pas pour autrui une
 * fonction dont le membre n'a pas donné le consentement —, et les trois gestes
 * d'après-écriture (lignes héritées, cache des portes de diffusion,
 * `preferences:updated` vers les appareils du membre) par
 * `applyCategoryWriteEffects`.
 *
 * ## Ce qu'un administrateur ne touche pas : la famille CHIFFREMENT
 *
 * Aucune clé n'est un secret dans ces documents — les clés Signal vivent dans
 * `SignalPreKeyBundle`, jamais dans `UserPreferences`, et cette surface ne les
 * lit pas. Mais `encryptionPreference`, `autoEncryptNewConversations` et
 * `warnOnUnencrypted` (catégorie `privacy`) décident si les conversations du
 * membre sont chiffrées : les écrire au nom d'autrui, c'est pouvoir abaisser
 * sa protection sans qu'il le sache. Elles restent LUES (l'état se constate),
 * et leur écriture est refusée en 403 — un champ connu refusé est une
 * question d'autorisation, pas une requête malformée.
 *
 * ## La trace
 *
 * `UPDATE_PREFERENCES`, la catégorie et les clés changées en `metadata`, et
 * l'avant/après de chaque clé changée en `changes` (`catégorie.clé`). Une clé
 * soumise à sa valeur courante ne se trace pas : rien n'a changé.
 */
import type { FastifyInstance } from 'fastify';
import { UserAuditAction, type AuditChange } from '@meeshy/shared/types';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { ConsentValidationService } from '../../services/ConsentValidationService';
import { requireUserViewAccess, requireUserModifyAccess } from '../../middleware/admin-user-auth.middleware';
import { requireHierarchy } from '../../middleware/authorize';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { sendNotFound, sendInternalError, sendSuccess, sendBadRequest, sendError, sendForbidden } from '../../utils/response';
import { zodIssueSchema, issuesServies } from '../../utils/zod-issue-schema';
import { logError } from '../../utils/logger.js';
import {
  PREFERENCE_CATEGORIES,
  PREFERENCE_REGISTRY,
  applyCategoryWriteEffects,
  isPreferenceCategory,
  parseSubmittedKeys,
  resolveComplete,
  resolveCompleteCategories,
  type PreferenceCategory,
  type PreferenceDocument
} from '../me/preferences/preference-registry';

type Deps = {
  userAuditService: UserAuditService;
};

export const ADMIN_READ_ONLY_PREFERENCE_KEYS: Readonly<Partial<Record<PreferenceCategory, readonly string[]>>> = {
  privacy: ['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted']
};

const readOnlyKeysIn = (category: PreferenceCategory, submitted: PreferenceDocument): string[] =>
  (ADMIN_READ_ONLY_PREFERENCE_KEYS[category] ?? []).filter((key) => key in submitted);

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const userIdParams = {
  type: 'object',
  required: ['userId'],
  properties: { userId: { type: 'string', pattern: OBJECT_ID_PATTERN } }
} as const;

/**
 * Un document de catégorie est une CARTE : ses clés sont celles du schéma Zod
 * de la catégorie, plus `extras`. `additionalProperties: true`, comme la
 * réponse du `GET /me/preferences` qui sert les mêmes documents — sans cette
 * clause, fast-json-stringify rendrait `{}` et effacerait chaque réglage.
 */
const PREFERENCE_DOCUMENT = { type: 'object', additionalProperties: true } as const;

const categoryDocuments = {
  type: 'object',
  properties: Object.fromEntries(PREFERENCE_CATEGORIES.map((category) => [category, PREFERENCE_DOCUMENT]))
} as const;

export function registerUserMemberPreferencesRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { userAuditService } = deps;
  const consentService = new ConsentValidationService(fastify.prisma);

  /**
   * GET /admin/users/:userId/preferences - Les sept catégories du membre,
   * complétées par les défauts. Requiert canViewUsers ; lecture tracée.
   */
  fastify.get<{
    Params: { userId: string };
  }>('/admin/users/:userId/preferences', {
    preHandler: [fastify.authenticate, requireUserViewAccess],
    schema: {
      description:
        "Préférences d'un membre, les sept catégories complétées par leurs défauts (lecture tracée). #7845.",
      tags: ['admin'],
      summary: 'Member preferences (admin)',
      security: [{ bearerAuth: [] }],
      params: userIdParams,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: categoryDocuments
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const { userId } = request.params;

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const preferences = await resolveCompleteCategories(fastify.prisma, userId, PREFERENCE_CATEGORIES);

      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.VIEW_USER,
        entityId: userId,
        metadata: { surface: 'preferences' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      return sendSuccess(reply, preferences);
    } catch (error) {
      logError(fastify.log, 'Error fetching user preferences', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user preferences' });
    }
  });

  /**
   * PATCH /admin/users/:userId/preferences/:category - Écriture partielle
   * d'une catégorie. Requiert canUpdateUsers et la hiérarchie sur la cible.
   */
  fastify.patch<{
    Params: { userId: string; category: string };
    Body: Record<string, unknown>;
  }>('/admin/users/:userId/preferences/:category', {
    preHandler: [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })],
    schema: {
      description:
        "Écrit une catégorie de préférences d'un membre — corps partiel validé par le schéma du " +
        '`PATCH /me/preferences`, famille chiffrement refusée, écriture tracée. #7845.',
      tags: ['admin'],
      summary: 'Update a member preference category (admin)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['userId', 'category'],
        properties: {
          userId: { type: 'string', pattern: OBJECT_ID_PATTERN },
          category: { type: 'string' }
        }
      },
      body: { type: 'object' },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                preferences: PREFERENCE_DOCUMENT
              }
            }
          }
        },
        400: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            issues: { type: 'array', items: zodIssueSchema }
          }
        },
        401: errorResponseSchema,
        403: {
          ...errorResponseSchema,
          properties: {
            ...errorResponseSchema.properties,
            violations: { type: 'array' },
            keys: { type: 'array', items: { type: 'string' } }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { userId, category } = request.params;

    if (!isPreferenceCategory(category)) {
      return sendBadRequest(reply, 'UNKNOWN_CATEGORY', {
        message: `Unknown preference category '${category}'`
      });
    }

    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendBadRequest(reply, 'VALIDATION_ERROR', { message: 'Body must be an object of preference keys' });
    }

    try {
      const submitted = parseSubmittedKeys(category, body);
      const keys = Object.keys(submitted);
      if (keys.length === 0) {
        return sendBadRequest(reply, 'VALIDATION_ERROR', { message: 'Body names no preference key' });
      }

      const refused = readOnlyKeysIn(category, submitted);
      if (refused.length > 0) {
        return sendError(reply, 403, 'ADMIN_READ_ONLY_PREFERENCE', {
          message: `An administrator cannot write ${refused.join(', ')} on behalf of a member`,
          details: { keys: refused }
        });
      }

      const userExists = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) {
        return sendNotFound(reply, 'Utilisateur non trouvé');
      }

      const violations = await consentService.validatePreferences(userId, category, submitted);
      if (violations.length > 0) {
        return sendForbidden(reply, 'CONSENT_REQUIRED', {
          message: 'Missing required consents for requested preferences',
          violations: violations.map((violation) => ({ ...violation, category }))
        });
      }

      const base = (await resolveCompleteCategories(fastify.prisma, userId, [category]))[category] ?? {};
      const stored = { ...base, ...submitted };

      const updated = await fastify.prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, [category]: stored },
        update: { [category]: stored },
        select: { id: true, [category]: true }
      });

      await applyCategoryWriteEffects(fastify, userId, [category]);

      const changed = keys.filter((key) => !sameValue(base[key], submitted[key]));
      const changes: Record<string, AuditChange> = Object.fromEntries(
        changed.map((key) => [`${category}.${key}`, { before: base[key] ?? null, after: submitted[key] }])
      );
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      await userAuditService.createAuditLog({
        userId,
        adminId: authContext.registeredUser!.id,
        action: UserAuditAction.UPDATE_PREFERENCES,
        entityId: userId,
        changes,
        metadata: { category, keys: changed },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      const persisted = (updated as Record<string, unknown>)[category] as PreferenceDocument | null | undefined;
      return sendSuccess(reply, {
        category,
        preferences: resolveComplete(PREFERENCE_REGISTRY[category].defaults, persisted)
      });
    } catch (error) {
      const failure = error as { name?: string; message?: string; issues?: unknown[] };
      if (failure.name === 'ZodError') {
        return sendBadRequest(reply, 'VALIDATION_ERROR', {
          message: failure.message,
          details: { issues: issuesServies(failure.issues ?? []) }
        });
      }
      logError(fastify.log, 'Error updating user preferences', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to update user preferences' });
    }
  });
}
