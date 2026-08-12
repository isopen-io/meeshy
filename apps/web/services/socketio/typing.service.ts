/**
 * Typing Service
 * Handles typing indicator functionality
 * - Start/stop typing indicators
 * - Manage typing timeouts
 * - Track typing users per conversation
 */

'use client';

import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { logger } from '@/utils/logger';
import { useUserStore } from '@/stores/user-store';
import type { TypingEvent } from '@/types';
import type {
  TypedSocket,
  TypingListener,
  UnsubscribeFn
} from './types';

/**
 * TypingService
 * Single Responsibility: Handle typing indicators
 */
const TYPING_EMIT_THROTTLE_MS = 2000;

export class TypingService {
  private typingListeners: Set<TypingListener> = new Set();
  private typingUsers: Map<string, Set<string>> = new Map(); // conversationId -> Set<userId>
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map(); // userId:conversationId -> timeout
  private lastStartEmitAt: Map<string, number> = new Map(); // conversationId -> epoch ms

  /**
   * Setup typing event listeners on socket
   */
  setupEventListeners(socket: TypedSocket): void {
    // Typing start
    socket.on(SERVER_EVENTS.TYPING_START, (event) => {
      this.handleTypingStart(event);
    });

    // Typing stop
    socket.on(SERVER_EVENTS.TYPING_STOP, (event) => {
      this.handleTypingStopWithDelay(event);
    });
  }

  /**
   * Handle typing start event
   */
  private handleTypingStart(event: TypingEvent): void {
    // Typing = signal de présence le plus fort : l'émetteur est actif LÀ,
    // MAINTENANT. On force son état online localement pour que le dot vert
    // reste cohérent avec « X écrit… » même si le dernier user:status date
    // (le gateway ne rebroadcaste pas lastActiveAt sur typing:start).
    useUserStore.getState().updateUserStatus(event.userId, {
      isOnline: true,
      lastActiveAt: new Date(),
    });

    // Add user to typing users for this conversation
    if (!this.typingUsers.has(event.conversationId)) {
      this.typingUsers.set(event.conversationId, new Set());
    }
    this.typingUsers.get(event.conversationId)!.add(event.userId);

    // Clear previous timeout if exists
    const timeoutKey = `${event.conversationId}:${event.userId}`;
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey)!);
    }

    // Safety timeout (15 seconds) - fallback to prevent stuck indicators
    const timeout = setTimeout(() => {
      this.handleTypingStop(event);
    }, 15000);
    this.typingTimeouts.set(timeoutKey, timeout);

    // Notify listeners
    this.typingListeners.forEach(listener =>
      listener({ ...event, isTyping: true } as any)
    );
  }

  /**
   * Handle typing stop with 3-second delay
   * Keeps indicator visible briefly after last keystroke
   */
  private handleTypingStopWithDelay(event: TypingEvent): void {
    const timeoutKey = `${event.conversationId}:${event.userId}`;

    // Clear previous timeout
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey)!);
    }

    // Wait 3 seconds before hiding indicator
    const timeout = setTimeout(() => {
      this.handleTypingStop(event);
    }, 3000);

    this.typingTimeouts.set(timeoutKey, timeout);
  }

  /**
   * Handle typing stop event (immediate)
   */
  private handleTypingStop(event: TypingEvent): void {
    const timeoutKey = `${event.conversationId}:${event.userId}`;

    // Clear timeout
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey)!);
      this.typingTimeouts.delete(timeoutKey);
    }

    // Remove user from typing users
    if (this.typingUsers.has(event.conversationId)) {
      this.typingUsers.get(event.conversationId)!.delete(event.userId);

      // Clean up conversation if no more typing users
      if (this.typingUsers.get(event.conversationId)!.size === 0) {
        this.typingUsers.delete(event.conversationId);
      }
    }

    // Notify listeners
    this.typingListeners.forEach(listener =>
      listener({ ...event, isTyping: false } as any)
    );
  }

  /**
   * Start typing indicator. Throttled to one emit per
   * TYPING_EMIT_THROTTLE_MS — the server-side safety timeout and
   * the receiver's 3s linger window keep the indicator visible
   * between keystrokes without needing a packet per keystroke.
   */
  startTyping(socket: TypedSocket | null, conversationId: string): void {
    if (!socket || !socket.connected) {
      logger.warn('[TypingService]', 'Socket not available');
      return;
    }
    const now = Date.now();
    const last = this.lastStartEmitAt.get(conversationId) ?? 0;
    if (now - last < TYPING_EMIT_THROTTLE_MS) {
      return;
    }
    this.lastStartEmitAt.set(conversationId, now);
    socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId });
  }

  /**
   * Stop typing indicator
   */
  stopTyping(socket: TypedSocket | null, conversationId: string): void {
    if (!socket || !socket.connected) {
      logger.warn('[TypingService]', 'Socket not available');
      return;
    }
    this.lastStartEmitAt.delete(conversationId);
    socket.emit(CLIENT_EVENTS.TYPING_STOP, { conversationId });
  }

  /**
   * Get typing users for a conversation
   */
  getTypingUsers(conversationId: string): string[] {
    return Array.from(this.typingUsers.get(conversationId) || []);
  }

  /**
   * Event listener: Typing events
   */
  onTyping(listener: TypingListener): UnsubscribeFn {
    this.typingListeners.add(listener);
    return () => this.typingListeners.delete(listener);
  }

  /**
   * Event listener: Typing start (alias for onTyping)
   */
  onTypingStart(listener: TypingListener): UnsubscribeFn {
    return this.onTyping(listener);
  }

  /**
   * Event listener: Typing stop (alias for onTyping)
   */
  onTypingStop(listener: TypingListener): UnsubscribeFn {
    return this.onTyping(listener);
  }

  /**
   * Clear typing state for a single conversation and notify listeners.
   * Called when the user leaves a conversation so stale indicators don't
   * persist in the background.
   */
  clearConversationTypingState(conversationId: string): void {
    const userIds = this.typingUsers.get(conversationId);
    if (!userIds) return;

    userIds.forEach(userId => {
      const timeoutKey = `${conversationId}:${userId}`;
      const t = this.typingTimeouts.get(timeoutKey);
      if (t) { clearTimeout(t); this.typingTimeouts.delete(timeoutKey); }
      this.typingListeners.forEach(listener =>
        listener({ conversationId, userId, isTyping: false } as any)
      );
    });
    this.typingUsers.delete(conversationId);
    this.lastStartEmitAt.delete(conversationId);
  }

  /**
   * Clear all active typing indicators and notify listeners.
   * Called on socket disconnect so UI reflects reality immediately
   * instead of waiting for the 15-second safety timeout.
   */
  clearAllTypingState(): void {
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.typingTimeouts.clear();

    this.typingUsers.forEach((userIds, conversationId) => {
      userIds.forEach(userId => {
        this.typingListeners.forEach(listener =>
          listener({ conversationId, userId, isTyping: false } as any)
        );
      });
    });
    this.typingUsers.clear();
    this.lastStartEmitAt.clear();
  }

  /**
   * Cleanup all listeners and timeouts
   */
  cleanup(): void {
    // Clear all timeouts
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.typingTimeouts.clear();
    this.typingUsers.clear();
    this.typingListeners.clear();
    this.lastStartEmitAt.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.typingListeners.size;
  }
}
