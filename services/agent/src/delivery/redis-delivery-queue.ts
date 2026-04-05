import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { PendingAction, PendingMessage, PendingReaction } from '../graph/state';
import type { AgentResponse, AgentReaction } from '../zmq/types';
import type { ZmqAgentPublisher } from '../zmq/zmq-publisher';
import type { MongoPersistence } from '../memory/mongo-persistence';
import type { RedisStateManager } from '../memory/redis-state';

const SORTED_SET_KEY = 'agent:delivery:pending';
const ITEM_PREFIX = 'agent:delivery:item:';
const USER_INDEX_PREFIX = 'agent:delivery:user:';
const ITEM_TTL_SECONDS = 48 * 3600;

export type RedisDeliveryItem = {
  id: string;
  action: PendingAction;
  conversationId: string;
  scheduledAt: number;
  mergeCount: number;
  mergedTopics?: string[];
};

export type SerializedDeliveryItem = {
  id: string;
  conversationId: string;
  scheduledAt: number;
  remainingMs: number;
  action: PendingAction;
  mergeCount: number;
};

function randomCooldownSeconds(): number {
  const base = 240 + Math.random() * 180;
  return Math.round(base + base * (Math.random() * 0.3 - 0.15));
}

function conversationGap(action: PendingAction): number {
  if (action.type !== 'message') return 0;
  const wordCount = action.content?.split(/\s+/).length ?? 0;
  if (wordCount <= 4) return 10_000;
  if (wordCount <= 15) return 15_000;
  if (wordCount <= 35) return 30_000;
  if (wordCount <= 65) return 90_000;
  if (wordCount <= 105) return 120_000;
  return 330_000;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type RedisDeliveryConfig = {
  maxMessagesPerUserPer10Min: number;
};

export class RedisDeliveryQueue {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private redis: Redis,
    private publisher: ZmqAgentPublisher,
    private persistence: MongoPersistence,
    private config: RedisDeliveryConfig = { maxMessagesPerUserPer10Min: 4 },
    private stateManager?: RedisStateManager,
  ) {}

  private userIndexKey(conversationId: string, userId: string): string {
    return `${USER_INDEX_PREFIX}${conversationId}:${userId}`;
  }

  private itemKey(id: string): string {
    return `${ITEM_PREFIX}${id}`;
  }

  async enqueue(conversationId: string, action: PendingAction): Promise<string> {
    const now = Date.now();
    let scheduledAt = now + action.delaySeconds * 1000;

    const topicConflictId = await this.findTopicConflict(conversationId, action);
    if (topicConflictId) {
      await this.mergeIntoExisting(topicConflictId, action);
      return topicConflictId;
    }

    if (action.type === 'message') {
      scheduledAt = await this.applyRateLimit(conversationId, action.asUserId, scheduledAt);
      scheduledAt = await this.applyTempoMinimum(conversationId, action, scheduledAt);
    }

    const id = randomUUID();
    const item: RedisDeliveryItem = {
      id,
      action,
      conversationId,
      scheduledAt,
      mergeCount: 0,
    };

    const payload = JSON.stringify(item);
    const uKey = this.userIndexKey(conversationId, action.asUserId);
    const pipeline = this.redis.multi();
    pipeline.set(this.itemKey(id), payload, 'EX', ITEM_TTL_SECONDS);
    pipeline.zadd(SORTED_SET_KEY, scheduledAt, id);
    pipeline.sadd(uKey, id);
    pipeline.expire(uKey, ITEM_TTL_SECONDS);
    await pipeline.exec();

    return id;
  }

  private async findTopicConflict(conversationId: string, action: PendingAction): Promise<string | null> {
    if (!action.topicCategory) return null;

    const userIds = await this.redis.smembers(this.userIndexKey(conversationId, action.asUserId));
    const today = todayKey();

    for (const id of userIds) {
      const raw = await this.redis.get(this.itemKey(id));
      if (!raw) continue;
      const existing: RedisDeliveryItem = JSON.parse(raw);
      const existingDay = new Date(existing.scheduledAt).toISOString().slice(0, 10);
      if (existingDay === today && existing.action.topicCategory === action.topicCategory) {
        return id;
      }
    }
    return null;
  }

  private async mergeIntoExisting(id: string, action: PendingAction): Promise<void> {
    const raw = await this.redis.get(this.itemKey(id));
    if (!raw) return;
    const item: RedisDeliveryItem = JSON.parse(raw);
    if (!item.mergedTopics) item.mergedTopics = [];
    item.mergedTopics.push(action.type === 'message' ? (action as PendingMessage).content : '');
    item.mergeCount += 1;
    await this.redis.set(this.itemKey(id), JSON.stringify(item), 'EX', ITEM_TTL_SECONDS);
  }

  private async applyRateLimit(conversationId: string, userId: string, scheduledAt: number): Promise<number> {
    const windowMs = 10 * 60 * 1000;
    const max = this.config.maxMessagesPerUserPer10Min;
    const userIds = await this.redis.smembers(this.userIndexKey(conversationId, userId));

    const scheduledTimes: number[] = [];
    for (const id of userIds) {
      const score = await this.redis.zscore(SORTED_SET_KEY, id);
      if (score) scheduledTimes.push(Number(score));
    }

    if (scheduledTimes.length < max) return scheduledAt;

    const sorted = [...scheduledTimes].sort((a, b) => a - b);

    let candidate = scheduledAt;
    let safeSlotFound = false;

    while (!safeSlotFound) {
      const inWindow = sorted.filter((t) => t >= candidate && t <= candidate + windowMs);
      if (inWindow.length < max) {
        safeSlotFound = true;
      } else {
        const windowOldest = inWindow.sort((a, b) => a - b)[inWindow.length - max];
        candidate = windowOldest + windowMs + 1000;
        safeSlotFound = true;
      }
    }

    return Math.max(scheduledAt, candidate);
  }

  private async applyTempoMinimum(conversationId: string, action: PendingAction, scheduledAt: number): Promise<number> {
    const userIds = await this.redis.smembers(this.userIndexKey(conversationId, action.asUserId));
    let latestScheduled = 0;

    for (const id of userIds) {
      const score = await this.redis.zscore(SORTED_SET_KEY, id);
      if (score) {
        const t = Number(score);
        if (t > latestScheduled) latestScheduled = t;
      }
    }

    if (latestScheduled > 0) {
      const gapMs = conversationGap(action);
      const minNext = latestScheduled + gapMs;
      if (scheduledAt < minNext) return minNext;
    }

    return scheduledAt;
  }

  async poll(): Promise<number> {
    const now = Date.now();
    const readyIds = await this.redis.zrangebyscore(SORTED_SET_KEY, 0, now, 'LIMIT', 0, 10);
    let delivered = 0;

    for (const id of readyIds) {
      const raw = await this.redis.get(this.itemKey(id));
      if (!raw) {
        await this.redis.zrem(SORTED_SET_KEY, id);
        continue;
      }

      const item: RedisDeliveryItem = JSON.parse(raw);
      await this.deliver(item);
      await this.removeItem(id, item.conversationId, item.action.asUserId);
      delivered++;
    }

    return delivered;
  }

  private async deliver(item: RedisDeliveryItem): Promise<void> {
    try {
      const recentCount = await this.persistence.getRecentMessageCount(item.conversationId, 1);
      if (recentCount > 3 && item.action.type === 'message') {
        console.log(`[RedisDeliveryQueue] Skipping message — conv=${item.conversationId} has ${recentCount} recent messages (human activity)`);
        return;
      }

      if (item.action.type === 'message') {
        await this.deliverMessage(item.conversationId, item.action);
      } else {
        await this.deliverReaction(item.conversationId, item.action);
      }
    } catch (error) {
      console.error(`[RedisDeliveryQueue] Error delivering ${item.action.type} for conv=${item.conversationId}:`, error);
    }
  }

  private async deliverMessage(conversationId: string, action: PendingMessage): Promise<void> {
    const response: AgentResponse = {
      type: 'agent:response',
      conversationId,
      asUserId: action.asUserId,
      content: action.content,
      originalLanguage: action.originalLanguage,
      replyToId: action.replyToId,
      mentionedUsernames: action.mentionedUsernames.length > 0 ? action.mentionedUsernames : undefined,
      messageSource: 'agent',
      metadata: {
        agentType: 'orchestrator',
        roleConfidence: 1.0,
      },
    };

    await this.publisher.publish(response);

    if (this.stateManager) {
      const cooldown = randomCooldownSeconds();
      this.stateManager.setCooldown(conversationId, action.asUserId, cooldown).catch((err) =>
        console.error('[RedisDeliveryQueue] Cooldown set error:', err));
    }

    console.log(`[RedisDeliveryQueue] Delivered message: conv=${conversationId} user=${action.asUserId}`);
  }

  private async deliverReaction(conversationId: string, action: PendingReaction): Promise<void> {
    const reaction: AgentReaction = {
      type: 'agent:reaction',
      conversationId,
      asUserId: action.asUserId,
      targetMessageId: action.targetMessageId,
      emoji: action.emoji,
    };

    await this.publisher.publishReaction(reaction);
    console.log(`[RedisDeliveryQueue] Delivered reaction: conv=${conversationId} user=${action.asUserId} emoji=${action.emoji}`);
  }

  private async removeItem(id: string, conversationId: string, userId: string): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.zrem(SORTED_SET_KEY, id);
    pipeline.del(this.itemKey(id));
    pipeline.srem(this.userIndexKey(conversationId, userId), id);
    await pipeline.exec();
  }

  startPolling(intervalMs = 10_000): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      this.poll().catch((err) => console.error('[RedisDeliveryQueue] Poll error:', err));
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  get pendingCount(): Promise<number> {
    return this.redis.zcard(SORTED_SET_KEY);
  }

  async getAll(): Promise<SerializedDeliveryItem[]> {
    const allIds = await this.redis.zrangebyscore(SORTED_SET_KEY, '-inf', '+inf');
    const items: SerializedDeliveryItem[] = [];
    const now = Date.now();

    for (const id of allIds) {
      const raw = await this.redis.get(this.itemKey(id));
      if (!raw) continue;
      const item: RedisDeliveryItem = JSON.parse(raw);
      items.push({
        id: item.id,
        conversationId: item.conversationId,
        scheduledAt: item.scheduledAt,
        remainingMs: Math.max(0, item.scheduledAt - now),
        action: item.action,
        mergeCount: item.mergeCount,
      });
    }

    return items.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async getByConversation(conversationId: string): Promise<SerializedDeliveryItem[]> {
    const all = await this.getAll();
    return all.filter((item) => item.conversationId === conversationId);
  }

  async deleteById(id: string): Promise<boolean> {
    const raw = await this.redis.get(this.itemKey(id));
    if (!raw) return false;

    const item: RedisDeliveryItem = JSON.parse(raw);
    await this.removeItem(id, item.conversationId, item.action.asUserId);
    return true;
  }

  async editMessageById(id: string, newContent: string): Promise<SerializedDeliveryItem | null> {
    const raw = await this.redis.get(this.itemKey(id));
    if (!raw) return null;

    const item: RedisDeliveryItem = JSON.parse(raw);
    if (item.action.type !== 'message') return null;

    (item.action as PendingMessage).content = newContent;
    await this.redis.set(this.itemKey(id), JSON.stringify(item), 'EX', ITEM_TTL_SECONDS);

    return {
      id: item.id,
      conversationId: item.conversationId,
      scheduledAt: item.scheduledAt,
      remainingMs: Math.max(0, item.scheduledAt - Date.now()),
      action: item.action,
      mergeCount: item.mergeCount,
    };
  }

  async getScheduledForUser(conversationId: string, userId: string): Promise<SerializedDeliveryItem[]> {
    const ids = await this.redis.smembers(this.userIndexKey(conversationId, userId));
    const items: SerializedDeliveryItem[] = [];
    const now = Date.now();

    for (const id of ids) {
      const raw = await this.redis.get(this.itemKey(id));
      if (!raw) continue;
      const item: RedisDeliveryItem = JSON.parse(raw);
      items.push({
        id: item.id,
        conversationId: item.conversationId,
        scheduledAt: item.scheduledAt,
        remainingMs: Math.max(0, item.scheduledAt - now),
        action: item.action,
        mergeCount: item.mergeCount,
      });
    }

    return items.sort((a, b) => a.scheduledAt - b.scheduledAt);
  }

  async getScheduledTopicsForConversation(conversationId: string): Promise<Array<{ userId: string; topicCategory: string; scheduledAt: number }>> {
    const items = await this.getByConversation(conversationId);
    return items.map((item) => ({
      userId: item.action.asUserId,
      topicCategory: item.action.topicCategory,
      scheduledAt: item.scheduledAt,
    }));
  }

  async cancelForConversation(conversationId: string): Promise<number> {
    const items = await this.getByConversation(conversationId);
    for (const item of items) {
      await this.removeItem(item.id, item.conversationId, item.action.asUserId);
    }
    if (items.length > 0) {
      console.log(`[RedisDeliveryQueue] Cancelled ${items.length} pending actions for conv=${conversationId}`);
    }
    return items.length;
  }

  async clearAll(): Promise<void> {
    const allIds = await this.redis.zrangebyscore(SORTED_SET_KEY, '-inf', '+inf');
    for (const id of allIds) {
      const raw = await this.redis.get(this.itemKey(id));
      if (raw) {
        const item: RedisDeliveryItem = JSON.parse(raw);
        await this.redis.srem(this.userIndexKey(item.conversationId, item.action.asUserId), id);
      }
      await this.redis.del(this.itemKey(id));
    }
    if (allIds.length > 0) {
      await this.redis.zrem(SORTED_SET_KEY, ...allIds);
    }
    console.log('[RedisDeliveryQueue] All items cleared');
  }
}
