/**
 * Unit tests for TranslationService.
 * Covers event forwarding, deduplication, LRU caching, listener lifecycle, and cleanup.
 */

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_TRANSLATION: 'message:translation',
    MESSAGE_TRANSLATED: 'message:translated',
    AUDIO_TRANSLATION_READY: 'audio:translation-ready',
    AUDIO_TRANSLATIONS_PROGRESSIVE: 'audio:translations-progressive',
    AUDIO_TRANSLATIONS_COMPLETED: 'audio:translations-completed',
    TRANSCRIPTION_READY: 'audio:transcription-ready',
    TRANSLATION_FAILED: 'translation:failed',
    AUDIO_TRANSLATION_FAILED: 'audio:translation-failed',
    TRANSCRIPTION_FAILED: 'audio:transcription-failed',
  },
}));

import { TranslationService } from '@/services/socketio/translation.service';

function makeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function makeTranslationEvent(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-1',
    translations: [{ id: 'tr-1', targetLanguage: 'fr', translatedContent: 'Bonjour' }],
    ...overrides,
  };
}

describe('TranslationService', () => {
  let service: TranslationService;

  beforeEach(() => {
    service = new TranslationService();
  });

  afterEach(() => {
    service.cleanup();
  });

  // ─── setupEventListeners ───────────────────────────────────────────────────

  describe('setupEventListeners', () => {
    it('registers all expected socket events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const expectedEvents = [
        'message:translation',
        'message:translated',
        'audio:translation-ready',
        'audio:translations-progressive',
        'audio:translations-completed',
        'audio:transcription-ready',
        'translation:failed',
        'audio:translation-failed',
        'audio:transcription-failed',
      ];
      for (const event of expectedEvents) {
        expect(socket.on).toHaveBeenCalledWith(event, expect.any(Function));
      }
    });

    it('forwards message:translation events (plural format) to listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      const event = makeTranslationEvent();
      socket._trigger('message:translation', event);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'msg-1',
        translations: event.translations,
      }));
    });

    it('forwards message:translation events (singular format) to listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      const event = {
        messageId: 'msg-1',
        translation: { id: 'tr-1', targetLanguage: 'fr', translatedContent: 'Bonjour' },
      };
      socket._trigger('message:translation', event);

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        messageId: 'msg-1',
        translations: [event.translation],
      }));
    });

    it('does not call listeners when event has no translations or translation', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      socket._trigger('message:translation', { messageId: 'msg-1' });
      expect(listener).not.toHaveBeenCalled();
    });

    it('deduplicates identical translation events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      const event = makeTranslationEvent();
      socket._trigger('message:translation', event);
      socket._trigger('message:translation', event); // duplicate

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('forwards message:translated events through the same deduplication path', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      const event = makeTranslationEvent({ messageId: 'msg-2' });
      socket._trigger('message:translated', event);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('forwards audio:translation-ready events to audioTranslation listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onAudioTranslation(listener);

      const event = { messageId: 'msg-1', attachmentId: 'att-1', language: 'fr', translatedAudio: { url: 'http://x' } };
      socket._trigger('audio:translation-ready', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards audio:transcription-ready events to transcription listeners', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranscription(listener);

      const event = { messageId: 'm', attachmentId: 'a', transcription: { text: 'hello', language: 'en', confidence: 0.9 } };
      socket._trigger('audio:transcription-ready', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards audio:translations-progressive events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onAudioTranslationsProgressive(listener);

      const event = { messageId: 'm', attachmentId: 'a', language: 'fr', translatedAudio: { transcription: null, segments: [] } };
      socket._trigger('audio:translations-progressive', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards audio:translations-completed events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onAudioTranslationsCompleted(listener);

      const event = { messageId: 'm', attachmentId: 'a', language: 'fr', translatedAudio: { transcription: null, segments: [] } };
      socket._trigger('audio:translations-completed', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards translation:failed events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslationFailed(listener);

      const event = { messageId: 'm', conversationId: 'c', error: 'timeout' };
      socket._trigger('translation:failed', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards audio:translation-failed events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onAudioTranslationFailed(listener);

      const event = { messageId: 'm', attachmentId: 'a', conversationId: 'c', error: 'timeout' };
      socket._trigger('audio:translation-failed', event);
      expect(listener).toHaveBeenCalledWith(event);
    });

    it('forwards audio:transcription-failed events', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranscriptionFailed(listener);

      const event = { messageId: 'm', attachmentId: 'a', conversationId: 'c', error: 'timeout' };
      socket._trigger('audio:transcription-failed', event);
      expect(listener).toHaveBeenCalledWith(event);
    });
  });

  // ─── getCachedTranslation ─────────────────────────────────────────────────

  describe('getCachedTranslation', () => {
    it('returns undefined for uncached translation', () => {
      expect(service.getCachedTranslation('msg-1', 'fr')).toBeUndefined();
    });

    it('returns cached translation after event is processed', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const translation = { id: 'tr-1', targetLanguage: 'fr', translatedContent: 'Bonjour' };
      socket._trigger('message:translation', { messageId: 'msg-1', translations: [translation] });

      const cached = service.getCachedTranslation('msg-1', 'fr');
      expect(cached).toEqual(translation);
    });

    it('caches multiple languages from the same event', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const translations = [
        { id: 'tr-en', targetLanguage: 'en', translatedContent: 'Hello' },
        { id: 'tr-es', targetLanguage: 'es', translatedContent: 'Hola' },
      ];
      socket._trigger('message:translation', { messageId: 'msg-2', translations });

      expect(service.getCachedTranslation('msg-2', 'en')).toEqual(translations[0]);
      expect(service.getCachedTranslation('msg-2', 'es')).toEqual(translations[1]);
    });
  });

  // ─── clearCache ───────────────────────────────────────────────────────────

  describe('clearCache', () => {
    it('removes all cached translations', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('message:translation', { messageId: 'msg-1', translations: [{ targetLanguage: 'fr' }] });

      service.clearCache();
      expect(service.getCachedTranslation('msg-1', 'fr')).toBeUndefined();
    });

    it('resets processedEvents so a previously seen event is processed again', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      const event = makeTranslationEvent();
      socket._trigger('message:translation', event);
      expect(listener).toHaveBeenCalledTimes(1);

      service.clearCache();
      socket._trigger('message:translation', event); // same event after clear
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  // ─── getCacheStats ────────────────────────────────────────────────────────

  describe('getCacheStats', () => {
    it('returns zero stats on fresh instance', () => {
      expect(service.getCacheStats()).toEqual({ size: 0, processedEvents: 0 });
    });

    it('reflects cache and processed events after processing', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const translations = [{ id: 'tr-1', targetLanguage: 'fr' }];
      socket._trigger('message:translation', { messageId: 'msg-1', translations });

      const stats = service.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.processedEvents).toBe(1);
    });
  });

  // ─── unsubscribe ──────────────────────────────────────────────────────────

  describe('unsubscribe (returned unsub function)', () => {
    it('onTranslation unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onTranslation(listener);
      unsub();
      socket._trigger('message:translation', makeTranslationEvent({ messageId: 'msg-x' }));
      expect(listener).not.toHaveBeenCalled();
    });

    it('onAudioTranslation unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onAudioTranslation(listener);
      unsub();
      socket._trigger('audio:translation-ready', { messageId: 'm', translatedAudio: {} });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onTranscription unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onTranscription(listener);
      unsub();
      socket._trigger('audio:transcription-ready', { messageId: 'm', attachmentId: 'a', transcription: { text: 'hi', language: 'en', confidence: 0.9 } });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onAudioTranslationsProgressive unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onAudioTranslationsProgressive(listener);
      unsub();
      socket._trigger('audio:translations-progressive', { messageId: 'm', attachmentId: 'a', language: 'fr', translatedAudio: { transcription: null, segments: [] } });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onAudioTranslationsCompleted unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onAudioTranslationsCompleted(listener);
      unsub();
      socket._trigger('audio:translations-completed', { messageId: 'm', attachmentId: 'a', language: 'fr', translatedAudio: { transcription: null, segments: [] } });
      expect(listener).not.toHaveBeenCalled();
    });

    it('onTranslationFailed unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onTranslationFailed(listener);
      unsub();
      socket._trigger('translation:failed', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onAudioTranslationFailed unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onAudioTranslationFailed(listener);
      unsub();
      socket._trigger('audio:translation-failed', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('onTranscriptionFailed unsubscribe works', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      const unsub = service.onTranscriptionFailed(listener);
      unsub();
      socket._trigger('audio:transcription-failed', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // ─── cleanup ──────────────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('clears all listeners so events are silently ignored', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);
      service.cleanup();
      socket._trigger('message:translation', makeTranslationEvent({ messageId: 'new-msg' }));
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears cache on cleanup', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      socket._trigger('message:translation', makeTranslationEvent());
      service.cleanup();
      expect(service.getCacheStats()).toEqual({ size: 0, processedEvents: 0 });
    });

    it('does not throw on a fresh instance', () => {
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  // ─── getListenerCount ─────────────────────────────────────────────────────

  describe('getListenerCount', () => {
    it('returns 0 on fresh instance', () => {
      expect(service.getListenerCount()).toBe(0);
    });

    it('increments with each registered translation listener', () => {
      service.onTranslation(jest.fn());
      service.onTranslation(jest.fn());
      expect(service.getListenerCount()).toBe(2);
    });

    it('decrements when listener is unsubscribed', () => {
      const unsub = service.onTranslation(jest.fn());
      unsub();
      expect(service.getListenerCount()).toBe(0);
    });

    it('returns 0 after cleanup', () => {
      service.onTranslation(jest.fn());
      service.cleanup();
      expect(service.getListenerCount()).toBe(0);
    });
  });

  // ─── deduplication edge cases ─────────────────────────────────────────────

  describe('deduplication edge cases', () => {
    it('processes events with different messageIds independently', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      socket._trigger('message:translation', makeTranslationEvent({ messageId: 'msg-a' }));
      socket._trigger('message:translation', makeTranslationEvent({ messageId: 'msg-b' }));
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('drops old processedEvents when set exceeds 100 entries', () => {
      const socket = makeSocket();
      service.setupEventListeners(socket as any);
      const listener = jest.fn();
      service.onTranslation(listener);

      // Add 101 distinct events so the cleanup branch fires
      for (let i = 0; i < 101; i++) {
        socket._trigger('message:translation', makeTranslationEvent({ messageId: `msg-${i}` }));
      }

      expect(listener).toHaveBeenCalledTimes(101);
      // After cleanup the set should be smaller
      expect(service.getCacheStats().processedEvents).toBeLessThan(101);
    });
  });
});
