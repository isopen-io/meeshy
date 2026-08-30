/**
 * @jest-environment jsdom
 *
 * Tests for hooks/use-preferences.ts (#4181)
 *
 * Les trois appels réseau du hook parlaient chacun à leur propre alias
 * `/me/preferences/{catégorie}` (GET, PATCH, PUT). Ils parlent désormais à LA
 * route unifiée `/me/preferences` — `?categories=` pour lire, `PATCH` (avec
 * `mode=replace` pour l'ancien PUT) pour écrire — et la réponse range son
 * document sous le NOM de la catégorie plutôt que de l'être elle-même. Ce
 * fichier garde deux choses : que ce déballage est correct, et que le contrat
 * PUBLIC du hook (par catégorie) ne bouge pas d'un pouce pour ses appelants
 * (`ApplicationSettings`, `PrivacySettings`, `MessageSettings`…).
 */

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePreferences } from '@/hooks/use-preferences';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockGet = jest.fn();
const mockPatch = jest.fn();

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

const mockBroadcastPreferenceUpdate = jest.fn();
jest.mock('@/lib/settings-sync', () => ({
  broadcastPreferenceUpdate: (...args: unknown[]) => mockBroadcastPreferenceUpdate(...args),
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

// ─── GET — critère 1 : plus jamais d'alias par catégorie ──────────────────────

describe('usePreferences — GET (#4181)', () => {
  it('lit UNE catégorie via la route unifiée et déballe le document sous son nom', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { success: true, data: { notification: { pushEnabled: false, soundEnabled: true } } },
    });

    const qc = makeQC();
    const { result } = renderHook(() => usePreferences<'notification'>('notification'), {
      wrapper: wrapper(qc),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGet).toHaveBeenCalledWith('/api/v1/me/preferences', { categories: 'notification' });
    expect(result.current.data).toEqual({ pushEnabled: false, soundEnabled: true });
  });

  it('ne parle plus JAMAIS à `/me/preferences/{catégorie}`', async () => {
    mockGet.mockResolvedValue({ success: true, data: { success: true, data: { audio: {} } } });
    const qc = makeQC();
    renderHook(() => usePreferences<'audio'>('audio'), { wrapper: wrapper(qc) });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const [endpoint] = mockGet.mock.calls[0];
    expect(endpoint).toBe('/api/v1/me/preferences');
    expect(endpoint).not.toMatch(/\/me\/preferences\/audio/);
  });

  it("surface l'erreur quand la route répond `success:false`", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { success: false, error: 'FETCH_ERROR', message: 'Failed to fetch preferences' },
    });

    const qc = makeQC();
    const { result } = renderHook(() => usePreferences<'notification'>('notification'), {
      wrapper: wrapper(qc),
    });

    // Le hook retente une fois avant de renoncer (`retry: failureCount < 2`,
    // hors 403) : laisser à `waitFor` le temps du backoff EXPONENTIEL par
    // défaut de React Query, nettement au-dessus du délai par défaut de RTL.
    await waitFor(() => expect(result.current.error).not.toBeNull(), { timeout: 8000 });
    expect(result.current.error?.message).toBe('Failed to fetch preferences');
  }, 10000);
});

// ─── updatePreferences — mode=merge (défaut) ───────────────────────────────────

describe('usePreferences — updatePreferences, mode=merge (#4181)', () => {
  it('PATCH la route unifiée avec un corps clé PAR CATÉGORIE, et déballe la réponse', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { success: true, data: { notification: { pushEnabled: true, soundEnabled: true } } },
    });
    mockPatch.mockResolvedValue({
      success: true,
      data: { success: true, data: { notification: { pushEnabled: false, soundEnabled: true } } },
    });

    const qc = makeQC();
    const { result } = renderHook(() => usePreferences<'notification'>('notification'), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let updated: unknown;
    await act(async () => {
      updated = await result.current.updatePreferences({ pushEnabled: false });
    });

    // Pas de query string : `mode=merge` est le défaut de la route (#4181).
    expect(mockPatch).toHaveBeenCalledWith('/api/v1/me/preferences', {
      notification: { pushEnabled: false },
    });
    expect(updated).toEqual({ pushEnabled: false, soundEnabled: true });

    // La forme mise en cache est celle DÉBALLÉE — un appelant qui relit
    // `data` après l'écriture doit voir le document, pas l'enveloppe multi-
    // catégories que la route sert désormais. `waitFor` : la propagation du
    // cache React Query vers ce rendu n'est pas garantie synchrone avec la
    // résolution de `mutateAsync`.
    await waitFor(() =>
      expect(result.current.data).toEqual({ pushEnabled: false, soundEnabled: true })
    );
    expect(mockBroadcastPreferenceUpdate).toHaveBeenCalledWith('notification');
  });
});

// ─── replacePreferences — mode=replace (remplace l'ancien PUT) ────────────────

describe('usePreferences — replacePreferences, mode=replace (#4181)', () => {
  it("PATCH `?mode=replace` avec le document COMPLET — la route n'a plus de PUT", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { success: true, data: { application: { theme: 'light' } } },
    });
    mockPatch.mockResolvedValue({
      success: true,
      data: { success: true, data: { application: { theme: 'dark' } } },
    });

    const qc = makeQC();
    const { result } = renderHook(() => usePreferences<'application'>('application'), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.replacePreferences({ theme: 'dark' } as never);
    });

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/me/preferences?mode=replace', {
      application: { theme: 'dark' },
    });
  });
});
