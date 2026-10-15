import { guardedTimeout } from '../utils/guarded-timer';
import { enhancedLogger } from '../utils/logger-enhanced';

type AgentApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

/** L'en-tête du secret interne passerelle → agent (`services/agent/src/routes/internal-auth.ts`). */
export const AGENT_INTERNAL_TOKEN_HEADER = 'x-meeshy-internal-token';

/** Le même minimum que l'agent (`INTERNAL_TOKEN_MIN_LENGTH`) : plus court, il refuserait tout. */
export const AGENT_INTERNAL_TOKEN_MIN_LENGTH = 32;

/**
 * #10242 — le secret interne que l'agent exige sur toute route sauf /health
 * (`services/agent/src/routes/internal-guard.ts`). Lu à chaque appel : absent ou trop court, rien ne part.
 */
export function agentInternalToken(): string | null {
  const token = (process.env.AGENT_INTERNAL_TOKEN ?? '').trim();
  return token.length >= AGENT_INTERNAL_TOKEN_MIN_LENGTH ? token : null;
}

/** Le signal de démarrage : la passerelle peut-elle joindre l'agent ? (journalisé une fois par `server.ts`). */
export const agentInternalTokenConfigured = (): boolean => agentInternalToken() !== null;

export class AgentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentUnavailableError';
  }
}

export class AgentHttpClient {
  constructor(private baseUrl: string) {}

  private async request<T>(path: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
    const { timeoutMs = 5000, ...fetchOptions } = options;
    const token = agentInternalToken();
    if (token === null) throw new AgentUnavailableError('AGENT_INTERNAL_TOKEN is not configured on the gateway');
    const controller = new AbortController();
    const timeout = guardedTimeout({ name: 'agent-http-timeout', afterMs: timeoutMs, logger: enhancedLogger, run: () => controller.abort() });

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
          [AGENT_INTERNAL_TOKEN_HEADER]: token,
        },
      });

      const body = await response.json() as AgentApiResponse<T>;

      // Un refus du secret interne est une panne de CONFIGURATION entre services, pas un refus de
      // l'utilisateur : relayé en 401, il déconnecterait l'administrateur.
      if (response.status === 401 || (response.status === 503 && body?.message === 'internal-auth-not-configured')) {
        throw new AgentUnavailableError(`Agent refused the internal token (${response.status})`);
      }

      if (!response.ok) {
        const err = new Error(body.message ?? `Agent responded with ${response.status}`);
        (err as Error & { statusCode: number }).statusCode = response.status;
        throw err;
      }

      return body.data as T;
    } catch (error) {
      if (error instanceof TypeError || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new AgentUnavailableError('Agent service is unreachable');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getQueue(conversationId?: string): Promise<unknown[]> {
    const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    return this.request<unknown[]>(`/api/agent/delivery-queue${query}`);
  }

  async deleteQueueItem(id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/api/agent/delivery-queue/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  async editQueueItem(id: string, content: string): Promise<unknown> {
    return this.request<unknown>(`/api/agent/delivery-queue/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });
  }

  async stopScan(conversationId: string): Promise<void> {
    return this.request<void>(`/api/agent/config/${encodeURIComponent(conversationId)}/stop`, {
      method: 'POST',
    });
  }

  async invalidateCache(payload: { conversationId?: string; global?: boolean }): Promise<{ invalidated: unknown }> {
    return this.request<{ invalidated: unknown }>(`/api/agent/cache/invalidate`, {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 1500,
    });
  }

  /**
   * G-127 — le débouché de lecture G-126 (`GET
   * /api/agent/conversations/:id/range-summary`). Même posture bornée que
   * `invalidateCache` : timeout court (1500 ms), le pont ✦ est un confort,
   * jamais un risque de latence pour la liste. `data: null` de la route
   * (agent muet, plage introuvable, modèle en panne) ressort ici comme
   * `null` — ce client ne fabrique jamais de résumé, il relaie l'absence.
   */
  async getRangeSummary(params: {
    conversationId: string;
    fromMessageId: string;
    toMessageId: string;
  }): Promise<RangeSummaryResponse | null> {
    const query = `?fromMessageId=${encodeURIComponent(params.fromMessageId)}&toMessageId=${encodeURIComponent(params.toMessageId)}`;
    return this.request<RangeSummaryResponse | null>(
      `/api/agent/conversations/${encodeURIComponent(params.conversationId)}/range-summary${query}`,
      { timeoutMs: 1500 }
    );
  }

  /**
   * Une PROPOSITION de saison (#10016) : thème, points d'étape, textes en sept langues. Le service d'agent ne
   * publie rien ; la passerelle revalide la sortie par la loi et la garde EN ATTENTE d'une validation humaine.
   */
  async proposeSeason(input: {
    readonly number: number;
    readonly startDay: string;
    readonly themeKey: string;
    readonly previousThemes: readonly string[];
    readonly brief: string | null;
  }): Promise<{ themeKey: unknown; stepPoints: unknown; copy: unknown; model?: unknown }> {
    return this.request('/api/agent/game/season-proposal', { method: 'POST', body: JSON.stringify(input), timeoutMs: 90_000 });
  }
}

/** Forme exacte rendue par `services/agent/src/routes/reading.ts` (G-126). */
export type RangeSummaryResponse = {
  conversationId: string;
  summary: string;
  fromMessageId: string;
  toMessageId: string;
  messageCount: number;
};
