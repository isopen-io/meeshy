import Redis from 'ioredis';
import type { MessageEntry, ToneProfile, AgentHistoryEntry } from '../graph/state';

function safeParse<T>(data: string, fallback: T, label: string): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    console.error(`[RedisState] Corrupted ${label} data, returning fallback`);
    return fallback;
  }
}

export class RedisStateManager {
  constructor(private redis: Redis) {}

  private key(conversationId: string, suffix: string): string {
    return `agent:${suffix}:${conversationId}`;
  }

  async getMessages(conversationId: string): Promise<MessageEntry[]> {
    const data = await this.redis.get(this.key(conversationId, 'messages'));
    if (!data) return [];
    return safeParse<MessageEntry[]>(data, [], `messages:${conversationId}`);
  }

  async setMessages(conversationId: string, messages: MessageEntry[]): Promise<void> {
    await this.redis.set(this.key(conversationId, 'messages'), JSON.stringify(messages), 'EX', 3600);
  }

  async getSummary(conversationId: string): Promise<string> {
    return (await this.redis.get(this.key(conversationId, 'summary'))) ?? '';
  }

  async setSummary(conversationId: string, summary: string): Promise<void> {
    await this.redis.set(this.key(conversationId, 'summary'), summary, 'EX', 3600);
  }

  async getToneProfiles(conversationId: string): Promise<Record<string, ToneProfile>> {
    const data = await this.redis.get(this.key(conversationId, 'profiles'));
    if (!data) return {};
    return safeParse<Record<string, ToneProfile>>(data, {}, `profiles:${conversationId}`);
  }

  async setToneProfiles(conversationId: string, profiles: Record<string, ToneProfile>): Promise<void> {
    await this.redis.set(this.key(conversationId, 'profiles'), JSON.stringify(profiles), 'EX', 3600);
  }

  async setCooldown(conversationId: string, userId: string, seconds: number): Promise<void> {
    await this.redis.set(`agent:cooldown:${conversationId}:${userId}`, '1', 'EX', seconds);
  }

  async isOnCooldown(conversationId: string, userId: string): Promise<boolean> {
    return (await this.redis.exists(`agent:cooldown:${conversationId}:${userId}`)) === 1;
  }

  async getAgentHistory(conversationId: string): Promise<AgentHistoryEntry[]> {
    const data = await this.redis.get(this.key(conversationId, 'history'));
    if (!data) return [];
    return safeParse<AgentHistoryEntry[]>(data, [], `history:${conversationId}`);
  }

  async setAgentHistory(conversationId: string, history: AgentHistoryEntry[]): Promise<void> {
    const trimmed = history.slice(-100);
    await this.redis.set(this.key(conversationId, 'history'), JSON.stringify(trimmed), 'EX', 259200);
  }

  async getTodayActiveUserIds(conversationId: string): Promise<string[]> {
    const date = new Date().toISOString().slice(0, 10);
    const key = `agent:budget:${conversationId}:${date}:users`;
    return this.redis.smembers(key);
  }

  async getLastAgentUserId(conversationId: string): Promise<string | null> {
    return this.redis.get(`agent:last-user:${conversationId}`);
  }

  async setLastAgentUserId(conversationId: string, userId: string): Promise<void> {
    await this.redis.set(`agent:last-user:${conversationId}`, userId, 'EX', 86400);
  }
}
