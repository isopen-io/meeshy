/**
 * useCallTranscriptJournal — journal de transcription d'appel côté web.
 *
 * Chaque segment final arrive par un ou deux transports : le data channel
 * WebRTC P2P (entrée originale + tag de langue, latence minimale) et le
 * relais serveur `call:translated-segment` (traduction + fallback quand le
 * channel est absent). Le hook fusionne les deux arrivées par id stable
 * (`callTranscriptEntryKey`) : une seule ligne de journal, la traduction
 * vient l'enrichir. Les lignes sont ordonnées par `capturedAtMs` (horloge
 * murale de capture) et portent displayName + tag de langue pour le rendu
 * `displayName (heure): message`.
 */

import { renderHook, act } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallTranscriptJournal } from '@/hooks/use-call-transcript-journal';
import { callTranscriptChannel } from '@/services/call-transcript-channel';

const CALL_ID = 'call-journal-1';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function translatedSegment(overrides: {
  callId?: string;
  id?: string;
  speakerId?: string;
  speakerDisplayName?: string;
  text?: string;
  translatedText?: string;
  isFinal?: boolean;
  capturedAtMs?: number;
} = {}) {
  const {
    callId = CALL_ID,
    id,
    speakerId = 'speaker-1',
    speakerDisplayName,
    text = 'hello',
    translatedText,
    isFinal = true,
    capturedAtMs,
  } = overrides;
  return {
    callId,
    segment: {
      ...(id !== undefined ? { id } : {}),
      text,
      ...(translatedText !== undefined ? { translatedText } : {}),
      speakerId,
      ...(speakerDisplayName !== undefined ? { speakerDisplayName } : {}),
      startMs: 0,
      endMs: 1200,
      isFinal,
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      confidence: 0.92,
      ...(capturedAtMs !== undefined ? { capturedAtMs } : {}),
    },
  };
}

function peerEntry(overrides: {
  id?: string;
  callId?: string;
  speakerId?: string;
  speakerDisplayName?: string;
  text?: string;
  language?: string;
  capturedAtMs?: number;
} = {}) {
  const {
    id = 'entry-1',
    callId = CALL_ID,
    speakerId = 'speaker-1',
    speakerDisplayName = 'Alice',
    text = 'hello',
    language = 'en',
    capturedAtMs = 1_000,
  } = overrides;
  return {
    id,
    callId,
    speakerId,
    speakerDisplayName,
    text,
    language,
    capturedAtMs,
    isFinal: true,
    confidence: 0.9,
  };
}

describe('useCallTranscriptJournal', () => {
  let socket: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
  });

  it('journals a translated segment with displayName, language tag and capture time', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translatedSegment({
        id: 'seg-1',
        speakerDisplayName: 'Alice Doe',
        text: 'hello',
        translatedText: 'bonjour',
        capturedAtMs: 5_000,
      }));
    });

    expect(result.current.entries).toHaveLength(1);
    const entry = result.current.entries[0];
    expect(entry.displayName).toBe('Alice Doe');
    expect(entry.text).toBe('hello');
    expect(entry.translatedText).toBe('bonjour');
    expect(entry.language).toBe('en');
    expect(entry.targetLanguage).toBe('fr');
    expect(entry.capturedAtMs).toBe(5_000);
  });

  it('ignores segments from another call', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translatedSegment({ callId: 'other-call' }));
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it('ignores non-final segments (partials belong to the overlay, not the journal)', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translatedSegment({ isFinal: false }));
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it('merges a data-channel entry and its later server translation into ONE line', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      callTranscriptChannel.publish(peerEntry({ id: 'seg-1', text: 'hello', capturedAtMs: 1_000 }));
    });
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translatedSegment({
        id: 'seg-1',
        text: 'hello',
        translatedText: 'bonjour',
        capturedAtMs: 1_400,
      }));
    });

    expect(result.current.entries).toHaveLength(1);
    const entry = result.current.entries[0];
    expect(entry.text).toBe('hello');
    expect(entry.translatedText).toBe('bonjour');
    expect(entry.capturedAtMs).toBe(1_000);
    expect(entry.displayName).toBe('Alice');
  });

  it('ignores data-channel entries from another call', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      callTranscriptChannel.publish(peerEntry({ callId: 'other-call' }));
    });

    expect(result.current.entries).toHaveLength(0);
  });

  it('orders the journal by capture wall clock, not arrival order', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    act(() => {
      callTranscriptChannel.publish(peerEntry({ id: 'late', text: 'second', capturedAtMs: 2_000 }));
      callTranscriptChannel.publish(peerEntry({ id: 'early', text: 'first', capturedAtMs: 1_000 }));
    });

    expect(result.current.entries.map((e) => e.text)).toEqual(['first', 'second']);
  });

  it('deduplicates legacy segments without wire id via the synthetic key', () => {
    const { result } = renderHook(() => useCallTranscriptJournal(CALL_ID));

    const legacy = translatedSegment({ text: 'legacy', capturedAtMs: 3_000 });
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, legacy);
      socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, legacy);
    });

    expect(result.current.entries).toHaveLength(1);
  });

  it('resets the journal when the call changes', () => {
    const { result, rerender } = renderHook(
      ({ callId }: { callId: string | null }) => useCallTranscriptJournal(callId),
      { initialProps: { callId: CALL_ID } }
    );

    act(() => {
      callTranscriptChannel.publish(peerEntry());
    });
    expect(result.current.entries).toHaveLength(1);

    rerender({ callId: 'call-journal-2' });
    expect(result.current.entries).toHaveLength(0);
  });
});
