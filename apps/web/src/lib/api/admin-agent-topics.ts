import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { AGENT_ROOT_KEY, asTextOrNull } from './admin-agent';
import type { ApiResult } from './http';

/**
 * **LES SUJETS ET LA FILE DE LIVRAISON** (lot Agent complet) — ce que l'agent
 * peut aborder, et ce qu'il s'apprête à publier.
 *
 * | adresse | ce qu'elle fait |
 * |---|---|
 * | `GET /topics?active=all` | le catalogue des sujets, actifs ou non |
 * | `GET /topics/:id` | un sujet en entier (gabarits, exemples) |
 * | `POST /topics` | en crée un |
 * | `PATCH /topics/:id` | en réécrit les champs ENVOYÉS (`submittedKeysOnly` côté passerelle) |
 * | `DELETE /topics/:id` | le DÉSACTIVE ; `?hard=true` le supprime |
 * | `POST /topics/:id/test` | essaie un texte contre ses motifs (`{ sampleText }`) |
 * | `GET /delivery-queue` | les messages et réactions en attente de publication |
 * | `PATCH /delivery-queue/:id` | réécrit le TEXTE d'un message en attente (`{ content }`) — la route ne reprogramme pas |
 * | `DELETE /delivery-queue/:id` | l'annule (sans corps) |
 *
 * ## Un motif dangereux est refusé EN LE NOMMANT
 *
 * `certifyPatterns` (passerelle) refuse en 400 un motif à retour arrière
 * catastrophique, et son message dit lequel et pourquoi
 * (« keywordPatterns: motif refusé — (a+)+$ → [NESTED_QUANTIFIER] … »).
 * L'échec est rendu TEL QUEL (`ApiFailure.error`) : l'écran l'affiche sous le
 * formulaire, au lieu d'un « échec » qui ferait deviner lequel des dix motifs.
 */
export const agentTopicsQueryKey = () => [...AGENT_ROOT_KEY, 'topics'] as const;
export const agentTopicQueryKey = (id: string) => [...AGENT_ROOT_KEY, 'topic', id] as const;
export const agentQueueQueryKey = () => [...AGENT_ROOT_KEY, 'delivery-queue'] as const;

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

const textList = (value: unknown): readonly string[] =>
  (Array.isArray(value) ? value : []).filter((entry): entry is string => typeof entry === 'string');

export type AgentTopic = {
  readonly id: string;
  readonly slug: string;
  readonly label: string;
  readonly description: string | null;
  readonly keywordPatterns: readonly string[];
  readonly instructionTemplate: string;
  readonly searchHintTemplate: string;
  readonly examples: readonly string[];
  readonly cooldownMinutes: number;
  readonly priority: number;
  readonly isActive: boolean;
};

function decodeTopic(raw: unknown): AgentTopic | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;
  return {
    id: ligne.id,
    slug: asText(ligne.slug),
    label: asText(ligne.label),
    description: asTextOrNull(ligne.description),
    keywordPatterns: textList(ligne.keywordPatterns),
    instructionTemplate: asText(ligne.instructionTemplate),
    searchHintTemplate: asText(ligne.searchHintTemplate),
    examples: textList(ligne.examples),
    cooldownMinutes: asCount(ligne.cooldownMinutes),
    priority: asCount(ligne.priority),
    isActive: ligne.isActive !== false,
  };
}

export async function loadAgentTopics(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly AgentTopic[]>> {
  const resultat = await params.transport.request<unknown>({ method: 'GET', path: `${adminEndpoints.agentTopics}?active=all`, ...withSignal(params.signal) });
  if (!resultat.ok) return resultat;
  return { ok: true, data: (Array.isArray(resultat.data) ? resultat.data : []).map(decodeTopic).filter((topic): topic is AgentTopic => topic !== null) };
}

export async function loadAgentTopic(params: AdminDeps & { readonly id: string; readonly signal?: AbortSignal }): Promise<ApiResult<AgentTopic>> {
  const resultat = await params.transport.request<unknown>({ method: 'GET', path: adminEndpoints.agentTopicsById(params.id), ...withSignal(params.signal) });
  if (!resultat.ok) return resultat;
  const topic = decodeTopic(resultat.data);
  return topic === null ? { ok: false, status: 0, error: 'sujet illisible' } : { ok: true, data: topic };
}

/** Le corps d'écriture d'un sujet — tous ses champs à la création, les seuls changés à l'édition. */
export type AgentTopicInput = {
  readonly slug: string;
  readonly label: string;
  readonly description: string | null;
  readonly keywordPatterns: readonly string[];
  readonly instructionTemplate: string;
  readonly searchHintTemplate: string;
  readonly examples: readonly string[];
  readonly cooldownMinutes: number;
  readonly priority: number;
  readonly isActive: boolean;
};

export async function createAgentTopic(params: AdminDeps & { readonly input: AgentTopicInput }): Promise<ApiResult<AgentTopic>> {
  const resultat = await params.transport.request<unknown>({ method: 'POST', path: adminEndpoints.agentTopics, body: params.input });
  if (!resultat.ok) return resultat;
  const topic = decodeTopic(resultat.data);
  return topic === null ? { ok: false, status: 0, error: 'sujet illisible' } : { ok: true, data: topic };
}

export async function updateAgentTopic(
  params: AdminDeps & { readonly id: string; readonly changes: Partial<AgentTopicInput> },
): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({ method: 'PATCH', path: adminEndpoints.agentTopicsById(params.id), body: params.changes });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

/** `hard` : supprimé ; sinon désactivé (la passerelle garde la ligne, `isActive: false`). */
export async function deleteAgentTopic(params: AdminDeps & { readonly id: string; readonly hard: boolean }): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({
    method: 'DELETE',
    path: params.hard ? `${adminEndpoints.agentTopicsById(params.id)}?hard=true` : adminEndpoints.agentTopicsById(params.id),
  });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

export type AgentTopicTest = {
  /** Motif → occurrences ; `-1` quand le motif n'a pas pu être évalué (voir `refused`). */
  readonly matches: readonly { readonly pattern: string; readonly count: number }[];
  readonly refused: readonly { readonly pattern: string; readonly message: string }[];
};

export async function testAgentTopic(
  params: AdminDeps & { readonly id: string; readonly sampleText: string },
): Promise<ApiResult<AgentTopicTest>> {
  const resultat = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.agentTopicsByIdTest(params.id),
    body: { sampleText: params.sampleText },
  });
  if (!resultat.ok) return resultat;
  const charge = asRecord(resultat.data) ?? {};
  const matches = Object.entries(asRecord(charge.matches) ?? {}).map(([pattern, count]) => ({
    pattern,
    count: typeof count === 'number' && Number.isFinite(count) ? count : -1,
  }));
  const refused = (Array.isArray(charge.refused) ? charge.refused : []).flatMap((raw) => {
    const ligne = asRecord(raw);
    return ligne === null ? [] : [{ pattern: asText(ligne.pattern), message: asText(ligne.message) }];
  });
  return { ok: true, data: { matches, refused } };
}

// ---------------------------------------------------------------------------
// La file de livraison
// ---------------------------------------------------------------------------

export type AgentQueueItem = {
  readonly id: string;
  readonly conversationId: string;
  readonly kind: 'message' | 'reaction';
  readonly asUserId: string;
  /** Le texte d'un message ; l'émoji d'une réaction. */
  readonly content: string;
  readonly scheduledAt: string | null;
  readonly mergeCount: number;
  /** La conversation nommée — `null` quand la passerelle ne la sert pas (serveur d'avant, ou conversation disparue). */
  readonly conversation: AgentQueueConversation | null;
  /** Le membre au nom duquel l'agent publie — `null` dans les mêmes cas. */
  readonly persona: AgentQueuePersona | null;
};

export type AgentQueueParticipant = { readonly displayName: string | null; readonly username: string | null };
/** `title` null : une conversation sans titre, nommée par l'aperçu de ses membres (trois au plus) et leur `total`. */
export type AgentQueueConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly participants: readonly AgentQueueParticipant[];
  readonly total: number | null;
};

const QUEUE_PARTICIPANTS_MAX = 3;

function decodeQueueParticipants(raw: unknown): readonly AgentQueueParticipant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const charge = asRecord(entry);
      if (charge === null) return null;
      const person = { displayName: nonEmptyOrNull(charge.displayName), username: nonEmptyOrNull(charge.username) };
      return person.displayName === null && person.username === null ? null : person;
    })
    .filter((person): person is AgentQueueParticipant => person !== null)
    .slice(0, QUEUE_PARTICIPANTS_MAX);
}
export type AgentQueuePersona = { readonly id: string; readonly username: string; readonly displayName: string | null };

const nonEmptyOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** Facultatif : un serveur d'avant ne sert ni `conversation` ni `persona` — l'écran retombe alors sur l'identifiant seul. */
function decodeQueueConversation(raw: unknown): AgentQueueConversation | null {
  const charge = asRecord(raw);
  const id = nonEmptyOrNull(charge?.id);
  if (charge === null || id === null) return null;
  const total = typeof charge.total === 'number' && Number.isInteger(charge.total) && charge.total >= 0 ? charge.total : null;
  return { id, title: nonEmptyOrNull(charge.title), participants: decodeQueueParticipants(charge.participants), total };
}

function decodeQueuePersona(raw: unknown): AgentQueuePersona | null {
  const charge = asRecord(raw);
  const id = nonEmptyOrNull(charge?.id);
  const username = nonEmptyOrNull(charge?.username);
  return charge === null || id === null || username === null ? null : { id, username, displayName: nonEmptyOrNull(charge.displayName) };
}

function decodeQueueItem(raw: unknown): AgentQueueItem | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;
  const action = asRecord(ligne.action) ?? {};
  const kind = action.type === 'reaction' ? 'reaction' : action.type === 'message' ? 'message' : null;
  if (kind === null) return null;
  return {
    id: ligne.id,
    conversationId: asText(ligne.conversationId),
    kind,
    asUserId: asText(action.asUserId),
    content: kind === 'message' ? asText(action.content) : asText(action.emoji),
    scheduledAt:
      typeof ligne.scheduledAt === 'number' && Number.isFinite(ligne.scheduledAt) ? new Date(ligne.scheduledAt).toISOString() : null,
    mergeCount: asCount(ligne.mergeCount),
    conversation: decodeQueueConversation(ligne.conversation),
    persona: decodeQueuePersona(ligne.persona),
  };
}

export async function loadAgentQueue(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<readonly AgentQueueItem[]>> {
  const resultat = await params.transport.request<unknown>({ method: 'GET', path: adminEndpoints.agentDeliveryQueue, ...withSignal(params.signal) });
  if (!resultat.ok) return resultat;
  return {
    ok: true,
    data: (Array.isArray(resultat.data) ? resultat.data : []).map(decodeQueueItem).filter((item): item is AgentQueueItem => item !== null),
  };
}

export async function editAgentQueueItem(params: AdminDeps & { readonly id: string; readonly content: string }): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({
    method: 'PATCH',
    path: adminEndpoints.agentDeliveryQueueById(params.id),
    body: { content: params.content },
  });
  return resultat.ok ? { ok: true, data: true } : resultat;
}

export async function cancelAgentQueueItem(params: AdminDeps & { readonly id: string }): Promise<ApiResult<true>> {
  const resultat = await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.agentDeliveryQueueById(params.id) });
  return resultat.ok ? { ok: true, data: true } : resultat;
}
