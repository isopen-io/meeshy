/**
 * @jest-environment jsdom
 *
 * Témoin du retour arrière optimiste (#4504).
 *
 * `usePreferences` fait un *optimistic update* dans `onMutate`, qui
 * sauvegarde `previousData` et le retourne. Mais dans
 * `@tanstack/react-query` v5 (`^5.101.4`, `apps/web/package.json`), ce
 * retour arrive au 3ᵉ paramètre positionnel d'`onError` — jamais au 4ᵉ, qui
 * est un objet interne de la librairie (`MutationFunctionContext`, sans
 * `previousData`). Lire le mauvais rang revient à ne JAMAIS déclencher le
 * rollback : le cache garde la valeur optimiste indéfiniment, y compris
 * après un rejet serveur.
 *
 * Ce fichier n'atteste PAS que l'appel réseau échoue (`__tests__/hooks/
 * use-preferences.test.tsx` couvre déjà les chemins nominaux) : il atteste
 * que l'échec, une fois survenu, EFFACE la valeur optimiste du cache — sur
 * les DEUX mutations (`PATCH` via `updatePreferences`, `PUT`-devenu-`PATCH
 * ?mode=replace` via `replacePreferences`). L'assertion porte sur le cache
 * RELU (`queryClient.getQueryData`), jamais sur l'état local d'un
 * composant : c'est précisément parce que le cache garde la valeur
 * optimiste que ce défaut restait invisible à toute assertion sur
 * `result.current.data` seul (React Query ne notifie pas nécessairement un
 * hook déjà démonté ou un composant qui ne relit pas le cache).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePreferences, getPreferenceQueryKey } from '@/hooks/use-preferences';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

jest.mock('@/lib/settings-sync', () => ({
  broadcastPreferenceUpdate: jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Rollback — updatePreferences (PATCH, mode=merge) ──────────────────────────

describe('usePreferences — retour arrière optimiste, chemin PATCH (#4504)', () => {
  it('un PATCH rejeté restaure la valeur PRÉCÉDENTE dans le cache relu', async () => {
    const baseline = { pushEnabled: true, soundEnabled: true };
    mockGet.mockResolvedValue({
      success: true,
      data: { success: true, data: { notification: baseline } },
    });
    mockPatch.mockRejectedValueOnce(new Error('network down'));

    const qc = makeQC();
    const key = getPreferenceQueryKey('notification');
    const { result } = renderHook(() => usePreferences<'notification'>('notification'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(qc.getQueryData(key)).toEqual(baseline);

    await act(async () => {
      await expect(
        result.current.updatePreferences({ pushEnabled: false })
      ).rejects.toThrow('network down');
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);

    // Le défaut #4504 : sans le correctif, cette assertion échoue — le cache
    // garde { pushEnabled: false, soundEnabled: true } (la valeur optimiste)
    // au lieu de revenir à `baseline`.
    expect(qc.getQueryData(key)).toEqual(baseline);
  });
});

// ─── Rollback — replacePreferences (PATCH ?mode=replace, ex-PUT) ───────────────

describe('usePreferences — retour arrière optimiste, chemin PUT/mode=replace (#4504)', () => {
  it('un PUT (PATCH ?mode=replace) rejeté restaure la valeur PRÉCÉDENTE dans le cache relu', async () => {
    const baseline = { theme: 'light' as const };
    mockGet.mockResolvedValue({
      success: true,
      data: { success: true, data: { application: baseline } },
    });
    mockPatch.mockRejectedValueOnce(new Error('server down'));

    const qc = makeQC();
    const key = getPreferenceQueryKey('application');
    const { result } = renderHook(() => usePreferences<'application'>('application'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(qc.getQueryData(key)).toEqual(baseline);

    await act(async () => {
      await expect(
        result.current.replacePreferences({ theme: 'dark' } as never)
      ).rejects.toThrow('server down');
    });

    expect(mockPatch).toHaveBeenCalledTimes(1);

    // Même défaut, second site (`replaceMutation.onError`) : un correctif
    // appliqué au seul chemin PATCH laisserait cette assertion rouge.
    expect(qc.getQueryData(key)).toEqual(baseline);
  });
});
