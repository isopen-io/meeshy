/**
 * useRemoteCallAlerts — parité web des alertes distantes du gateway
 * (audit appels 2026-07-11, solde parité web/android)
 *
 * Le gateway relaie deux side-channels que iOS et Android affichent déjà :
 * - `call:quality-alert` : le lien du PAIR se dégrade (jamais le lien local —
 *   le reporter est exclu du fanout). Indicateur transitoire, auto-effacé
 *   15 s après la dernière alerte (parité iOS scheduleRemoteQualityReset /
 *   Android CallQualityResetTimer) ; chaque alerte ré-arme la fenêtre.
 * - `call:screen-capture-alert` : le pair capture l'écran de l'appel
 *   (signal privacy, tenu jusqu'au capture-stopped ou la fin d'appel).
 *
 * Les deux sont gâtés strictement au callId actif : une alerte pour un autre
 * appel (fanout d'un appel en attente, trame retardataire) est inerte.
 */

import { renderHook, act } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useRemoteCallAlerts } from '@/hooks/use-remote-call-alerts';

const CALL_ID = 'call-alerts-1';

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

function qualityAlert(callId = CALL_ID) {
  return { callId, participantId: 'p2', metric: 'rtt', value: 412, threshold: 300 };
}

function captureAlert(isCapturing: boolean, callId = CALL_ID) {
  return { callId, participantId: 'p2', isCapturing };
}

describe('useRemoteCallAlerts', () => {
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

  it('une quality-alert de l’appel actif allume l’indicateur dégradé', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert()));

    expect(result.current.remoteQualityDegraded).toBe(true);
  });

  it('une quality-alert d’un autre appel est inerte', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert('other-call')));

    expect(result.current.remoteQualityDegraded).toBe(false);
  });

  it('l’indicateur dégradé s’auto-efface 15 s après la dernière alerte', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));
    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert()));

    act(() => { jest.advanceTimersByTime(15_000); });

    expect(result.current.remoteQualityDegraded).toBe(false);
  });

  it('une alerte soutenue ré-arme la fenêtre au lieu de s’effacer sur l’ancienne', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));
    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert()));
    act(() => { jest.advanceTimersByTime(10_000); });

    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert()));
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(result.current.remoteQualityDegraded).toBe(true);

    act(() => { jest.advanceTimersByTime(5_000); });
    expect(result.current.remoteQualityDegraded).toBe(false);
  });

  it('une screen-capture-alert de l’appel actif lève le drapeau privacy', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, captureAlert(true)));

    expect(result.current.remoteScreenCapturing).toBe(true);
  });

  it('un capture-stopped rabaisse le drapeau privacy', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));
    act(() => socket.fire(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, captureAlert(true)));

    act(() => socket.fire(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, captureAlert(false)));

    expect(result.current.remoteScreenCapturing).toBe(false);
  });

  it('une screen-capture-alert d’un autre appel est inerte', () => {
    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    act(() => socket.fire(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, captureAlert(true, 'other-call')));

    expect(result.current.remoteScreenCapturing).toBe(false);
  });

  it('un changement de callId remet les deux indicateurs à zéro', () => {
    const { result, rerender } = renderHook(
      ({ callId }: { callId: string | null }) => useRemoteCallAlerts(callId),
      { initialProps: { callId: CALL_ID } },
    );
    act(() => socket.fire(SERVER_EVENTS.CALL_QUALITY_ALERT, qualityAlert()));
    act(() => socket.fire(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, captureAlert(true)));

    rerender({ callId: 'call-next' });

    expect(result.current.remoteQualityDegraded).toBe(false);
    expect(result.current.remoteScreenCapturing).toBe(false);
  });

  it('le démontage désabonne les deux listeners', () => {
    const { unmount } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    unmount();

    expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_QUALITY_ALERT, expect.any(Function));
    expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_SCREEN_CAPTURE_ALERT, expect.any(Function));
  });

  it('sans socket disponible les indicateurs restent éteints sans crasher', () => {
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useRemoteCallAlerts(CALL_ID));

    expect(result.current.remoteQualityDegraded).toBe(false);
    expect(result.current.remoteScreenCapturing).toBe(false);
  });

  it('sans callId aucun listener n’est attaché', () => {
    renderHook(() => useRemoteCallAlerts(null));

    expect(socket.on).not.toHaveBeenCalled();
  });
});
