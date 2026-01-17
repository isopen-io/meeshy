/**
 * Typing Service
 * Handles typing indicator functionality
 * - Start/stop typing indicators
 * - Manage typing timeouts
 * - Track typing users per conversation
 */

'use client';

import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
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
export class TypingService {
  private typingListeners: Set<TypingListener> = new Set();
  private typingUsers: Map<string, Set<string>> = new Map(); // conversationId -> Set<userId>
  private typingTimeouts: Map<string, NodeJS.Timeout> = new Map(); // userId:conversationId -> timeout

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
   * Start typing indicator
   */
  startTyping(socket: TypedSocket | null, conversationId: string): void {
    if (!socket || !socket.connected) {
      console.warn('[TypingService] Socket not available');
      return;
    }
    socket.emit(CLIENT_EVENTS.TYPING_START, { conversationId });
  }

  /**
   * Stop typing indicator
   */
  stopTyping(socket: TypedSocket | null, conversationId: string): void {
    if (!socket || !socket.connected) {
      console.warn('[TypingService] Socket not available');
      return;
    }
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
   * Cleanup all listeners and timeouts
   */
  cleanup(): void {
    // Clear all timeouts
    this.typingTimeouts.forEach(timeout => clearTimeout(timeout));
    this.typingTimeouts.clear();
    this.typingUsers.clear();
    this.typingListeners.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.typingListeners.size;
  }
}
