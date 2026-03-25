import type Redis from 'ioredis';

const BUDGET_PREFIX = 'agent:budget:';
const BUDGET_TTL = 172800;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isWeekend(): boolean {
  const day = new Date().getUTCDay();
  return day === 0 || day === 6;
}

type BudgetLimits = {
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
};

type UserLimits = {
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
};

type BurstLimits = {
  quietIntervalMinutes: number;
};

type GlobalConvLimits = {
  weekdayMaxConversations: number;
  weekendMaxConversations: number;
};

export class DailyBudgetManager {
  constructor(private redis: Redis) {}

  async canSendMessage(conversationId: string, limits: BudgetLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:${todayKey()}`;
    const current = parseInt((await this.redis.get(key)) ?? '0', 10);
    const max = isWeekend() ? limits.weekendMaxMessages : limits.weekdayMaxMessages;
    const remaining = Math.max(0, max - current);
    return { allowed: current < max, remaining, current, max };
  }

  async canAddUser(conversationId: string, limits: UserLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:${todayKey()}:users`;
    const current = await this.redis.scard(key);
    const max = isWeekend() ? limits.weekendMaxUsers : limits.weekdayMaxUsers;
    return { allowed: current < max, current, max };
  }

  async canBurst(conversationId: string, limits: BurstLimits) {
    const key = `${BUDGET_PREFIX}${conversationId}:last-burst`;
    const lastBurst = parseInt((await this.redis.get(key)) ?? '0', 10);
    const elapsed = Date.now() - lastBurst;
    const cooldownMs = limits.quietIntervalMinutes * 60 * 1000;
    const minutesUntilNext = Math.max(0, Math.ceil((cooldownMs - elapsed) / 60000));
    return { allowed: elapsed >= cooldownMs, minutesUntilNext };
  }

  async recordMessage(conversationId: string, userId: string) {
    const date = todayKey();
    const counterKey = `${BUDGET_PREFIX}${conversationId}:${date}`;
    const usersKey = `${BUDGET_PREFIX}${conversationId}:${date}:users`;
    await Promise.all([
      this.redis.incr(counterKey),
      this.redis.expire(counterKey, BUDGET_TTL),
      this.redis.sadd(usersKey, userId),
      this.redis.expire(usersKey, BUDGET_TTL),
    ]);
  }

  async recordBurst(conversationId: string) {
    const key = `${BUDGET_PREFIX}${conversationId}:last-burst`;
    await this.redis.set(key, String(Date.now()), 'EX', BUDGET_TTL);
  }

  async canScanConversation(limits: GlobalConvLimits) {
    const key = `${BUDGET_PREFIX}global:scanned-convs:${todayKey()}`;
    const current = parseInt((await this.redis.get(key)) ?? '0', 10);
    const max = isWeekend() ? limits.weekendMaxConversations : limits.weekdayMaxConversations;
    return { allowed: current < max, current, max };
  }

  async recordScannedConversation() {
    const key = `${BUDGET_PREFIX}global:scanned-convs:${todayKey()}`;
    await Promise.all([
      this.redis.incr(key),
      this.redis.expire(key, BUDGET_TTL),
    ]);
  }

  async getTodayStats(conversationId: string) {
    const date = todayKey();
    const [messageCount, userCount] = await Promise.all([
      this.redis.get(`${BUDGET_PREFIX}${conversationId}:${date}`),
      this.redis.scard(`${BUDGET_PREFIX}${conversationId}:${date}:users`),
    ]);
    return {
      messagesUsed: parseInt(messageCount ?? '0', 10),
      usersActive: userCount,
      isWeekend: isWeekend(),
    };
  }
}
