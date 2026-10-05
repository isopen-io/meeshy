import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { AGENT_CONFIG_FIELDS, pickServed, type AgentServed } from '@/lib/admin/agent-settings-form';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { AGENT_ROOT_KEY, asTextOrNull } from './admin-agent';
import { adminPageOf, type AdminPage } from './admin-page';
import { decodeResetCounts, type AgentResetCounts } from './admin-agent-settings';
import type { ApiResult } from './http';

/**
 * **L'AGENT SUR UNE CONVERSATION, EN ENTIER** (lot Agent complet) — ce que la
 * fiche d'une conversation suivie lit et écrit, depuis la liste de l'écran Agent.
 *
 * | adresse | ce qu'elle fait |
 * |---|---|
 * | `GET /configs/:id` | les réglages servis (une conversation suivie peut n'en avoir aucun : 404) |
 * | `PUT /configs/:id` | les réécrit — seuls les champs CHANGÉS partent |
 * | `DELETE /configs/:id` | supprime la configuration (sans corps) |
 * | `GET /configs/:id/summary` | le résumé que l'agent tient (404 tant qu'il n'en a pas écrit) |
 * | `GET /configs/:id/schedule` | le planning des 24 h, le budget du jour, la rafale |
 * | `GET /configs/:id/roles?offset&limit` | les membres pilotés et leur rôle (pagination par OFFSET, l'inverse des listes voisines) |
 * | `GET /configs/:id/messages?page&limit` | les messages que l'agent a publiés |
 * | `GET /archetypes` | le catalogue des archétypes assignables |
 * | `POST /roles/:id/:userId/assign` | pose un archétype (`{ archetypeId }`) |
 * | `POST /roles/:id/:userId/unlock` | déverrouille le rôle (confiance remise à 0, sans corps) |
 * | `DELETE /reset/conversation/:id` | efface config, rôles, résumé, analytique et cache de la conversation (sans corps) |
 * | `DELETE /reset/user/:userId` | efface les rôles et le profil global d'un membre, PARTOUT (sans corps) |
 *
 * Aucune de ces routes ne déclare de corps pour ses DELETE : aucun ne part.
 */
export const agentConfigQueryKey = (conversationId: string) => [...AGENT_ROOT_KEY, 'config', conversationId] as const;
export const agentSummaryQueryKey = (conversationId: string) => [...AGENT_ROOT_KEY, 'summary', conversationId] as const;
export const agentScheduleQueryKey = (conversationId: string) => [...AGENT_ROOT_KEY, 'schedule', conversationId] as const;
export const agentRolesQueryKey = (conversationId: string) => [...AGENT_ROOT_KEY, 'roles', conversationId] as const;
export const agentMessagesQueryKey = (conversationId: string, page: number) => [...AGENT_ROOT_KEY, 'messages', conversationId, page] as const;
export const agentArchetypesQueryKey = () => [...AGENT_ROOT_KEY, 'archetypes'] as const;

/** Les rôles d'une conversation tiennent sous le plafond de la passerelle (`maxControlledUsers ≤ 50`). */
export const AGENT_ROLES_LIMIT = 50;
export const AGENT_MESSAGES_LIMIT = 20;

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

// ---------------------------------------------------------------------------
// Les réglages
// ---------------------------------------------------------------------------

export type AgentConversationConfig = {
  readonly fields: AgentServed;
  readonly controlledUsersCount: number;
  readonly updatedAt: string | null;
};

const decodeConfig = (raw: unknown): AgentConversationConfig => {
  const charge = asRecord(raw) ?? {};
  return {
    fields: pickServed(AGENT_CONFIG_FIELDS, charge),
    controlledUsersCount: (Array.isArray(charge.controlledUserIds) ? charge.controlledUserIds : []).length,
    updatedAt: asTextOrNull(charge.updatedAt),
  };
};

/** Un 404 se rend `null` : la conversation est suivie sans configuration — un état, pas une panne. */
export async function loadAgentConfig(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentConversationConfig | null>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentConfigsByConversationId(params.conversationId),
    ...withSignal(params.signal),
  });
  if (!resultat.ok) return resultat.status === 404 ? { ok: true, data: null } : resultat;
  return { ok: true, data: decodeConfig(resultat.data) };
}

export async function saveAgentConfig(
  params: AdminDeps & { readonly conversationId: string; readonly changes: Readonly<Record<string, unknown>> },
): Promise<ApiResult<AgentConversationConfig>> {
  const resultat = await params.transport.request<unknown>({
    method: 'PUT',
    path: adminEndpoints.agentConfigsByConversationId(params.conversationId),
    body: params.changes,
  });
  if (!resultat.ok) return resultat;
  return { ok: true, data: decodeConfig(resultat.data) };
}

export async function deleteAgentConfig(params: AdminDeps & { readonly conversationId: string }): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.agentConfigsByConversationId(params.conversationId),
  });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

// ---------------------------------------------------------------------------
// Le résumé et le planning
// ---------------------------------------------------------------------------

export type AgentConversationSummary = {
  readonly summary: string;
  readonly currentTopics: readonly string[];
  readonly overallTone: string | null;
  readonly messageCount: number;
  /** Sur 100, `null` quand l'agent ne l'a pas mesuré. */
  readonly healthScore: number | null;
  readonly updatedAt: string | null;
};

const textList = (value: unknown): readonly string[] =>
  (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');

export async function loadAgentSummary(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentConversationSummary | null>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentConfigsByConversationIdSummary(params.conversationId),
    ...withSignal(params.signal),
  });
  if (!resultat.ok) return resultat.status === 404 ? { ok: true, data: null } : resultat;
  const charge = asRecord(resultat.data) ?? {};
  return {
    ok: true,
    data: {
      summary: asText(charge.summary),
      currentTopics: textList(charge.currentTopics),
      overallTone: asTextOrNull(charge.overallTone),
      messageCount: asCount(charge.messageCount),
      healthScore: typeof charge.healthScore === 'number' && Number.isFinite(charge.healthScore) ? charge.healthScore : null,
      updatedAt: asTextOrNull(charge.updatedAt),
    },
  };
}

export type AgentSchedule = {
  readonly scanIntervalMinutes: number;
  /** Instants en millisecondes, convertis en ISO pour la bibliothèque d'interprétation ; `null` quand jamais. */
  readonly lastScanAt: string | null;
  readonly nextScanAt: string | null;
  readonly upcomingCount: number;
  readonly messagesUsed: number;
  readonly messagesMax: number;
  readonly isWeekend: boolean;
  readonly burstEnabled: boolean;
  readonly burstCooldownEndsAt: string | null;
};

const isoOfMs = (value: unknown): string | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? new Date(value).toISOString() : null;

export async function loadAgentSchedule(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AgentSchedule | null>> {
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.agentConfigsByConversationIdSchedule(params.conversationId),
    ...withSignal(params.signal),
  });
  if (!resultat.ok) return resultat.status === 404 ? { ok: true, data: null } : resultat;
  const charge = asRecord(resultat.data) ?? {};
  const budget = asRecord(charge.budget) ?? {};
  const burst = asRecord(charge.burst) ?? {};
  return {
    ok: true,
    data: {
      scanIntervalMinutes: asCount(charge.scanIntervalMinutes),
      lastScanAt: isoOfMs(charge.lastScan),
      nextScanAt: isoOfMs(charge.nextScan),
      upcomingCount: (Array.isArray(charge.upcomingScans) ? charge.upcomingScans : []).length,
      messagesUsed: asCount(budget.messagesUsed),
      messagesMax: asCount(budget.messagesMax),
      isWeekend: budget.isWeekend === true,
      burstEnabled: burst.enabled === true,
      burstCooldownEndsAt: burst.cooldownActive === true ? isoOfMs(burst.cooldownEndsAt) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Les rôles et les archétypes
// ---------------------------------------------------------------------------

export type AgentRole = {
  readonly userId: string;
  /** `observed` (appris de ses messages) ou `archetype` (posé) ; autre chose se dit « non reconnu ». */
  readonly origin: string;
  readonly archetypeId: string | null;
  /** Ratio 0–1. */
  readonly confidence: number;
  readonly locked: boolean;
  readonly messagesAnalyzed: number;
};

function decodeRole(raw: unknown): AgentRole | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.userId !== 'string' || ligne.userId === '') return null;
  return {
    userId: ligne.userId,
    origin: asText(ligne.origin),
    archetypeId: asTextOrNull(ligne.archetypeId),
    confidence: typeof ligne.confidence === 'number' && Number.isFinite(ligne.confidence) ? Math.max(0, Math.min(1, ligne.confidence)) : 0,
    locked: ligne.locked === true,
    messagesAnalyzed: asCount(ligne.messagesAnalyzed),
  };
}

export async function loadAgentRoles(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AgentRole>>> {
  const query = new URLSearchParams({ offset: '0', limit: String(AGENT_ROLES_LIMIT) });
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentConfigsByConversationIdRoles(params.conversationId)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  return adminPageOf(resultat, decodeRole, { kind: 'top' });
}

export type AgentArchetype = { readonly id: string; readonly name: string };

export async function loadAgentArchetypes(
  params: AdminDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly AgentArchetype[]>> {
  const resultat = await params.transport.request<unknown>({ method: 'GET', path: adminEndpoints.agentArchetypes, ...withSignal(params.signal) });
  if (!resultat.ok) return resultat;
  const rows = (Array.isArray(resultat.data) ? resultat.data : []).flatMap((raw): AgentArchetype[] => {
    const ligne = asRecord(raw);
    return ligne !== null && typeof ligne.id === 'string' && ligne.id !== '' ? [{ id: ligne.id, name: asText(ligne.name) }] : [];
  });
  return { ok: true, data: rows };
}

export async function assignAgentArchetype(
  params: AdminDeps & { readonly conversationId: string; readonly userId: string; readonly archetypeId: string },
): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.agentRolesByConversationIdByUserIdAssign(params.conversationId, params.userId),
    body: { archetypeId: params.archetypeId },
  });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

export async function unlockAgentRole(
  params: AdminDeps & { readonly conversationId: string; readonly userId: string },
): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.agentRolesByConversationIdByUserIdUnlock(params.conversationId, params.userId),
  });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

// ---------------------------------------------------------------------------
// Les messages publiés par l'agent
// ---------------------------------------------------------------------------

export type AgentPublishedMessage = {
  readonly id: string;
  readonly content: string;
  readonly createdAt: string | null;
  readonly senderName: string | null;
  readonly senderUsername: string | null;
  readonly language: string | null;
};

function decodeMessage(raw: unknown): AgentPublishedMessage | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;
  const sender = asRecord(ligne.sender) ?? {};
  return {
    id: ligne.id,
    content: asText(ligne.content),
    createdAt: asTextOrNull(ligne.createdAt),
    senderName: asTextOrNull(sender.displayName),
    senderUsername: asTextOrNull(asRecord(sender.user)?.username),
    language: asTextOrNull(ligne.originalLanguage),
  };
}

export async function loadAgentMessages(
  params: AdminDeps & { readonly conversationId: string; readonly page: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminPage<AgentPublishedMessage> | null>> {
  const query = new URLSearchParams({ page: String(params.page), limit: String(AGENT_MESSAGES_LIMIT) });
  const resultat = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.agentConfigsByConversationIdMessages(params.conversationId)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!resultat.ok && resultat.status === 404) return { ok: true, data: null };
  return adminPageOf(resultat, decodeMessage, { kind: 'page-based' });
}

// ---------------------------------------------------------------------------
// Les remises à zéro ciblées
// ---------------------------------------------------------------------------

export async function resetAgentConversation(
  params: AdminDeps & { readonly conversationId: string },
): Promise<ApiResult<AgentResetCounts>> {
  const resultat = await params.transport.request<unknown>({
    method: 'DELETE',
    path: adminEndpoints.agentResetConversationByConversationId(params.conversationId),
  });
  return resultat.ok ? { ok: true, data: decodeResetCounts(resultat.data) } : resultat;
}

export async function resetAgentUser(params: AdminDeps & { readonly userId: string }): Promise<ApiResult<AgentResetCounts>> {
  const resultat = await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.agentResetUserByUserId(params.userId) });
  return resultat.ok ? { ok: true, data: decodeResetCounts(resultat.data) } : resultat;
}
