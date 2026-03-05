import type { TriggerConfig, TriggerCallback } from './types';
import type { TriggerContext } from '../graph/state';

type ConversationTrigger = {
  config: TriggerConfig;
  callback: TriggerCallback;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  lastFiredAt: number;
};

export class TriggerEngine {
  private conversations = new Map<string, ConversationTrigger>();

  registerConversation(config: TriggerConfig, callback: TriggerCallback): void {
    this.conversations.set(config.conversationId, {
      config,
      callback,
      timeoutHandle: null,
      lastFiredAt: 0,
    });
  }

  unregisterConversation(conversationId: string): void {
    const entry = this.conversations.get(conversationId);
    if (entry?.timeoutHandle) clearTimeout(entry.timeoutHandle);
    this.conversations.delete(conversationId);
  }

  async onMessage(
    conversationId: string,
    message: { messageId: string; senderId: string; replyToId?: string },
  ): Promise<void> {
    const entry = this.conversations.get(conversationId);
    if (!entry) return;

    const { config, callback } = entry;
    const now = Date.now();

    // Cooldown check
    if (now - entry.lastFiredAt < config.cooldownSeconds * 1000) return;

    // Reset timeout timer
    if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);

    // Check user_message trigger
    if (config.triggerOnUserMessage && config.triggerFromUserIds.includes(message.senderId)) {
      entry.lastFiredAt = now;
      await callback({ type: 'user_message', triggeredByMessageId: message.messageId, triggeredByUserId: message.senderId });
      return;
    }

    // Check reply_to trigger
    if (config.triggerOnReplyTo && message.replyToId) {
      entry.lastFiredAt = now;
      await callback({ type: 'reply_to', triggeredByMessageId: message.messageId });
      return;
    }

    // Set timeout trigger
    if (config.triggerOnTimeout) {
      entry.timeoutHandle = setTimeout(async () => {
        const e = this.conversations.get(conversationId);
        if (!e) return;
        e.lastFiredAt = Date.now();
        await callback({ type: 'timeout', triggeredByMessageId: message.messageId });
      }, config.timeoutSeconds * 1000);
    }
  }

  clearAll(): void {
    for (const [, entry] of this.conversations) {
      if (entry.timeoutHandle) clearTimeout(entry.timeoutHandle);
    }
    this.conversations.clear();
  }
}
