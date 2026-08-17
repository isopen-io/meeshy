/**
 * WL-105 (LWS-10) — `useLentilleBridges`, le pont ✦ via le substitut LOCAL
 * gelé (`LocalBridgeProvider`, LWS-2bis).
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useLentilleBridges } from '../use-lentille-bridges';
import type { LocalBridgeCacheReading } from '@meeshy/shared/providers/local/LocalBridgeProvider';

describe('useLentilleBridges', () => {
  it('rend `null` pour toute conversation en production (aucun cache de messages web ne couvre la liste entière)', async () => {
    const { result } = renderHook(() =>
      useLentilleBridges([{ id: 'conv-1', unreadCount: 5 }], 'user-1')
    );

    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('conv-1')).toBeNull();
  });

  it('résout un VRAI pont via `LocalBridgeProvider` dès qu’un cache est injecté (preuve du câblage bout-en-bout, leçon 257)', async () => {
    const cacheReading: LocalBridgeCacheReading = {
      getUnreadWindow: () => ({ windowCoversUnread: true }),
      getCachedMessages: () => [
        { senderId: 'user-2', senderName: 'Bob', attachments: [] },
      ],
    };

    const { result } = renderHook(() =>
      useLentilleBridges([{ id: 'conv-1', unreadCount: 1 }], 'user-1', cacheReading)
    );

    await waitFor(() => expect(result.current.get('conv-1')).not.toBeUndefined());
    const bridge = result.current.get('conv-1');
    expect(bridge?.kind).toBe('fallback');
    expect(bridge?.data?.authors).toEqual(['Bob']);
  });

  it('rend une carte vide sans lecteur connu', async () => {
    const { result } = renderHook(() => useLentilleBridges([{ id: 'conv-1' }], null));
    await waitFor(() => expect(result.current.size).toBe(0));
  });
});
