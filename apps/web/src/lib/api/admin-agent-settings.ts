import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { AGENT_GLOBAL_FIELDS, AGENT_LLM_FIELDS, pickServed, type AgentServed } from '@/lib/admin/agent-settings-form';

import { type AdminDeps, asCount, asRecord } from './admin';
import { AGENT_ROOT_KEY } from './admin-agent';
import type { ApiResult } from './http';

/**
 * **LE MODÈLE, LA CONFIGURATION GLOBALE, LA REMISE À ZÉRO TOTALE** (lot Agent
 * complet) — les réglages qui valent pour TOUTE la plateforme.
 *
 * | adresse | garde | ce qu'elle fait |
 * |---|---|---|
 * | `GET /admin/agent/llm` | `canManageAgent` | le fournisseur, le modèle, le budget — la clé n'est JAMAIS servie (`hasApiKey`) |
 * | `PUT /admin/agent/llm` | **souverain** | réécrit le modèle ; motif facultatif pour lui, validé s'il est écrit |
 * | `GET /admin/agent/global-config` | `canManageAgent` | le prompt système, les plafonds, l'interrupteur global |
 * | `PUT /admin/agent/global-config` | `canManageAgent` | les réécrit (tracé au journal) |
 * | `DELETE /admin/agent/reset` | **souverain** | efface TOUT l'état de l'agent, corps `{}` ou `{ reason }` |
 *
 * ## La clé API ne revient jamais
 *
 * La passerelle ne sert que `hasApiKey`. Le formulaire offre un champ VIDE ; il
 * ne part (sous `apiKeyEncrypted`, le nom de la colonne) que s'il a été saisi —
 * un enregistrement qui ne touche pas la clé la laisse telle quelle.
 *
 * ## Un DELETE qui déclare un corps reçoit un corps
 *
 * `DELETE /reset` déclare `body: { type: 'object' }` : un corps JSON part
 * toujours, `{}` sans motif, `{ reason }` avec.
 */
export const agentLlmQueryKey = () => [...AGENT_ROOT_KEY, 'llm'] as const;
export const agentGlobalConfigQueryKey = () => [...AGENT_ROOT_KEY, 'global-config'] as const;

export type AgentLlmConfig = {
  /** Les champs que le formulaire réécrit, aux types servis (`AGENT_LLM_FIELDS`). */
  readonly fields: AgentServed;
  readonly hasApiKey: boolean;
  readonly maxTokens: number | null;
  readonly temperature: number | null;
  readonly fallbackProvider: string | null;
  readonly fallbackModel: string | null;
  readonly updatedAt: string | null;
};

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function decodeLlm(raw: unknown): AgentLlmConfig | null {
  const charge = asRecord(raw);
  if (charge === null) return null;
  return {
    fields: pickServed(AGENT_LLM_FIELDS, charge),
    hasApiKey: charge.hasApiKey === true,
    maxTokens: numberOrNull(charge.maxTokens),
    temperature: numberOrNull(charge.temperature),
    fallbackProvider: textOrNull(charge.fallbackProvider),
    fallbackModel: textOrNull(charge.fallbackModel),
    updatedAt: textOrNull(charge.updatedAt),
  };
}

/** `data: null` — aucun modèle n'a jamais été configuré : `null`, pas un modèle par défaut inventé. */
export async function loadAgentLlm(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AgentLlmConfig | null>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentLlm,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeLlm(resultat.data) };
}

export async function saveAgentLlm(
  params: AdminDeps & {
    readonly changes: Readonly<Record<string, unknown>>;
    /** Saisie : envoyée ; vide : la clé en place reste. */
    readonly apiKey: string;
    readonly reason: string | null;
  },
): Promise<ApiResult<AgentLlmConfig | null>> {
  const key = params.apiKey.trim();
  const resultat = await params.transport.request<unknown>({
    method: 'PUT',
    path: adminEndpoints.agentLlm,
    body: {
      ...params.changes,
      ...(key === '' ? {} : { apiKeyEncrypted: key }),
      ...(params.reason === null || params.reason === '' ? {} : { reason: params.reason }),
    },
  });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeLlm(resultat.data) };
}

export type AgentGlobalConfig = {
  readonly fields: AgentServed;
  readonly updatedAt: string | null;
};

const decodeGlobal = (raw: unknown): AgentGlobalConfig => {
  const charge = asRecord(raw) ?? {};
  return { fields: pickServed(AGENT_GLOBAL_FIELDS, charge), updatedAt: textOrNull(charge.updatedAt) };
};

export async function loadAgentGlobalConfig(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AgentGlobalConfig>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentGlobalConfig,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeGlobal(resultat.data) };
}

export async function saveAgentGlobalConfig(
  params: AdminDeps & { readonly changes: Readonly<Record<string, unknown>> },
): Promise<ApiResult<AgentGlobalConfig>> {
  const resultat = await params.transport.request<unknown>({ method: 'PUT', path: adminEndpoints.agentGlobalConfig, body: params.changes });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeGlobal(resultat.data) };
}

/** Ce que la remise à zéro a effacé, compté par la passerelle — dit tel quel, jamais supposé. */
export type AgentResetCounts = Readonly<Record<string, number>>;

export const decodeResetCounts = (raw: unknown): AgentResetCounts => {
  const deleted = asRecord(asRecord(raw)?.deleted) ?? {};
  return Object.fromEntries(Object.entries(deleted).map(([key, value]) => [key, asCount(value)]));
};

export async function resetAgentEverything(
  params: AdminDeps & { readonly reason: string | null },
): Promise<ApiResult<AgentResetCounts>> {
  const resultat = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.agentReset,
    body: params.reason === null || params.reason === '' ? {} : { reason: params.reason },
  });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeResetCounts(resultat.data) };
}
