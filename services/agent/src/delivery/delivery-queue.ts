import { randomUUID } from 'node:crypto';
import type { PendingAction, PendingMessage, PendingReaction } from '../graph/state';
import type { AgentResponse, AgentReaction } from '../zmq/types';
import type { ZmqAgentPublisher } from '../zmq/zmq-publisher';
import type { MongoPersistence } from '../memory/mongo-persistence';
import type { RedisStateManager } from '../memory/redis-state';

export type DeliveryItem = {
  id: string;
  action: PendingAction;
  conversationId: string;
  scheduledAt: number;
  timer: ReturnType<typeof setTimeout>;
};

export type SerializedDeliveryItem = {
  id: string;
  conversationId: string;
  scheduledAt: number;
  remainingMs: number;
  action: PendingAction;
};

function randomCooldownSeconds(): number {
  const base = 240 + Math.random() * 180;
  return Math.round(base + base * (Math.random() * 0.3 - 0.15));
}

function jitterMs(value: number, percent = 0.2): number {
  return Math.round(value + value * (Math.random() * 2 * percent - percent));
}

function conversationGap(action: PendingAction): { gapMs: number; jitterPercent: number } {
  if (action.type !== 'message') return { gapMs: 0, jitterPercent: 0 };
  const wordCount = action.content?.split(/\s+/).length ?? 0;
  if (wordCount <= 4) return { gapMs: 10_000, jitterPercent: 0.4 };
  if (wordCount <= 15) return { gapMs: 15_000, jitterPercent: 0.6 };
  if (wordCount <= 35) return { gapMs: 30_000, jitterPercent: 0.5 };
  if (wordCount <= 65) return { gapMs: 90_000, jitterPercent: 0.3 };
  if (wordCount <= 105) return { gapMs: 120_000, jitterPercent: 0.2 };
  return { gapMs: 330_000, jitterPercent: 0.4 };
}

export class DeliveryQueue {
  private queue: DeliveryItem[] = [];
  private cancelled = new Set<string>();

  constructor(
    private publisher: ZmqAgentPublisher,
    private persistence: MongoPersistence,
    private stateManager?: RedisStateManager,
  ) {}

  enqueue(conversationId: string, actions: PendingAction[]): void {
    const byUser = new Map<string, PendingAction[]>();
    const reactions: PendingAction[] = [];

    for (const a of actions) {
      if (a.type === 'reaction') {
        reactions.push(a);
      } else {
        const list = byUser.get(a.asUserId) ?? [];
        list.push(a);
        byUser.set(a.asUserId, list);
      }
    }

    for (const action of reactions) {
      this.scheduleAction(conversationId, action, jitterMs(action.delaySeconds * 1000));
    }

    for (const [, userActions] of byUser) {
      const sorted = [...userActions].sort((a, b) => a.delaySeconds - b.delaySeconds);
      let cumulativeMs = jitterMs(sorted[0].delaySeconds * 1000);

      for (let i = 0; i < sorted.length; i++) {
        if (i > 0 && sorted[i].type === 'message') {
          const wordCount = (sorted[i] as PendingMessage).content?.split(/\s+/).length ?? 10;
          cumulativeMs += jitterMs(2000 + Math.random() * 4000 + wordCount * 600, 0.25);
        }
        this.scheduleAction(conversationId, sorted[i], i === 0 ? cumulativeMs : jitterMs(cumulativeMs, 0.15));
      }
    }

    console.log(`[DeliveryQueue] Enqueued ${actions.length} actions for conv=${conversationId} (${actions.filter((a) => a.type === 'message').length} messages, ${actions.filter((a) => a.type === 'reaction').length} reactions)`);
  }

  private scheduleAction(conversationId: string, action: PendingAction, delayMs: number): void {
    const now = Date.now();
    let scheduledAt = now + delayMs;

    if (action.type === 'message') {
      const latestForConv = this.getLatestMessageScheduledAt(conversationId);
      if (latestForConv > 0) {
        const { gapMs, jitterPercent } = conversationGap(action);
        const minNext = latestForConv + jitterMs(gapMs, jitterPercent);
        if (scheduledAt < minNext) {
          scheduledAt = minNext;
        }
      }
    }

    const effectiveDelay = Math.max(0, scheduledAt - now);
    const id = randomUUID();
    const timer = setTimeout(async () => {
      await this.deliver(conversationId, action);
    }, effectiveDelay);
    this.queue.push({ id, action, conversationId, scheduledAt, timer });
  }

  private getLatestMessageScheduledAt(conversationId: string): number {
    let latest = 0;
    for (const item of this.queue) {
      if (item.conversationId === conversationId && item.action.type === 'message' && item.scheduledAt > latest) {
        latest = item.scheduledAt;
      }
    }
    return latest;
  }

  cancelForConversation(conversationId: string): number {
    let count = 0;
    this.queue = this.queue.filter((item) => {
      if (item.conversationId === conversationId) {
        clearTimeout(item.timer);
        count++;
        return false;
      }
      return true;
    });
    if (count > 0) {
      console.log(`[DeliveryQueue] Cancelled ${count} pending actions for conv=${conversationId}`);
    }
    return count;
  }

  private async deliver(conversationId: string, action: PendingAction): Promise<void> {
    this.queue = this.queue.filter(
      (item) => !(item.conversationId === conversationId && item.action === action),
    );

    try {
      const recentCount = await this.persistence.getRecentMessageCount(conversationId, 1);
      if (recentCount > 3 && action.type === 'message') {
        console.log(`[DeliveryQueue] Skipping message delivery — conv=${conversationId} has ${recentCount} recent messages (human activity detected)`);
        return;
      }

      if (action.type === 'message') {
        await this.deliverMessage(conversationId, action);
      } else {
        await this.deliverReaction(conversationId, action);
      }
    } catch (error) {
      console.error(`[DeliveryQueue] Error delivering ${action.type} for conv=${conversationId}:`, error);
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
        console.error(`[DeliveryQueue] Cooldown set error:`, err));
    }
    console.log(`[DeliveryQueue] Delivered message: conv=${conversationId} user=${action.asUserId}`);
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
    console.log(`[DeliveryQueue] Delivered reaction: conv=${conversationId} user=${action.asUserId} emoji=${action.emoji}`);
  }

  private serialize(item: DeliveryItem): SerializedDeliveryItem {
    return {
      id: item.id,
      conversationId: item.conversationId,
      scheduledAt: item.scheduledAt,
      remainingMs: Math.max(0, item.scheduledAt - Date.now()),
      action: item.action,
    };
  }

  getAll(): SerializedDeliveryItem[] {
    return [...this.queue]
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .map((item) => this.serialize(item));
  }

  getByConversation(conversationId: string): SerializedDeliveryItem[] {
    return this.queue
      .filter((item) => item.conversationId === conversationId)
      .sort((a, b) => a.scheduledAt - b.scheduledAt)
      .map((item) => this.serialize(item));
  }

  deleteById(id: string): boolean {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index === -1) return false;
    const [removed] = this.queue.splice(index, 1);
    clearTimeout(removed.timer);
    console.log(`[DeliveryQueue] Deleted item ${id} for conv=${removed.conversationId}`);
    return true;
  }

  editMessageById(id: string, newContent: string): SerializedDeliveryItem | null {
    const item = this.queue.find((i) => i.id === id);
    if (!item) return null;
    if (item.action.type !== 'message') return null;

    (item.action as PendingMessage).content = newContent;
    clearTimeout(item.timer);

    const remaining = Math.max(0, item.scheduledAt - Date.now());
    const capturedConvId = item.conversationId;
    const capturedAction = item.action;
    item.timer = setTimeout(async () => {
      await this.deliver(capturedConvId, capturedAction);
    }, remaining);

    console.log(`[DeliveryQueue] Edited message ${id} for conv=${item.conversationId}`);
    return this.serialize(item);
  }

  clearAll(): void {
    for (const item of this.queue) {
      clearTimeout(item.timer);
    }
    this.queue = [];
    console.log('[DeliveryQueue] All items cleared');
  }

  getScheduledForUser(conversationId: string, userId: string): DeliveryItem[] {
    return this.queue.filter(
      (item) => item.conversationId === conversationId && item.action.asUserId === userId,
    );
  }

  rescheduleForUser(conversationId: string, userId: string, additionalDelaySeconds: number): number {
    const items = this.getScheduledForUser(conversationId, userId);
    for (const item of items) {
      clearTimeout(item.timer);
      const remaining = Math.max(0, item.scheduledAt - Date.now());
      const newDelay = remaining + additionalDelaySeconds * 1000;
      item.scheduledAt = Date.now() + newDelay;
      const capturedConvId = item.conversationId;
      const capturedAction = item.action;
      item.timer = setTimeout(async () => {
        await this.deliver(capturedConvId, capturedAction);
      }, newDelay);
    }
    return items.length;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
