/**
 * Aides, constantes JSON-Schema et gardes COMMUNES aux routes admin de
 * l'agent — tout ce qu'utilisent au moins DEUX des fichiers `agent-*.ts`
 * (découpage #4284). Un helper qui ne sert qu'à un seul fichier extrait vit
 * dans ce fichier-là, pas ici. Point d'entrée : `agent.ts`.
 */

import type { FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { AgentAdminEventKind } from '@meeshy/shared/types/socketio-events';
import { sendBadRequest } from '../../utils/response';
import { OBJECT_ID_REGEX, OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import { requirePermission, requireSovereign } from '../../middleware/authorize';
import type { AgentHttpClient } from '../../services/AgentHttpClient';

export const validateObjectId = (id: string, name: string, reply: FastifyReply): boolean => {
  /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs; this branch is defensive dead code */
  if (!OBJECT_ID_REGEX.test(id)) {
    sendBadRequest(reply, `${name} invalide`);
    return false;
  }
  return true;
};

// `requireAgentAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
export const requireAgentAdmin = requirePermission('canManageAgent');

// #4157 — deux gestes de CE fichier montent en S6 (souverain, BIGBOSS seul),
// et non `canManageAgent` (ADMIN) comme le reste des routes ci-dessus :
//   - `PUT /llm` : `baseUrl` est LIBRE (n'importe quelle URL valide) —
//     l'écrire redirige TOUT le trafic LLM, donc le CONTENU des conversations
//     envoyé en contexte, vers un hôte arbitraire. Aucune permission de
//     domaine ne doit pouvoir déléguer ça.
//   - `DELETE /reset` : efface, sans corps, sans confirmation et sans audit,
//     TOUTES les configs, rôles, résumés, profils agent et clés Redis
//     `agent:*` de la PLATEFORME ENTIÈRE — pas un scope, la totalité.
// Les deux exigent donc `requireSovereign()` (BIGBOSS et lui seul), un motif
// écrit (imposé au niveau du schéma Fastify/AJV — `body.required: ['reason']`
// — refusé en 400 avant que le handler ne s'exécute) et une ligne
// `AdminAuditLog` via `withAudit`, écrite APRÈS le geste réussi.
export const requireAgentSovereign = requireSovereign();

// ── Reusable JSON Schema fragments ──────────────────────────────────────────

export const objectIdParam = { type: 'string', pattern: OBJECT_ID_PATTERN } as const;

export const conversationIdParams = {
  type: 'object',
  required: ['conversationId'],
  properties: { conversationId: objectIdParam },
} as const;

export const successDataResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }] },
  },
} as const;

export const successArrayResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
} as const;

export const paginatedArrayResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: { type: 'object', additionalProperties: true } },
    pagination: {
      type: 'object',
      additionalProperties: true,
      properties: {
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        hasMore: { type: 'boolean' },
      },
    },
  },
} as const;

export const securityBearerAuth = [{ bearerAuth: [] }];

export const stdErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  500: errorResponseSchema,
} as const;

export const stdErrorsWithNotFound = {
  ...stdErrors,
  404: errorResponseSchema,
} as const;

export type InvalidationStatus = {
  redisPublishOk: boolean;
  redisSubscribersNotified: number;
  httpInvalidateOk: boolean;
  anyChannelSucceeded: boolean;
};

/**
 * Dépendances construites UNE SEULE FOIS par `agentAdminRoutes` (agent.ts) —
 * client HTTP vers le service agent, invalidation de cache best-effort et
 * notification temps réel des dashboards admin — et injectées dans chaque
 * `registerAgentXxxRoutes` qui en a besoin.
 */
export type AgentRouteDeps = {
  agentClient: AgentHttpClient | null;
  broadcastInvalidation: (payload: { conversationId?: string; global?: boolean }) => Promise<InvalidationStatus>;
  notifyAdminDashboards: (kind: AgentAdminEventKind, conversationId?: string) => void;
};
