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
import type {
  TranslationEvent,
  AudioTranslationReadyEventData,
  AudioTranslationsProgressiveEventData,
  AudioTranslationsCompletedEventData,
  TranscriptionReadyEventData
} from '@meeshy/shared/types/socketio-events';
import type {
  TypedSocket,
  TranslationListener,
  AudioTranslationListener,
  AudioTranslationsProgressiveListener,
  AudioTranslationsCompletedListener,
  TranscriptionListener,
  UnsubscribeFn
} from './types';

/**
 * TranslationService
 * Single Responsibility: Handle message translations
 */
export class TranslationService {
  private translationListeners: Set<TranslationListener> = new Set();
  private audioTranslationListeners: Set<AudioTranslationListener> = new Set();
  private audioTranslationsProgressiveListeners: Set<AudioTranslationsProgressiveListener> = new Set();
  private audioTranslationsCompletedListeners: Set<AudioTranslationsCompletedListener> = new Set();
  private transcriptionListeners: Set<TranscriptionListener> = new Set();

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
        language: data.language,
        hasUrl: !!data.translatedAudio?.url
      });

      this.audioTranslationListeners.forEach(listener => listener(data));
    });

    // Transcription ready (Phase 1: transcription seule avant traduction)
    socket.on(SERVER_EVENTS.TRANSCRIPTION_READY, (data: TranscriptionReadyEventData) => {
      logger.debug('[TranslationService]', 'Transcription ready', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        text: data.transcription.text,
        language: data.transcription.language,
        confidence: data.transcription.confidence
      });

      this.transcriptionListeners.forEach(listener => listener(data));
    });

    // Audio translations progressive (traduction en cours, pas la dernière)
    socket.on(SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE, (data: AudioTranslationsProgressiveEventData) => {
      logger.debug('[TranslationService]', 'Audio translation progressive', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: data.language,
        hasTranscription: !!data.translatedAudio.transcription,
        segmentsCount: data.translatedAudio.segments?.length || 0
      });

      this.audioTranslationsProgressiveListeners.forEach(listener => listener(data));
    });

    // Audio translations completed (dernière traduction, toutes terminées)
    socket.on(SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED, (data: AudioTranslationsCompletedEventData) => {
      logger.debug('[TranslationService]', 'Audio translations completed', {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: data.language,
        hasTranscription: !!data.translatedAudio.transcription,
        segmentsCount: data.translatedAudio.segments?.length || 0
      });

      this.audioTranslationsCompletedListeners.forEach(listener => listener(data));
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
   * Event listener: Transcription (Phase 1 avant traduction)
   */
  onTranscription(listener: TranscriptionListener): UnsubscribeFn {
    this.transcriptionListeners.add(listener);
    return () => this.transcriptionListeners.delete(listener);
  }

  /**
   * Event listener: Audio translations progressive (traduction en cours, pas la dernière)
   */
  onAudioTranslationsProgressive(listener: AudioTranslationsProgressiveListener): UnsubscribeFn {
    this.audioTranslationsProgressiveListeners.add(listener);
    return () => this.audioTranslationsProgressiveListeners.delete(listener);
  }

  /**
   * Event listener: Audio translations completed (dernière traduction, toutes terminées)
   */
  onAudioTranslationsCompleted(listener: AudioTranslationsCompletedListener): UnsubscribeFn {
    this.audioTranslationsCompletedListeners.add(listener);
    return () => this.audioTranslationsCompletedListeners.delete(listener);
  }

  /**
   * Cleanup all listeners and cache
   */
  cleanup(): void {
    this.translationListeners.clear();
    this.audioTranslationListeners.clear();
    this.audioTranslationsProgressiveListeners.clear();
    this.audioTranslationsCompletedListeners.clear();
    this.transcriptionListeners.clear();
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
