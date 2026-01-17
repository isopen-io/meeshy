/**
 * Translation Service
 * Handles message translations
 * - Translation event listeners
 * - Translation caching
 * - Audio translation events
 * - Deduplication
 */

'use client';

import { logger } from '@/utils/logger';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { TranslationEvent, AudioTranslationReadyEventData } from '@meeshy/shared/types/socketio-events';
import type {
  TypedSocket,
  TranslationListener,
  AudioTranslationListener,
  UnsubscribeFn
} from './types';

/**
 * TranslationService
 * Single Responsibility: Handle message translations
 */
export class TranslationService {
  private translationListeners: Set<TranslationListener> = new Set();
  private audioTranslationListeners: Set<AudioTranslationListener> = new Set();

  // Translation caching and deduplication
  private translationCache: Map<string, any> = new Map();
  private processedTranslationEvents: Set<string> = new Set();

  /**
   * Setup translation event listeners on socket
   */
  setupEventListeners(socket: TypedSocket): void {
    // Message translation
    socket.on(SERVER_EVENTS.MESSAGE_TRANSLATION, (data: any) => {
      this.handleTranslationEvent(data);
    });

    // Audio translation ready
    socket.on(SERVER_EVENTS.AUDIO_TRANSLATION_READY, (data: AudioTranslationReadyEventData) => {
      logger.debug('[TranslationService]', 'Audio translation ready', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        hasTranscription: !!data.transcription,
        translatedAudiosCount: data.translatedAudios?.length || 0
      });

      this.audioTranslationListeners.forEach(listener => listener(data));
    });
  }

  /**
   * Handle translation event with deduplication
   */
  private handleTranslationEvent(data: any): void {
    // Support both singular and plural formats
    let translations: any[];
    if (data.translation) {
      // New singular format (immediate broadcast)
      translations = [data.translation];
    } else if (data.translations && Array.isArray(data.translations)) {
      // Old plural format (backward compatibility)
      translations = data.translations;
    } else {
      return;
    }

    // Deduplication based on messageId + translation timestamp
    const firstTranslation = translations[0];
    const eventKey = `${data.messageId}_${firstTranslation?.id || firstTranslation?.targetLanguage || Date.now()}`;

    if (this.processedTranslationEvents.has(eventKey)) {
      return;
    }

    this.processedTranslationEvents.add(eventKey);

    // Clean up old events (keep only last 100)
    if (this.processedTranslationEvents.size > 100) {
      const oldEvents = Array.from(this.processedTranslationEvents).slice(0, 50);
      oldEvents.forEach(oldEventKey => this.processedTranslationEvents.delete(oldEventKey));
    }

    // Cache translations
    if (translations && translations.length > 0) {
      translations.forEach((translation) => {
        const cacheKey = `${data.messageId}_${translation.targetLanguage}`;
        this.translationCache.set(cacheKey, translation);
      });
    }

    // Notify listeners with normalized format (always plural for consistency)
    const normalizedData = {
      messageId: data.messageId,
      translations: translations
    };

    this.translationListeners.forEach(listener => listener(normalizedData));
  }

  /**
   * Get cached translation
   */
  getCachedTranslation(messageId: string, targetLanguage: string): any | undefined {
    const cacheKey = `${messageId}_${targetLanguage}`;
    return this.translationCache.get(cacheKey);
  }

  /**
   * Clear translation cache
   */
  clearCache(): void {
    this.translationCache.clear();
    this.processedTranslationEvents.clear();
  }

  /**
   * Event listener: Translation
   */
  onTranslation(listener: TranslationListener): UnsubscribeFn {
    this.translationListeners.add(listener);
    return () => this.translationListeners.delete(listener);
  }

  /**
   * Event listener: Audio translation
   */
  onAudioTranslation(listener: AudioTranslationListener): UnsubscribeFn {
    this.audioTranslationListeners.add(listener);
    return () => this.audioTranslationListeners.delete(listener);
  }

  /**
   * Cleanup all listeners and cache
   */
  cleanup(): void {
    this.translationListeners.clear();
    this.audioTranslationListeners.clear();
    this.translationCache.clear();
    this.processedTranslationEvents.clear();
  }

  /**
   * Get listener count for diagnostics
   */
  getListenerCount(): number {
    return this.translationListeners.size;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; processedEvents: number } {
    return {
      size: this.translationCache.size,
      processedEvents: this.processedTranslationEvents.size
    };
  }
}
