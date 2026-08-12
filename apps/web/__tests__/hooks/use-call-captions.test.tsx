/**
 * useCallCaptions — parité web des captions traduites en direct (arc
 * transcription live 2026-07-10, solde parité web/android 2026-07-12).
 *
 * Le gateway traduit chaque segment final vers la langue de chaque
 * participant et relaie `call:translated-segment` à la room d'appel (le
 * speaker est exclu du fanout : toute caption reçue vient d'un PAIR). iOS
 * affiche déjà ces segments (CallTranscriptionService.receiveTranslatedSegment) ;
 * sans ce hook, un participant web en appel avec un speaker iOS ne voit
 * jamais les sous-titres.
 *
 * Sémantique miroir de iOS appendSegment :
 * - un segment NON-final remplace le non-final précédent du même speaker
 *   (les partials se réécrivent en place, pas d'empilement) ;
 * - un segment final s'ajoute et efface le partial du même speaker ;
 * - rétention bornée (4 lignes — overlay, pas un panneau transcript) ;
 * - l'overlay s'efface seul 6 s après le dernier segment (chaque segment
 *   ré-arme la fenêtre, parité use-remote-call-alerts).
 */

import { renderHook, act } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallCaptions } from '@/hooks/use-call-captions';

const CALL_ID = 'call-captions-1';

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

function segment(overrides: {
  callId?: string;
  speakerId?: string;
  text?: string;
  translatedText?: string;
  isFinal?: boolean;
} = {}) {
  const { callId = CALL_ID, speakerId = 'speaker-1', text = 'hello', translatedText, isFinal = true } = overrides;
  return {
    callId,
    segment: {
      text,
      ...(translatedText !== undefined ? { translatedText } : {}),
      speakerId,
      startMs: 0,
      endMs: 1200,
      isFinal,
      sourceLanguage: 'en',
      targetLanguage: 'fr',
      confidence: 0.92,
    },
  };
}

describe('useCallCaptions', () => {
  let socket: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    jest.useFakeTimers();
    socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('affiche le texte traduit d’un segment de l’appel actif', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ text: 'hello', translatedText: 'bonjour' })));

    expect(result.current.captions).toHaveLength(1);
    expect(result.current.captions[0].text).toBe('bonjour');
    expect(result.current.captions[0].speakerId).toBe('speaker-1');
  });

  it('retombe sur le texte original quand la traduction est absente (fallback gateway)', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ text: 'hello' })));

    expect(result.current.captions[0].text).toBe('hello');
  });

  it('un segment d’un autre appel est inerte', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ callId: 'other-call' })));

    expect(result.current.captions).toHaveLength(0);
  });

  it('un partial remplace le partial précédent du même speaker (pas d’empilement)', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'bon', isFinal: false })));
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'bonjour à', isFinal: false })));

    expect(result.current.captions).toHaveLength(1);
    expect(result.current.captions[0].text).toBe('bonjour à');
    expect(result.current.captions[0].isFinal).toBe(false);
  });

  it('un final efface le partial du même speaker et s’ajoute', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'bonjour à', isFinal: false })));
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'bonjour à tous', isFinal: true })));

    expect(result.current.captions).toHaveLength(1);
    expect(result.current.captions[0].text).toBe('bonjour à tous');
    expect(result.current.captions[0].isFinal).toBe(true);
  });

  it('le partial d’un AUTRE speaker coexiste avec celui du premier', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ speakerId: 'speaker-1', translatedText: 'bonjour', isFinal: false })));
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ speakerId: 'speaker-2', translatedText: 'salut', isFinal: false })));

    expect(result.current.captions).toHaveLength(2);
  });

  it('la rétention est bornée à 4 lignes — la plus ancienne saute', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    act(() => {
      for (let i = 1; i <= 5; i += 1) {
        socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: `ligne ${i}`, isFinal: true }));
      }
    });

    expect(result.current.captions).toHaveLength(4);
    expect(result.current.captions[0].text).toBe('ligne 2');
    expect(result.current.captions[3].text).toBe('ligne 5');
  });

  it('l’overlay s’efface seul 6 s après le dernier segment', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment()));

    act(() => { jest.advanceTimersByTime(6_000); });

    expect(result.current.captions).toHaveLength(0);
  });

  it('chaque segment ré-arme la fenêtre d’effacement', () => {
    const { result } = renderHook(() => useCallCaptions(CALL_ID));
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'un' })));
    act(() => { jest.advanceTimersByTime(4_000); });

    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment({ translatedText: 'deux' })));
    act(() => { jest.advanceTimersByTime(4_000); });
    expect(result.current.captions.length).toBeGreaterThan(0);

    act(() => { jest.advanceTimersByTime(2_000); });
    expect(result.current.captions).toHaveLength(0);
  });

  it('un changement de callId vide les captions', () => {
    const { result, rerender } = renderHook(
      ({ callId }: { callId: string | null }) => useCallCaptions(callId),
      { initialProps: { callId: CALL_ID } },
    );
    act(() => socket.fire(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, segment()));

    rerender({ callId: 'call-next' });

    expect(result.current.captions).toHaveLength(0);
  });

  it('le démontage désabonne le listener', () => {
    const { unmount } = renderHook(() => useCallCaptions(CALL_ID));

    unmount();

    expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, expect.any(Function));
  });

  it('sans socket disponible les captions restent vides sans crasher', () => {
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useCallCaptions(CALL_ID));

    expect(result.current.captions).toHaveLength(0);
  });

  it('sans callId aucun listener n’est attaché', () => {
    renderHook(() => useCallCaptions(null));

    expect(socket.on).not.toHaveBeenCalled();
  });
});
