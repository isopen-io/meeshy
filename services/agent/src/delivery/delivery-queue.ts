import type { PendingAction, PendingMessage, PendingReaction } from '../graph/state';
import type { AgentResponse, AgentReaction } from '../zmq/types';
import type { ZmqAgentPublisher } from '../zmq/zmq-publisher';
import type { MongoPersistence } from '../memory/mongo-persistence';

export type DeliveryItem = {
  action: PendingAction;
  conversationId: string;
  scheduledAt: number;
  timer: ReturnType<typeof setTimeout>;
};

export class DeliveryQueue {
  private queue: DeliveryItem[] = [];
  private cancelled = new Set<string>();

  constructor(
    private publisher: ZmqAgentPublisher,
    private persistence: MongoPersistence,
  ) {}

  enqueue(conversationId: string, actions: PendingAction[]): void {
    const sorted = [...actions].sort((a, b) => a.delaySeconds - b.delaySeconds);

    for (const action of sorted) {
      const delayMs = action.delaySeconds * 1000;
      const scheduledAt = Date.now() + delayMs;

      const timer = setTimeout(async () => {
        await this.deliver(conversationId, action);
      }, delayMs);

      this.queue.push({ action, conversationId, scheduledAt, timer });
    }

    console.log(`[DeliveryQueue] Enqueued ${actions.length} actions for conv=${conversationId} (${actions.filter((a) => a.type === 'message').length} messages, ${actions.filter((a) => a.type === 'reaction').length} reactions)`);
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
      item.timer = setTimeout(async () => {
        await this.deliver(item.conversationId, item.action);
      }, newDelay);
    }
    return items.length;
  }

  get pendingCount(): number {
    return this.queue.length;
  }
}
