/**
 * `useLentilleListTyping` — WL-101 (LWS-10).
 *
 * Re-preuve du service (protocole §2, RE-PROUVER) : le fil relaie ses
 * événements typing via `useSocketIOMessaging({ onUserTyping })`
 * (`ConversationLayout.tsx:358-365` → `hooks/use-socketio-messaging.ts:147`).
 * Ce hook s'abonne au MÊME point — on le vérifie ici en interceptant l'appel
 * à `useSocketIOMessaging` et en rejouant manuellement le callback
 * `onUserTyping` qu'il enregistre, exactement comme le service socket le
 * ferait à la réception d'un événement `typing:start`/`typing:stop`.
 */
import { renderHook, act } from '@testing-library/react';

type OnUserTyping = (userId: string, username: string, isTyping: boolean, conversationId: string) => void;

let capturedOnUserTyping: OnUserTyping | undefined;

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: jest.fn((options: { onUserTyping?: OnUserTyping }) => {
    capturedOnUserTyping = options.onUserTyping;
    return {};
  }),
}));

import { useLentilleListTyping } from '../use-lentille-list-typing';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';

describe('useLentilleListTyping', () => {
  beforeEach(() => {
    capturedOnUserTyping = undefined;
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('appelle useSocketIOMessaging — même service que le fil', () => {
    renderHook(() => useLentilleListTyping('me'));

    expect(useSocketIOMessaging).toHaveBeenCalledTimes(1);
    expect(capturedOnUserTyping).toBeInstanceOf(Function);
  });

  it("ajoute un utilisateur distant qui tape, pour SA conversation", () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });

    expect(result.current.get('conv-1')).toEqual([{ userId: 'user-2', displayName: 'Jane' }]);
  });

  it('ignore son propre écho (userId === currentUserId)', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('me', 'Moi', true, 'conv-1');
    });

    expect(result.current.size).toBe(0);
  });

  it('retire un utilisateur sur typing:stop explicite', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });
    expect(result.current.get('conv-1')).toHaveLength(1);

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', false, 'conv-1');
    });
    expect(result.current.get('conv-1')).toBeUndefined();
  });

  it('tient l\'état PAR conversation — n\'affecte pas les autres conversations', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
      capturedOnUserTyping?.('user-3', 'John', true, 'conv-2');
    });

    expect(result.current.get('conv-1')).toEqual([{ userId: 'user-2', displayName: 'Jane' }]);
    expect(result.current.get('conv-2')).toEqual([{ userId: 'user-3', displayName: 'John' }]);
  });

  it('retire automatiquement après le filet de sécurité si aucun stop n\'arrive (8s)', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });
    expect(result.current.get('conv-1')).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(result.current.get('conv-1')).toBeUndefined();
  });

  it('un keepalive typing:start réarme le filet de sécurité (pas de retrait prématuré)', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });

    act(() => {
      jest.advanceTimersByTime(6000);
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
      jest.advanceTimersByTime(6000);
    });

    // 12s écoulées au total, mais le keepalive à 6s a réarmé le filet à 8s :
    // l'utilisateur est donc TOUJOURS présent (6s après le keepalive < 8s).
    expect(result.current.get('conv-1')).toHaveLength(1);
  });

  it('n\'ajoute pas deux fois le même utilisateur pour la même conversation', () => {
    const { result } = renderHook(() => useLentilleListTyping('me'));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });

    expect(result.current.get('conv-1')).toHaveLength(1);
  });

  it('sans currentUserId, ignore tout événement (garde défensive, comme le fil)', () => {
    const { result } = renderHook(() => useLentilleListTyping(null));

    act(() => {
      capturedOnUserTyping?.('user-2', 'Jane', true, 'conv-1');
    });

    expect(result.current.size).toBe(0);
  });
});
