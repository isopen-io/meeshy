/**
 * Les préférences d'un membre, depuis SA fiche d'administration (#7845 A/B).
 *
 * Jusqu'ici, les sept catégories de préférences n'avaient qu'une porte :
 * `/me/preferences/*`, c'est-à-dire le membre lui-même. Un administrateur qui
 * instruisait « je ne reçois plus aucune notification » ne pouvait ni LIRE le
 * réglage en cause, ni le remettre d'aplomb — il devait demander au membre de
 * décrire son écran.
 *
 * ## Une seule loi de calcul : le registre
 *
 * Rien ici ne réécrit la complétion par défauts, la validation stricte ni les
 * gestes d'après-écriture : ce sont les fonctions de `preference-registry.ts`,
 * les MÊMES que `/me` appelle. Une deuxième implémentation, même fidèle le jour
 * de son écriture, divergerait au premier défaut changé — c'est exactement ce
 * que #4181 a fermé pour l'agrégat.
 *
 * ## Deux seuils, et pourquoi pas un
 *
 * - LIRE : `canViewSensitiveData` (ADMIN+). La confidentialité d'un membre —
 *   montre-t-il sa présence, ses accusés de lecture, se cache-t-il de la
 *   recherche — est une donnée privée, au même titre que son e-mail ; AUDIT et
 *   MODERATOR la voient masquée ailleurs, ils ne la lisent pas ici.
 * - ÉCRIRE : les `gardes` de `users-write.ts` — `canUpdateUsers` ET le rang
 *   sur la cible. Une écriture visant un compte tient la hiérarchie sans
 *   exception à énumérer (#4154).
 *
 * ## Ce qu'un administrateur ne PEUT PAS écrire
 *
 * Un consentement. Les clés `*ConsentAt`, `voiceCloningEnabledAt` et `extras`
 * (le canal de compatibilité des clients, dont le contenu n'appartient qu'à
 * eux) sont servies en `readOnly` et refusées en 403 : les consentements ont
 * leur geste — `PATCH /admin/users/:id/consents`, motif obligatoire — et une
 * catégorie de préférences n'est pas une porte dérobée vers eux.
 * `tutorialsCompleted` est l'état de progression du membre, pas un réglage.
 *
 * Et la famille CHIFFREMENT (`privacy` : `encryptionPreference`,
 * `autoEncryptNewConversations`, `warnOnUnencrypted`). Aucune n'est un secret
 * — les clés Signal vivent dans `SignalPreKeyBundle`, jamais ici — mais elles
 * décident si les conversations du membre sont chiffrées : les écrire en son
 * nom, c'est pouvoir abaisser sa protection sans qu'il le sache. L'état se
 * CONSTATE (servi, en `readOnly`), il ne se pose pas. Cette règle-là dépend de
 * la CATÉGORIE : une clé homonyme d'une autre catégorie n'en hérite pas.
 *
 * ## La trace
 *
 * Lire écrit `VIEW_USER` (`metadata.surface: 'preferences'`), comme le profil
 * vocal (`user-profile-reads.ts`) : des réglages de confidentialité sont une
 * pièce de la vie privée du membre, et l'onglet peut s'ouvrir sans que la fiche
 * se recharge. Écrire trace `UPDATE_PREFERENCES` avec les SEULES clés changées
 * (`catégorie.clé` en `changes`, la catégorie et ces clés en `metadata`) : une
 * clé soumise à sa valeur courante n'a rien changé, et la tracer ferait lire au
 * relecteur un geste qui n'a pas eu lieu.
 *
 * Et ce que le membre n'a pas consenti : la validation des consentements lit
 * ceux de la CIBLE (`ConsentValidationService`), jamais ceux de l'acteur. Un
 * administrateur ne rallume pas une télémétrie que le membre a refusée.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UserAuditAction } from '@meeshy/shared/types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { ConsentValidationService } from '../../services/ConsentValidationService';
import { requireUserViewAccess, requireUserModifyAccess } from '../../middleware/admin-user-auth.middleware';
import { requirePermission, requireHierarchy } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import {
  PREFERENCE_REGISTRY,
  applyCategoryWriteEffects,
  isPreferenceCategory,
  parseSubmittedKeys,
  readStoredCategory,
  resolveComplete,
  type PreferenceCategory,
  type PreferenceDocument,
} from '../me/preferences/preference-registry';
import { PREFERENCE_DESCRIPTORS } from '../me/preferences/preference-descriptors';
import { parseSelection } from '../me/preferences/preference-selection';
import { zodIssueSchema, issuesServies } from '../../utils/zod-issue-schema';
import { userPreferencesSuccess, userPreferenceWriteSuccess, adminErrorResponses, userIdParams } from './user-admin-response-schemas';
import { sendSuccess, sendBadRequest, sendError, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger.js';

type Deps = {
  userAuditService: UserAuditService;
};

/**
 * `true` quand la clé n'est pas un réglage qu'un administrateur peut poser —
 * voir « Ce qu'un administrateur ne PEUT PAS écrire » dans l'en-tête.
 */
export const ADMIN_READ_ONLY_PREFERENCE_KEYS: Readonly<Partial<Record<PreferenceCategory, readonly string[]>>> = {
  privacy: ['encryptionPreference', 'autoEncryptNewConversations', 'warnOnUnencrypted'],
};

export function isAdminReadOnlyPreference(category: PreferenceCategory, key: string): boolean {
  return (
    key === 'extras' ||
    key === 'tutorialsCompleted' ||
    key === 'voiceCloningEnabledAt' ||
    key.endsWith('ConsentAt') ||
    (ADMIN_READ_ONLY_PREFERENCE_KEYS[category] ?? []).includes(key)
  );
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

type CategorieServie = {
  readonly values: PreferenceDocument;
  readonly stored: readonly string[];
  readonly fields: (typeof PREFERENCE_DESCRIPTORS)[PreferenceCategory];
  readonly readOnly: readonly string[];
};

function servirCategorie(category: PreferenceCategory, stored: PreferenceDocument | null): CategorieServie {
  const values = resolveComplete(PREFERENCE_REGISTRY[category].defaults, stored);
  const fields = PREFERENCE_DESCRIPTORS[category];
  const cles = new Set([...Object.keys(fields), ...Object.keys(values)]);
  return {
    values,
    stored: Object.keys(stored ?? {}),
    fields,
    readOnly: [...cles].filter((cle) => isAdminReadOnlyPreference(category, cle)),
  };
}

/**
 * `?categories=a,b` → les catégories nommées, dans l'ordre du registre ; absent
 * → les sept ; une inconnue → `null`. La grammaire est celle de
 * `GET /me/preferences` (`parseSelection`) : deux analyseurs de la même liste
 * divergeraient au premier jeton qu'un seul des deux saurait lire.
 */
function categoriesDemandees(brut: string | undefined): readonly PreferenceCategory[] | null {
  const resultat = parseSelection({ categories: brut });
  return resultat.ok ? resultat.selection.categories : null;
}

/**
 * L'identifiant de l'acteur, ou `null` — jamais une chaîne vide. Les gardes en
 * amont exigent un compte enregistré ; si l'une d'elles venait à céder, la
 * route REFUSE plutôt que d'écrire une trace signée par personne.
 */
function acteurId(request: FastifyRequest): string | null {
  const id = (request as UnifiedAuthRequest).authContext.registeredUser?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

const erreurDeValidation = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    issues: { type: 'array', items: zodIssueSchema },
  },
} as const;

/**
 * `violations` déclaré LIBRE, comme la factory de `/me` : la forme que
 * `ConsentValidationService` rend (`field`, `requiredConsents`) n'est pas celle
 * qu'`errorResponseSchema` décrit (`path`), et `fast-json-stringify` effacerait
 * au dernier mètre le seul champ qui dit QUEL réglage a été refusé.
 */
const refusDeConsentement = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    violations: { type: 'array' },
    keys: { type: 'array', items: { type: 'string' } },
  },
} as const;

export function registerUserPreferenceRoutes(fastify: FastifyInstance, deps: Deps): void {
  const { userAuditService } = deps;
  const consentService = new ConsentValidationService(fastify.prisma);

  /**
   * GET /admin/users/:userId/preferences — les valeurs EFFECTIVES de chaque
   * catégorie, ce qui est réellement stocké, et la description des champs.
   * Lecture tracée (`VIEW_USER`, voir « La trace » en tête).
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { categories?: string };
  }>('/admin/users/:userId/preferences', {
    preHandler: [fastify.authenticate, requireUserViewAccess, requirePermission('canViewSensitiveData')],
    schema: {
      description: "Préférences d'un membre (sept catégories), défauts comblés, clés stockées et description des champs. #7845.",
      tags: ['admin'],
      summary: "Read a member's preferences (admin)",
      params: userIdParams,
      querystring: {
        type: 'object',
        properties: { categories: { type: 'string', description: 'Liste séparée par des virgules' } },
      },
      response: { 200: userPreferencesSuccess, ...adminErrorResponses },
    },
  }, async (request, reply) => {
    try {
      const { userId } = request.params;
      const acteur = acteurId(request);
      if (!acteur) return sendForbidden(reply, 'Registered administrator required', { code: 'FORBIDDEN' });
      const categories = categoriesDemandees(request.query.categories);
      if (!categories) {
        return sendBadRequest(reply, 'Unknown preference category', { code: 'INVALID_CATEGORY' });
      }

      const existe = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!existe) return sendNotFound(reply, 'Utilisateur non trouvé');

      const stockes = await Promise.all(
        categories.map((category) => readStoredCategory(fastify.prisma, userId, category))
      );

      await userAuditService.createAuditLog({
        userId,
        adminId: acteur,
        action: UserAuditAction.VIEW_USER,
        entityId: userId,
        metadata: { surface: 'preferences' },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return sendSuccess(reply, {
        userId,
        categories: Object.fromEntries(
          categories.map((category, index) => [category, servirCategorie(category, stockes[index] ?? null)])
        ),
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching user preferences (admin)', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch user preferences' });
    }
  });

  /**
   * PATCH /admin/users/:userId/preferences/:category — écriture PARTIELLE
   * d'une catégorie, avec la même rigueur que `/me` (`.strict()` : une clé
   * non déclarée lève), puis les trois gestes d'après-écriture.
   */
  fastify.patch<{
    Params: { userId: string; category: string };
    Body: { values: Record<string, unknown>; reason?: string };
  }>('/admin/users/:userId/preferences/:category', {
    preHandler: [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })],
    schema: {
      description: "Écrit une catégorie de préférences d'un membre. Consentements en lecture seule. #7845.",
      tags: ['admin'],
      summary: "Update a member's preference category (admin)",
      params: {
        type: 'object',
        required: ['userId', 'category'],
        properties: { userId: userIdParams.properties.userId, category: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['values'],
        // `propertyNames` et non `additionalProperties: false`, qui sous
        // `removeAdditional` (défaut Fastify) RETIRE en silence au lieu de refuser.
        propertyNames: { enum: ['values', 'reason'] },
        properties: {
          values: { type: 'object', additionalProperties: true },
          reason: { type: 'string', maxLength: 500 },
        },
      },
      response: {
        200: userPreferenceWriteSuccess,
        400: erreurDeValidation,
        401: errorResponseSchema,
        403: refusDeConsentement,
        404: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request, reply) => ecrire(request, reply));

  async function ecrire(
    request: FastifyRequest<{ Params: { userId: string; category: string }; Body: { values: Record<string, unknown>; reason?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { userId, category } = request.params;
    const { values, reason } = request.body;

    if (!isPreferenceCategory(category)) {
      return sendBadRequest(reply, 'Unknown preference category', { code: 'INVALID_CATEGORY' });
    }

    const interdites = Object.keys(values).filter((cle) => isAdminReadOnlyPreference(category, cle));
    if (interdites.length > 0) {
      return sendError(reply, 403, 'READ_ONLY_PREFERENCE', {
        message: `An administrator cannot write ${interdites.join(', ')} on behalf of a member`,
        code: 'READ_ONLY_PREFERENCE',
        details: { keys: interdites },
      });
    }

    const acteur = acteurId(request);
    if (!acteur) return sendForbidden(reply, 'Registered administrator required', { code: 'FORBIDDEN' });

    try {
      const submitted = parseSubmittedKeys(category, values);

      const violations = await consentService.validatePreferences(userId, category, submitted);
      if (violations.length > 0) {
        return sendForbidden(reply, 'CONSENT_REQUIRED', {
          message: 'The member has not given the consent these preferences require',
          code: 'CONSENT_REQUIRED',
          violations,
        });
      }

      const stockeAvant = await readStoredCategory(fastify.prisma, userId, category);
      const avant = resolveComplete(PREFERENCE_REGISTRY[category].defaults, stockeAvant);

      // Un corps qui ne nomme aucune clé n'écrit RIEN. L'upsert d'un document
      // fusionné graverait sinon chaque DÉFAUT comme une valeur stockée : le
      // membre perdrait, sans l'avoir demandé, les défauts à venir.
      if (Object.keys(submitted).length === 0) {
        return sendSuccess(reply, { category, values: avant, stored: Object.keys(stockeAvant ?? {}) });
      }

      const merged = { ...avant, ...submitted };

      await fastify.prisma.userPreferences.upsert({
        where: { userId },
        create: { userId, [category]: merged },
        update: { [category]: merged },
        select: { id: true },
      });

      await applyCategoryWriteEffects(fastify, userId, [category]);

      const changees = Object.keys(submitted).filter((cle) => !sameValue(avant[cle], submitted[cle]));
      const changes = Object.fromEntries(
        changees.map((cle) => [`${category}.${cle}`, { before: avant[cle] ?? null, after: submitted[cle] }])
      );
      await userAuditService.createAuditLog({
        userId,
        adminId: acteur,
        action: UserAuditAction.UPDATE_PREFERENCES,
        entityId: userId,
        changes,
        metadata: { category, keys: changees, ...(reason ? { reason } : {}) },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return sendSuccess(reply, {
        category,
        values: merged,
        stored: [...new Set([...Object.keys(stockeAvant ?? {}), ...Object.keys(submitted)])],
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        const issues = (error as Error & { issues?: ReadonlyArray<unknown> }).issues ?? [];
        return sendBadRequest(reply, 'VALIDATION_ERROR', { details: { issues: issuesServies(issues) } });
      }
      logError(fastify.log, `Error updating user preferences (admin, category=${category})`, error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to update user preferences' });
    }
  }
}
