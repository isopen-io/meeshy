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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
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
}
