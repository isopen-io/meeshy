import Redis from 'ioredis';
import type { MessageEntry, ToneProfile } from '../graph/state';

export class RedisStateManager {
  constructor(private redis: Redis) {}

  private key(conversationId: string, suffix: string): string {
    return `agent:${suffix}:${conversationId}`;
  }

  async getMessages(conversationId: string): Promise<MessageEntry[]> {
    const data = await this.redis.get(this.key(conversationId, 'messages'));
    return data ? JSON.parse(data) : [];
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
    return data ? JSON.parse(data) : {};
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
}
