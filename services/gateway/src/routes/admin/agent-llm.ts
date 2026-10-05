/**
 * Surface LLM des routes admin de l'agent — configuration du fournisseur LLM
 * (souverain, #4157) et configuration globale de l'agent (prompt système,
 * fournisseur par défaut, budgets). Point d'entrée : `agent.ts` (#4284).
 */

import { auditAgentGesture } from './agent-audit';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logWarn } from '../../utils/logger';
import { sendSuccess, sendBadRequest, sendError, sendInternalError } from '../../utils/response';
import {
  SecretAtRestUnavailableError,
  canSealSecrets,
  isSealedSecret,
  sealSecret,
  secretHint,
} from '../../utils/secret-at-rest';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { withAudit } from '../../middleware/authorize';
import { judgeReason } from '../../middleware/sovereign-reason';
import {
  requireAgentAdmin,
  requireAgentSovereign,
  successDataResponse,
  stdErrors,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';

const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().min(1).optional(),
  apiKeyEncrypted: z.string().min(1).optional(),
  baseUrl: z.url().nullable().optional(),
  maxTokens: z.number().int().min(64).max(16384).optional(),
  temperature: z.number().min(0).max(2).optional(),
  dailyBudgetUsd: z.number().min(0).optional(),
  maxCostPerCall: z.number().min(0).optional(),
  fallbackProvider: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  fallbackApiKeyEncrypted: z.string().nullable().optional(),
});

// #4157 — `PUT /llm` monte en S6 : le motif écrit voyage dans le MÊME corps
// que la config (pas un second appel), et se retire AVANT `data:` — Prisma
// n'a pas de colonne `reason` sur `AgentLlmConfig`, `withAudit` la porte dans
// `AdminAuditLog.metadata` à la place.
// Le motif est facultatif pour le rang souverain (le seul qui atteint cette
// route) et validé s'il est écrit : `judgeReason` en décide, le schéma ne
// garde que la forme (spec 2026-10-04 § 4).
const llmConfigWriteSchema = llmConfigSchema.extend({
  reason: z.string().optional(),
});
const MOTIF_MINIMAL = 10;

/**
 * Les deux colonnes de clé d'API et le contexte qui scelle chacune (lié en
 * données authentifiées : une valeur d'une colonne ne s'ouvre pas pour l'autre).
 * Le nom `apiKeyEncrypted` est celui de la colonne ET du champ du corps : le
 * client y envoie la clé en clair (TLS), la passerelle la scelle avant Prisma.
 */
const SECRET_COLUMNS = [
  { column: 'apiKeyEncrypted', context: 'AgentLlmConfig.apiKey' },
  { column: 'fallbackApiKeyEncrypted', context: 'AgentLlmConfig.fallbackApiKey' },
] as const;

type SecretColumn = (typeof SECRET_COLUMNS)[number]['column'];
type StoredSecrets = Partial<Record<SecretColumn, string | null>>;

/**
 * Scelle les clés que le corps porte. Une clé déjà en base mais encore en
 * clair (écrite avant le chiffrement au repos) est re-scellée à cette écriture
 * quand une clé de chiffrement est disponible. Lève
 * `SecretAtRestUnavailableError` si une clé du corps ne peut pas être scellée.
 */
function sealSecretColumns<T extends StoredSecrets>(data: T, existing: StoredSecrets | null): T {
  const sealed: T = { ...data };
  for (const { column, context } of SECRET_COLUMNS) {
    const incoming = data[column];
    if (typeof incoming === 'string' && incoming !== '') {
      (sealed as StoredSecrets)[column] = sealSecret(incoming, context);
      continue;
    }
    if (incoming !== undefined) continue;
    const stored = existing?.[column];
    if (typeof stored === 'string' && stored !== '' && !isSealedSecret(stored) && canSealSecrets()) {
      (sealed as StoredSecrets)[column] = sealSecret(stored, context);
    }
  }
  return sealed;
}

/** La forme servie : jamais la clé ni sa forme scellée — un booléen et 4 caractères. */
function redactLlmConfig<T extends StoredSecrets>(config: T) {
  const { apiKeyEncrypted, fallbackApiKeyEncrypted, ...safeConfig } = config;
  return {
    ...safeConfig,
    hasApiKey: !!apiKeyEncrypted,
    apiKeyLast4: secretHint(apiKeyEncrypted, SECRET_COLUMNS[0].context),
    hasFallbackApiKey: !!fallbackApiKeyEncrypted,
    fallbackApiKeyLast4: secretHint(fallbackApiKeyEncrypted, SECRET_COLUMNS[1].context),
  };
}

export function registerAgentLlmRoutes(fastify: FastifyInstance, deps: AgentRouteDeps): void {
  const { broadcastInvalidation } = deps;

  // GET /llm
  fastify.get('/llm', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get the current LLM provider config. API keys are encrypted at rest and never served: hasApiKey / apiKeyLast4 (and their fallback counterparts) instead.',
      tags: ['admin-agent'],
      summary: 'Get LLM config',
      security: securityBearerAuth,
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await fastify.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (!config) {
        return sendSuccess(reply, null);
      }
      return sendSuccess(reply, redactLlmConfig(config));
    } catch (error) {
      logError(fastify.log, 'Error fetching LLM config:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // PUT /llm — S6 souverain (#4157) : voir la note à côté de `requireAgentSovereign`.
  fastify.put('/llm', {
    onRequest: [fastify.authenticate, requireAgentSovereign],
    schema: {
      description: 'Create or update the LLM provider config (provider, model, API key, budget). Rang souverain (BIGBOSS) ; motif écrit facultatif pour lui, validé s\'il est fourni (spec 2026-10-04 § 4) — #4157.',
      tags: ['admin-agent'],
      summary: 'Update LLM config',
      security: securityBearerAuth,
      body: { type: 'object' },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = llmConfigWriteSchema.safeParse(request.body);
      const verdict = parsed.success ? judgeReason(request, parsed.data.reason, MOTIF_MINIMAL) : null;
      if (!parsed.success || !verdict?.ok) {
        return sendBadRequest(reply, 'Données invalides : un motif écrit (10 caractères minimum) est requis pour modifier la configuration LLM');
      }
      const { reason: _brut, ...plainData } = parsed.data;
      const reason = verdict.reason;

      const authContext = (request as UnifiedAuthRequest).authContext;
      const existing = await fastify.prisma.agentLlmConfig.findFirst();

      let llmData: typeof plainData;
      try {
        llmData = sealSecretColumns(plainData, existing);
      } catch (error) {
        if (error instanceof SecretAtRestUnavailableError) {
          logError(fastify.log, 'LLM API key not stored: secret encryption unavailable', error);
          return sendError(reply, 503, 'Le chiffrement des secrets n\'est pas configuré : la clé d\'API n\'a pas été enregistrée');
        }
        throw error;
      }

      let config;
      if (existing) {
        config = await fastify.prisma.agentLlmConfig.update({
          where: { id: existing.id },
          data: llmData,
        });
      } else {
        config = await fastify.prisma.agentLlmConfig.create({
          data: {
            configuredBy: authContext.registeredUser.id,
            apiKeyEncrypted: llmData.apiKeyEncrypted ?? '',
            ...llmData,
          },
        });
      }

      // Écrite APRÈS le succès de la persistance : un geste qui a eu lieu
      // doit laisser sa trace même si l'audit lui-même échoue (`withAudit`
      // est best-effort, cf. sa doc). Ne PORTE PAS `changes` : `apiKeyEncrypted`
      // / `fallbackApiKeyEncrypted` n'ont rien à faire dans un second journal.
      await withAudit(request, {
        action: 'AGENT_LLM_CONFIG_UPDATED',
        entity: 'AgentLlmConfig',
        entityId: config.id,
        userId: authContext.registeredUser.id,
        reason,
      });

      // Provider/model/temperature/maxTokens/baseUrl changes need the agent
      // service to rebuild its LLM router — without this the new settings
      // sit in Mongo unused until the next agent restart.
      const invalidationStatus = await broadcastInvalidation({ global: true });
      return sendSuccess(reply, { ...redactLlmConfig(config), cacheInvalidation: invalidationStatus });
    } catch (error) {
      logError(fastify.log, 'Error updating LLM config:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  const globalConfigSchema = z.object({
    systemPrompt: z.string().max(10000).optional(),
    enabled: z.boolean().optional(),
    defaultProvider: z.enum(['openai', 'anthropic']).optional(),
    defaultModel: z.string().min(1).optional(),
    fallbackProvider: z.string().nullable().optional(),
    fallbackModel: z.string().nullable().optional(),
    globalDailyBudgetUsd: z.number().min(0).max(1000).optional(),
    maxConcurrentCalls: z.number().int().min(1).max(50).optional(),
    eligibleConversationTypes: z.array(z.string()).optional(),
    messageFreshnessHours: z.number().int().min(1).max(168).optional(),
    maxConversationsPerCycle: z.number().int().min(0).optional(),
    weekdayMaxConversations: z.number().int().min(1).max(500).optional(),
    weekendMaxConversations: z.number().int().min(1).max(500).optional(),
    globalScanEnabled: z.boolean().optional(),
    globalScanMinInterval: z.number().int().min(1).optional(),
    globalScanMaxInterval: z.number().int().min(1).optional(),
  });

  // GET /global-config
  fastify.get('/global-config', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get the global agent configuration (system prompt, provider defaults, budget).',
      tags: ['admin-agent'],
      summary: 'Get global agent config',
      security: securityBearerAuth,
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      let config = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (!config) {
        config = await fastify.prisma.agentGlobalConfig.create({ data: {} });
      }
      return sendSuccess(reply, config);
    } catch (error) {
      logError(fastify.log, 'Error fetching global agent config:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // PUT /global-config
  fastify.put('/global-config', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Update the global agent configuration. Publishes config-invalidated event.',
      tags: ['admin-agent'],
      summary: 'Update global agent config',
      security: securityBearerAuth,
      body: { type: 'object' },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = globalConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Données invalides');
      }

      let existing = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      let config;
      if (existing) {
        config = await fastify.prisma.agentGlobalConfig.update({
          where: { id: existing.id },
          data: parsed.data,
        });
      } else {
        config = await fastify.prisma.agentGlobalConfig.create({ data: parsed.data });
      }

      const invalidationStatus = await broadcastInvalidation({ global: true });
      if (!invalidationStatus.anyChannelSucceeded) {
        logWarn(
          fastify.log,
          `[AgentGlobalConfig] Cache invalidation failed on both Redis pub/sub AND direct HTTP; agent service may serve stale config for up to 10 min (status=${JSON.stringify(invalidationStatus)})`,
        );
      }

      await auditAgentGesture(request, { action: 'AGENT_GLOBAL_CONFIG_UPDATED', entity: 'Agent', entityId: 'global', changes: parsed.data });
      return sendSuccess(reply, { ...config, cacheInvalidation: invalidationStatus });
    } catch (error) {
      logError(fastify.log, 'Error upserting global agent config:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });
}
