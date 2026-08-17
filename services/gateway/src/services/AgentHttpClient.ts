type AgentApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      });

      const body = await response.json() as AgentApiResponse<T>;

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
}

/** Forme exacte rendue par `services/agent/src/routes/reading.ts` (G-126). */
export type RangeSummaryResponse = {
  conversationId: string;
  summary: string;
  fromMessageId: string;
  toMessageId: string;
  messageCount: number;
};
