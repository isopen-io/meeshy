import { renderHook, act, waitFor } from '@testing-library/react';
import { useAudioTranslation } from '@/hooks/use-audio-translation';

// ─── Mock sonner (not used in this hook but prevent import errors) ─────────────

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// ─── Mock apiService ──────────────────────────────────────────────────────────

const mockPost = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    post: (...args: any[]) => mockPost(...args),
  },
}));

// ─── Mock meeshySocketIOService ───────────────────────────────────────────────

const mockOnTranscription = jest.fn(() => jest.fn());
const mockOnAudioTranslation = jest.fn(() => jest.fn());
const mockOnAudioTranslationsProgressive = jest.fn(() => jest.fn());
const mockOnAudioTranslationsCompleted = jest.fn(() => jest.fn());

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onTranscription: (...args: any[]) => mockOnTranscription(...args),
    onAudioTranslation: (...args: any[]) => mockOnAudioTranslation(...args),
    onAudioTranslationsProgressive: (...args: any[]) => mockOnAudioTranslationsProgressive(...args),
    onAudioTranslationsCompleted: (...args: any[]) => mockOnAudioTranslationsCompleted(...args),
  },
}));

// ─── Factories ────────────────────────────────────────────────────────────────

function makeDefaultOptions(overrides = {}) {
  return {
    attachmentId: 'attach-1',
    messageId: 'msg-1',
    attachmentFileUrl: 'https://example.com/audio.mp3',
    ...overrides,
  };
}

function makeTranscription(overrides = {}) {
  return {
    text: 'Hello world',
    language: 'en',
    confidence: 0.95,
    segments: [],
    speakerCount: 1,
    primarySpeakerId: 'speaker-1',
    senderVoiceIdentified: true,
    senderSpeakerId: 'speaker-1',
    speakerAnalysis: null,
    ...overrides,
  };
}

function makeTranslationEventData(overrides = {}) {
  return {
    messageId: 'msg-1',
    attachmentId: 'attach-1',
    conversationId: 'conv-1',
    language: 'fr',
    translatedAudio: {
      id: 'ta-1',
      targetLanguage: 'fr',
      url: 'https://example.com/audio-fr.mp3',
      transcription: 'Bonjour le monde',
      durationMs: 3000,
      format: 'mp3',
      cloned: false,
      quality: 0.9,
      ttsModel: 'chatterbox',
      voiceModelId: undefined,
      segments: [],
      path: '/path/to/audio-fr.mp3',
    },
    ...overrides,
  };
}

function makeInitialTranslations() {
  return {
    fr: {
      type: 'audio' as const,
      transcription: 'Bonjour le monde',
      url: 'https://example.com/audio-fr.mp3',
      durationMs: 3000,
      cloned: false,
      quality: 0.9,
      format: 'mp3',
      ttsModel: 'chatterbox',
      segments: [],
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAudioTranslation', () => {
  describe('initial state', () => {
    it('starts with correct defaults', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      expect(result.current.transcription).toBeUndefined();
      expect(result.current.isTranscribing).toBe(false);
      expect(result.current.transcriptionError).toBeNull();
      expect(result.current.isTranscriptionExpanded).toBe(false);
      expect(result.current.translatedAudios).toEqual([]);
      expect(result.current.isTranslating).toBe(false);
      expect(result.current.translationError).toBeNull();
      expect(result.current.selectedLanguage).toBe('original');
    });

    it('uses initialTranscription when provided', () => {
      const initialTranscription = makeTranscription();
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions({ initialTranscription }))
      );

      expect(result.current.transcription).toEqual(initialTranscription);
    });

    it('converts initialTranslations to array', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({ initialTranslations: makeInitialTranslations() })
        )
      );

      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].targetLanguage).toBe('fr');
    });
  });

  describe('initialLanguage selection', () => {
    it('returns original when no userLanguages provided', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(),
            userLanguages: undefined,
          })
        )
      );

      expect(result.current.selectedLanguage).toBe('original');
    });

    it('returns original when no initialTranslations', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({ userLanguages: ['fr', 'en'] })
        )
      );

      expect(result.current.selectedLanguage).toBe('original');
    });

    it('returns original when original language matches user preference', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(),
            initialTranscription: makeTranscription({ language: 'fr' }),
            userLanguages: ['fr', 'en'],
          })
        )
      );

      expect(result.current.selectedLanguage).toBe('original');
    });

    it('auto-selects preferred language translation when available', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(),
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr', 'en'],
          })
        )
      );

      expect(result.current.selectedLanguage).toBe('fr');
    });

    it('returns original when no matching translation for user languages', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(), // only 'fr'
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['zh', 'ja'], // no match
          })
        )
      );

      expect(result.current.selectedLanguage).toBe('original');
    });
  });

  describe('currentAudioUrl', () => {
    it('returns attachmentFileUrl for original language', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      expect(result.current.currentAudioUrl).toBe('https://example.com/audio.mp3');
    });

    it('returns translated audio URL when language is selected', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(),
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr'],
          })
        )
      );

      expect(result.current.currentAudioUrl).toBe('https://example.com/audio-fr.mp3');
    });

    it('falls back to attachmentFileUrl when translated audio has no URL', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        result.current.setSelectedLanguage('es');
      });

      expect(result.current.currentAudioUrl).toBe('https://example.com/audio.mp3');
    });
  });

  describe('currentAudioDuration', () => {
    it('returns undefined for original language', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      expect(result.current.currentAudioDuration).toBeUndefined();
    });

    it('returns durationMs/1000 for translated language', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(), // fr: durationMs 3000
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr'],
          })
        )
      );

      expect(result.current.currentAudioDuration).toBe(3); // 3000 / 1000
    });

    it('returns undefined when translated audio has no durationMs', () => {
      const translationsNoMs = {
        fr: {
          ...makeInitialTranslations().fr,
          durationMs: 0,
        },
      };
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: translationsNoMs,
            initialTranscription: makeTranscription({ language: 'de' }),
            userLanguages: ['fr'],
          })
        )
      );

      expect(result.current.currentAudioDuration).toBeUndefined();
    });
  });

  describe('currentTranscription', () => {
    it('returns raw transcription for original language', () => {
      const transcription = makeTranscription();
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions({ initialTranscription: transcription }))
      );

      expect(result.current.currentTranscription).toEqual(transcription);
    });

    it('returns translated transcription when translated language has segments', () => {
      const transcriptionsWithSegments = {
        fr: {
          ...makeInitialTranslations().fr,
          segments: [{ start: 0, end: 1, text: 'Bonjour' }],
        },
      };
      const transcription = makeTranscription({ language: 'en' });

      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: transcriptionsWithSegments,
            initialTranscription: transcription,
            userLanguages: ['fr'],
          })
        )
      );

      const current = result.current.currentTranscription;
      expect(current?.language).toBe('fr');
      expect(current?.text).toBe('Bonjour le monde');
    });

    it('falls back to raw transcription when translated audio has no segments', () => {
      const transcription = makeTranscription({ language: 'en' });
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({
            initialTranslations: makeInitialTranslations(), // no segments
            initialTranscription: transcription,
            userLanguages: ['fr'],
          })
        )
      );

      // fr translation has empty segments, falls back to raw transcription
      expect(result.current.currentTranscription).toEqual(transcription);
    });
  });

  describe('setIsTranscriptionExpanded', () => {
    it('toggles transcript expansion state', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        result.current.setIsTranscriptionExpanded(true);
      });

      expect(result.current.isTranscriptionExpanded).toBe(true);
    });
  });

  describe('setSelectedLanguage', () => {
    it('changes selected language', () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        result.current.setSelectedLanguage('fr');
      });

      expect(result.current.selectedLanguage).toBe('fr');
    });
  });

  describe('requestTranscription', () => {
    it('does nothing when useLocalTranscription=true, sets error', async () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription({ useLocalTranscription: true });
      });

      expect(result.current.transcriptionError).toBe('Transcription locale non implémentée');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does nothing when already transcribing', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Start first transcription (which sets isTranscribing=true)
      await act(async () => {
        await result.current.requestTranscription();
      });
      expect(result.current.isTranscribing).toBe(true);

      // Second call while already transcribing - should be a no-op
      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('does nothing when transcription already exists', async () => {
      const { result } = renderHook(() =>
        useAudioTranslation(
          makeDefaultOptions({ initialTranscription: makeTranscription() })
        )
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(mockPost).not.toHaveBeenCalled();
    });

    it('posts to correct endpoint and sets isTranscribing', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(mockPost).toHaveBeenCalledWith('/attachments/attach-1/transcribe', {
        async: true,
      });
    });

    it('handles 403 error', async () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      mockPost.mockRejectedValueOnce(err);

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Fonctionnalité non activée');
      expect(result.current.isTranscribing).toBe(false);
    });

    it('handles 404 error', async () => {
      const err = Object.assign(new Error('Not Found'), { status: 404 });
      mockPost.mockRejectedValueOnce(err);

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Fichier audio introuvable');
    });

    it('handles generic error with message', async () => {
      mockPost.mockRejectedValueOnce(new Error('Some error'));

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Some error');
    });

    it('throws error when API returns success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false, error: 'Erreur de transcription' });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Erreur de transcription');
    });

    it('uses fallback error message when response.error is missing', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Erreur de transcription');
    });

    it('uses fallback error message for generic errors without message', async () => {
      mockPost.mockRejectedValueOnce({});

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.transcriptionError).toBe('Erreur de transcription');
    });

    it('sets timeout after 60 seconds that clears isTranscribing', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });

      expect(result.current.isTranscribing).toBe(true);

      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(result.current.isTranscribing).toBe(false);
      expect(result.current.transcriptionError).toBe('Timeout - la transcription prend trop de temps');
    });
  });

  describe('requestTranslation', () => {
    it('does nothing when useLocalTranscription=true, sets error', async () => {
      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation({ useLocalTranscription: true });
      });

      expect(result.current.translationError).toBe('Transcription locale non implémentée');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('does nothing when already translating', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Start first translation (which sets isTranslating=true)
      await act(async () => {
        await result.current.requestTranslation();
      });
      expect(result.current.isTranslating).toBe(true);

      // Second call while already translating - should be a no-op
      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('posts with default targetLanguages and generateVoiceClone=false', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(mockPost).toHaveBeenCalledWith('/attachments/attach-1/translate', {
        targetLanguages: ['en', 'fr'],
        generateVoiceClone: false,
        async: true,
      });
    });

    it('uses custom targetLanguages and generateVoiceClone options', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation({
          targetLanguages: ['es', 'de'],
          generateVoiceClone: true,
        });
      });

      expect(mockPost).toHaveBeenCalledWith('/attachments/attach-1/translate', {
        targetLanguages: ['es', 'de'],
        generateVoiceClone: true,
        async: true,
      });
    });

    it('handles 403 error', async () => {
      const err = Object.assign(new Error('Forbidden'), { status: 403 });
      mockPost.mockRejectedValueOnce(err);

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Fonctionnalité non activée');
      expect(result.current.isTranslating).toBe(false);
    });

    it('handles 404 error', async () => {
      const err = Object.assign(new Error('Not Found'), { status: 404 });
      mockPost.mockRejectedValueOnce(err);

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Fichier audio introuvable');
    });

    it('handles generic error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Translation failed'));

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Translation failed');
    });

    it('throws error when API returns success=false', async () => {
      mockPost.mockResolvedValueOnce({ success: false, error: 'Erreur de traduction' });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Erreur de traduction');
    });

    it('uses fallback error when response.error is missing', async () => {
      mockPost.mockResolvedValueOnce({ success: false });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Erreur de traduction');
    });

    it('uses fallback error message for generic errors without message', async () => {
      mockPost.mockRejectedValueOnce({});

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.translationError).toBe('Erreur de traduction');
    });

    it('sets 120s timeout that clears isTranslating', async () => {
      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });

      expect(result.current.isTranslating).toBe(true);

      act(() => {
        jest.advanceTimersByTime(120000);
      });

      expect(result.current.isTranslating).toBe(false);
      expect(result.current.translationError).toBe('Timeout - la traduction prend trop de temps');
    });
  });

  describe('Socket.IO subscriptions', () => {
    it('subscribes to events when messageId and attachmentId are provided', () => {
      renderHook(() =>
        useAudioTranslation(makeDefaultOptions({ messageId: 'msg-1', attachmentId: 'attach-1' }))
      );

      expect(mockOnTranscription).toHaveBeenCalled();
      expect(mockOnAudioTranslation).toHaveBeenCalled();
      expect(mockOnAudioTranslationsProgressive).toHaveBeenCalled();
      expect(mockOnAudioTranslationsCompleted).toHaveBeenCalled();
    });

    it('does not subscribe when messageId is missing', () => {
      renderHook(() =>
        useAudioTranslation(makeDefaultOptions({ messageId: undefined }))
      );

      expect(mockOnTranscription).not.toHaveBeenCalled();
    });

    it('unsubscribes on unmount', () => {
      const unsubscribeTranscription = jest.fn();
      const unsubscribeTranslation = jest.fn();
      const unsubscribeProgressive = jest.fn();
      const unsubscribeCompleted = jest.fn();

      mockOnTranscription.mockReturnValueOnce(unsubscribeTranscription);
      mockOnAudioTranslation.mockReturnValueOnce(unsubscribeTranslation);
      mockOnAudioTranslationsProgressive.mockReturnValueOnce(unsubscribeProgressive);
      mockOnAudioTranslationsCompleted.mockReturnValueOnce(unsubscribeCompleted);

      const { unmount } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      unmount();

      expect(unsubscribeTranscription).toHaveBeenCalled();
      expect(unsubscribeTranslation).toHaveBeenCalled();
      expect(unsubscribeProgressive).toHaveBeenCalled();
      expect(unsubscribeCompleted).toHaveBeenCalled();
    });

    it('updates transcription when onTranscription fires for matching attachmentId', async () => {
      let capturedListener: ((data: any) => void) | undefined;
      mockOnTranscription.mockImplementation((listener) => {
        capturedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      const transcriptionEvent = {
        attachmentId: 'attach-1',
        transcription: {
          text: 'Received text',
          language: 'en',
          confidence: 0.9,
          segments: [],
          speakerCount: 1,
          primarySpeakerId: 'sp-1',
          senderVoiceIdentified: false,
          senderSpeakerId: null,
          speakerAnalysis: null,
        },
      };

      act(() => {
        capturedListener?.(transcriptionEvent);
      });

      expect(result.current.transcription?.text).toBe('Received text');
    });

    it('ignores transcription events for wrong attachmentId', async () => {
      let capturedListener: ((data: any) => void) | undefined;
      mockOnTranscription.mockImplementation((listener) => {
        capturedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        capturedListener?.({
          attachmentId: 'wrong-attach-id',
          transcription: { text: 'Wrong', language: 'en' },
        });
      });

      expect(result.current.transcription).toBeUndefined();
    });

    it('updates translatedAudios when onAudioTranslation fires', () => {
      let capturedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslation.mockImplementation((listener) => {
        capturedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      const eventData = makeTranslationEventData();

      act(() => {
        capturedListener?.(eventData);
      });

      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].targetLanguage).toBe('fr');
    });

    it('upserts translatedAudios when receiving same language twice', () => {
      let capturedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslation.mockImplementation((listener) => {
        capturedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      const eventData1 = makeTranslationEventData({ language: 'fr' });
      const eventData2 = makeTranslationEventData({
        language: 'fr',
        translatedAudio: {
          ...makeTranslationEventData().translatedAudio,
          url: 'https://example.com/audio-fr-v2.mp3',
        },
      });

      act(() => {
        capturedListener?.(eventData1);
        capturedListener?.(eventData2);
      });

      // Should still be 1 (upserted)
      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].url).toBe('https://example.com/audio-fr-v2.mp3');
    });

    it('ignores audioTranslation events for wrong attachmentId', () => {
      let capturedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslation.mockImplementation((listener) => {
        capturedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        capturedListener?.({ ...makeTranslationEventData(), attachmentId: 'wrong-id' });
      });

      expect(result.current.translatedAudios).toHaveLength(0);
    });
  });

  describe('side effects', () => {
    it('clears isTranscribing when transcription arrives', async () => {
      let transcriptionListener: ((data: any) => void) | undefined;
      mockOnTranscription.mockImplementation((listener) => {
        transcriptionListener = listener;
        return jest.fn();
      });

      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Start transcription
      await act(async () => {
        await result.current.requestTranscription();
      });
      expect(result.current.isTranscribing).toBe(true);

      // Simulate transcription arriving via socket
      act(() => {
        transcriptionListener?.({
          attachmentId: 'attach-1',
          transcription: {
            text: 'Hello',
            language: 'en',
            confidence: 0.9,
            segments: [],
            speakerCount: 1,
            primarySpeakerId: null,
            senderVoiceIdentified: false,
            senderSpeakerId: null,
            speakerAnalysis: null,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isTranscribing).toBe(false);
      });
    });

    it('clears isTranslating when translatedAudios arrive', async () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Start translation so isTranslating becomes true
      await act(async () => {
        await result.current.requestTranslation();
      });
      expect(result.current.isTranslating).toBe(true);

      // Fire a progressive translation event - this adds to translatedAudios
      act(() => {
        progressiveListener?.(makeTranslationEventData());
      });

      await waitFor(() => {
        expect(result.current.isTranslating).toBe(false);
      });
    });

    it('clears isTranslating when transcription arrives while translating', async () => {
      let transcriptionListener: ((data: any) => void) | undefined;
      mockOnTranscription.mockImplementation((listener) => {
        transcriptionListener = listener;
        return jest.fn();
      });

      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Start translation to set isTranslating=true
      await act(async () => {
        await result.current.requestTranslation();
      });
      expect(result.current.isTranslating).toBe(true);

      // Simulate transcription arriving via socket while translating
      act(() => {
        transcriptionListener?.({
          attachmentId: 'attach-1',
          transcription: {
            text: 'Hello',
            language: 'en',
            confidence: 0.9,
            segments: [],
            speakerCount: 1,
            primarySpeakerId: null,
            senderVoiceIdentified: false,
            senderSpeakerId: null,
            speakerAnalysis: null,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isTranslating).toBe(false);
      });
    });

    it('ignores progressive translation events for wrong attachmentId', () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        progressiveListener?.({ ...makeTranslationEventData(), attachmentId: 'wrong-id' });
      });

      expect(result.current.translatedAudios).toHaveLength(0);
    });

    it('onAudioTranslationsProgressive upserts existing audio', () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Add audio for 'fr' first
      act(() => {
        progressiveListener?.(makeTranslationEventData({ language: 'fr' }));
      });
      expect(result.current.translatedAudios).toHaveLength(1);

      // Update same language via progressive
      act(() => {
        progressiveListener?.(
          makeTranslationEventData({
            language: 'fr',
            translatedAudio: {
              ...makeTranslationEventData().translatedAudio,
              url: 'https://example.com/audio-fr-updated.mp3',
            },
          })
        );
      });

      // Should be upserted, not appended
      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].url).toBe('https://example.com/audio-fr-updated.mp3');
    });

    it('onAudioTranslationsCompleted upserts existing audio', () => {
      let completedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsCompleted.mockImplementation((listener) => {
        completedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      // Add audio for 'fr' first via completed
      act(() => {
        completedListener?.(makeTranslationEventData({ language: 'fr' }));
      });
      expect(result.current.translatedAudios).toHaveLength(1);

      // Update same language via completed (upsert path)
      act(() => {
        completedListener?.(
          makeTranslationEventData({
            language: 'fr',
            translatedAudio: {
              ...makeTranslationEventData().translatedAudio,
              url: 'https://example.com/audio-fr-final.mp3',
            },
          })
        );
      });

      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].url).toBe('https://example.com/audio-fr-final.mp3');
    });

    it('onAudioTranslationsCompleted adds new audio', () => {
      let completedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsCompleted.mockImplementation((listener) => {
        completedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        completedListener?.(makeTranslationEventData({
          language: 'es',
          translatedAudio: {
            ...makeTranslationEventData().translatedAudio,
            targetLanguage: 'es',
          },
        }));
      });

      expect(result.current.translatedAudios).toHaveLength(1);
      expect(result.current.translatedAudios[0].targetLanguage).toBe('es');
    });

    it('ignores completedTranslation events for wrong attachmentId', () => {
      let completedListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsCompleted.mockImplementation((listener) => {
        completedListener = listener;
        return jest.fn();
      });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      act(() => {
        completedListener?.({ ...makeTranslationEventData(), attachmentId: 'wrong-id' });
      });

      expect(result.current.translatedAudios).toHaveLength(0);
    });

    it('timeout does not set error when transcription already arrived (line 326 branch)', async () => {
      let transcriptionListener: ((data: any) => void) | undefined;
      mockOnTranscription.mockImplementation((listener) => {
        transcriptionListener = listener;
        return jest.fn();
      });

      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranscription();
      });
      expect(result.current.isTranscribing).toBe(true);

      // Transcription arrives and clears isTranscribing BEFORE timeout fires
      act(() => {
        transcriptionListener?.({
          attachmentId: 'attach-1',
          transcription: {
            text: 'Hello',
            language: 'en',
            confidence: 0.9,
            segments: [],
            speakerCount: 1,
            primarySpeakerId: null,
            senderVoiceIdentified: false,
            senderSpeakerId: null,
            speakerAnalysis: null,
          },
        });
      });

      await waitFor(() => {
        expect(result.current.isTranscribing).toBe(false);
      });

      // Now advance timer - timeout fires but isTranscribing is already false
      // Should NOT set error (line 326 branch: return prev when prev is false)
      act(() => {
        jest.advanceTimersByTime(60000);
      });

      expect(result.current.transcriptionError).toBeNull();
    });

    it('timeout does not set error when translation already arrived (line 380 branch)', async () => {
      let progressiveListener: ((data: any) => void) | undefined;
      mockOnAudioTranslationsProgressive.mockImplementation((listener) => {
        progressiveListener = listener;
        return jest.fn();
      });

      mockPost.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() =>
        useAudioTranslation(makeDefaultOptions())
      );

      await act(async () => {
        await result.current.requestTranslation();
      });
      expect(result.current.isTranslating).toBe(true);

      // Translation arrives and clears isTranslating BEFORE timeout fires
      act(() => {
        progressiveListener?.(makeTranslationEventData());
      });

      await waitFor(() => {
        expect(result.current.isTranslating).toBe(false);
      });

      // Advance timer - timeout fires but isTranslating is already false
      act(() => {
        jest.advanceTimersByTime(120000);
      });

      expect(result.current.translationError).toBeNull();
    });
  });
});
