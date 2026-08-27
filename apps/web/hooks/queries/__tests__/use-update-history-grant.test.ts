/**
 * `useUpdateHistoryGrant` pose ou retire l'octroi d'historique par DATE sur un
 * participant — un levier distinct de `useUpdateParticipantRights` : il vaut
 * pour TOUT participant (inscrit compris), et sa PATCH ne porte qu'un seul
 * champ, `historyVisibleFrom`.
 *
 * L'écriture est optimiste : le cache doit refléter le choix avant la réponse
 * réseau, et revenir à l'instantané d'avant si le serveur refuse.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

jest.mock('@/services/api.service', () => ({
  apiService: { patch: jest.fn() },
}));

import { apiService } from '@/services/api.service';
import { useUpdateHistoryGrant } from '../use-update-history-grant';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { ParticipantProfile } from '../use-participant-profile';

const mockPatch = apiService.patch as jest.Mock;

const CONVERSATION_ID = 'c1';
const PARTICIPANT_ID = 'p1';

function baseProfile(overrides: Partial<ParticipantProfile> = {}): ParticipantProfile {
  return {
    participantId: PARTICIPANT_ID,
    conversationId: CONVERSATION_ID,
    isAnonymous: false,
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice',
    firstName: null,
    lastName: null,
    avatar: null,
    language: 'fr',
    country: null,
    conversationRole: 'member',
    joinedAt: '2026-08-18T09:00:00Z',
    isOnline: false,
    lastActiveAt: null,
    shareLinkName: null,
    hasEmail: false,
    hasBirthday: false,
    email: null,
    birthday: null,
    entryCapabilities: null,
    entryLink: null,
    historyVisibleFrom: null,
    canGrantHistory: true,
    ...overrides,
  };
}

function createWrapper() {
  // Pas de `gcTime: 0` : cette suite pose des données via `setQueryData` SANS
  // jamais monter `useParticipantProfile` (aucun observateur de la clé), donc
  // avec un `gcTime` nul le ramasse-miettes purge l'entrée avant même que le
  // premier test asynchrone (`waitFor`) ne la relise.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('useUpdateHistoryGrant', () => {
  it('PATCH le seul champ `historyVisibleFrom`, jamais les capacités', async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: { participantId: PARTICIPANT_ID, conversationId: CONVERSATION_ID, historyVisibleFrom: '2026-01-15T00:00:00.000Z' },
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistoryGrant(CONVERSATION_ID, PARTICIPANT_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('2026-01-15T00:00:00.000Z');
    });

    expect(mockPatch).toHaveBeenCalledWith(
      `/conversations/${CONVERSATION_ID}/participants/${PARTICIPANT_ID}/rights`,
      { historyVisibleFrom: '2026-01-15T00:00:00.000Z' }
    );
  });

  it('pose l’octroi de façon optimiste — avant la réponse réseau', async () => {
    let resolvePatch: (value: unknown) => void = () => {};
    mockPatch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }));

    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: null })
    );
    const { result } = renderHook(() => useUpdateHistoryGrant(CONVERSATION_ID, PARTICIPANT_ID), { wrapper });

    act(() => {
      result.current.mutate('2026-01-15T00:00:00.000Z');
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<ParticipantProfile>(
        queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
      );
      expect(cached?.historyVisibleFrom).toBe('2026-01-15T00:00:00.000Z');
    });

    resolvePatch({ success: true, data: { participantId: PARTICIPANT_ID, conversationId: CONVERSATION_ID, historyVisibleFrom: '2026-01-15T00:00:00.000Z' } });
  });

  it('reste la vérité serveur à la réussite — même valeur, écrite plutôt qu’invalidée', async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: { participantId: PARTICIPANT_ID, conversationId: CONVERSATION_ID, historyVisibleFrom: '2026-02-01T00:00:00.000Z' },
    });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: null })
    );
    const { result } = renderHook(() => useUpdateHistoryGrant(CONVERSATION_ID, PARTICIPANT_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('2026-02-01T00:00:00.000Z');
    });

    const cached = queryClient.getQueryData<ParticipantProfile>(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
    );
    expect(cached?.historyVisibleFrom).toBe('2026-02-01T00:00:00.000Z');
  });

  it('retire l’octroi avec `null`', async () => {
    mockPatch.mockResolvedValue({
      success: true,
      data: { participantId: PARTICIPANT_ID, conversationId: CONVERSATION_ID, historyVisibleFrom: null },
    });
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateHistoryGrant(CONVERSATION_ID, PARTICIPANT_ID), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(null);
    });

    expect(mockPatch).toHaveBeenCalledWith(
      `/conversations/${CONVERSATION_ID}/participants/${PARTICIPANT_ID}/rights`,
      { historyVisibleFrom: null }
    );
  });

  it('reprend l’instantané d’avant en cas d’échec — jamais un octroi que personne n’a', async () => {
    mockPatch.mockResolvedValue({ success: false, error: 'forbidden' });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: null })
    );
    const { result } = renderHook(() => useUpdateHistoryGrant(CONVERSATION_ID, PARTICIPANT_ID), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync('2026-01-15T00:00:00.000Z');
      } catch {
        // attendu — la mutation rejette sur `success: false`
      }
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<ParticipantProfile>(
        queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
      );
      expect(cached?.historyVisibleFrom).toBeNull();
    });
  });
});
