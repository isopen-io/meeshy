import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DE L'ANALYSE DE CONVERSATION (#5695, étape 12) — sur le motif
 * exact de `engagement.ts:31-66`. `GET /api/v1/conversations/:id/analysis`
 * (`services/gateway/src/routes/conversations/core-detail.ts:531-676`) :
 * `requiredAuth` (l.550), 404 `Conversation not found` (l.557-559), 403
 * `Access denied` (l.562-564), 500 (l.672-675), `sendSuccess(reply, {
 * conversationId, summary: { text, … } | null, participantProfiles,
 * history })` (l.648-671) — `error` est une CHAÎNE PLATE
 * (`utils/response.ts`).
 *
 * TYPE LOCAL MINIMAL (§9 question 5) : `packages/shared` n'a pas de type
 * pour cette route (`grep -rn "participantProfiles" packages/shared/types` =
 * 0) — `ConversationAnalysis` ne garde que `conversationId` et
 * `summary.text`, le reste de la charge (`participantProfiles`, `history`,
 * `currentTopics`, …) est IGNORÉ, jamais cru. Issue compagnon
 * `packages/shared` pour porter ce type au domaine — jamais un patch
 * serveur.
 *
 * Le texte de l'agent est HORS PRISME (aucune langue en base,
 * `schema.prisma:4112-4133`) : rendu tel quel, `lang` ABSENT côté composant
 * (langue inconnue).
 */

export type ConversationAnalysisSummary = { readonly text: string };

export type ConversationAnalysis = {
  readonly conversationId: string;
  readonly summary: ConversationAnalysisSummary | null;
};

export const CONVERSATION_ANALYSIS_PATH = (conversationId: string): string =>
  `/api/v1/conversations/${conversationId}/analysis`;

/**
 * Rend la charge PROJETÉE (`conversationId`, `summary.text`) quand la forme
 * est conforme, `null` sinon — jamais l'objet REÇU tel quel : `history`,
 * `participantProfiles`, `currentTopics`… ne traversent pas cette
 * frontière, même doctrine de projection que `session.ts` (« une protection
 * se mesure sur tout ce que la charge TRANSPORTE »).
 */
function projectConversationAnalysisPayload(value: unknown): ConversationAnalysis | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.conversationId !== 'string') return null;
  if (record.summary === null) return { conversationId: record.conversationId, summary: null };
  if (typeof record.summary !== 'object' || record.summary === null) return null;
  const text = (record.summary as Record<string, unknown>).text;
  if (typeof text !== 'string') return null;
  return { conversationId: record.conversationId, summary: { text } };
}

export async function fetchConversationAnalysis(
  transport: HttpTransport,
  conversationId: string,
  signal?: AbortSignal,
): Promise<ApiResult<ConversationAnalysis>> {
  const result = await transport.request<unknown>({
    method: 'GET',
    path: CONVERSATION_ANALYSIS_PATH(conversationId),
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!result.ok) return result;
  const projected = projectConversationAnalysisPayload(result.data);
  if (projected === null) {
    return {
      ok: false,
      status: 502,
      error: "L'analyse servie est illisible — forme inattendue",
      code: 'MALFORMED_PAYLOAD',
    };
  }
  return { ok: true, data: projected };
}

/**
 * `'fixtures'` ⇒ `summary: null` SANS appel réseau — le no-op silencieux
 * qu'iOS sert à un invité (`analysisProvider: nil`), transposé à la source
 * de données de la v3.1 : aucun panneau agent tant que le POC de fixtures
 * sert le fil.
 */
export async function loadConversationAnalysis(params: {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly conversationId: string;
  readonly signal?: AbortSignal;
}): Promise<ApiResult<ConversationAnalysis>> {
  if (params.source === 'fixtures') {
    return { ok: true, data: { conversationId: params.conversationId, summary: null } };
  }
  return fetchConversationAnalysis(params.transport, params.conversationId, params.signal);
}
