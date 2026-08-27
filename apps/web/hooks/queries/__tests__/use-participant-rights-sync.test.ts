/**
 * `useParticipantRightsSync` tient à jour la fiche ouverte d'un participant
 * quand un hôte modifie ses droits ailleurs — capacités ET, depuis #3877,
 * l'octroi d'historique par date.
 *
 * L'événement `participant:rights-updated` porte les DEUX à la fois
 * (`services/gateway/.../participants.ts` les pose côte à côte dans le même
 * payload) : un basculement de capacité ne doit pas écraser un
 * `historyVisibleFrom` que le serveur vient pourtant de réaffirmer.
 */

import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ParticipantRightsUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { queryKeys } from '@/lib/react-query/query-keys';
import type { ParticipantProfile } from '../use-participant-profile';

let capturedHandler: ((data: ParticipantRightsUpdatedEventData) => void) | null = null;
const mockOff = jest.fn();
const mockOn = jest.fn((_event: string, handler: (data: ParticipantRightsUpdatedEventData) => void) => {
  capturedHandler = handler;
});

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => ({ on: mockOn, off: mockOff }),
  },
}));

import { useParticipantRightsSync } from '../use-participant-rights-sync';

const CONVERSATION_ID = 'c1';
const PARTICIPANT_ID = 'p1';

const rights = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
  canViewHistory: false,
};

function baseProfile(overrides: Partial<ParticipantProfile> = {}): ParticipantProfile {
  return {
    participantId: PARTICIPANT_ID,
    conversationId: CONVERSATION_ID,
    isAnonymous: true,
    userId: null,
    username: 'ano_bob',
    displayName: 'ano_bob',
    firstName: 'Bob',
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
    entryCapabilities: rights,
    entryLink: null,
    historyVisibleFrom: null,
    canGrantHistory: false,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

afterEach(() => {
  jest.clearAllMocks();
  capturedHandler = null;
});

describe('useParticipantRightsSync — octroi d’historique', () => {
  it('pose l’octroi reçu, en plus des capacités', () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: null })
    );
    renderHook(() => useParticipantRightsSync(CONVERSATION_ID), { wrapper });

    act(() => {
      capturedHandler?.({
        conversationId: CONVERSATION_ID,
        participantId: PARTICIPANT_ID,
        updatedBy: 'admin-1',
        rights,
        historyVisibleFrom: '2026-01-15T00:00:00.000Z',
      });
    });

    const cached = queryClient.getQueryData<ParticipantProfile>(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
    );
    expect(cached?.historyVisibleFrom).toBe('2026-01-15T00:00:00.000Z');
  });

  it('retire l’octroi quand le serveur envoie `null`', () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: '2026-01-15T00:00:00.000Z' })
    );
    renderHook(() => useParticipantRightsSync(CONVERSATION_ID), { wrapper });

    act(() => {
      capturedHandler?.({
        conversationId: CONVERSATION_ID,
        participantId: PARTICIPANT_ID,
        updatedBy: 'admin-1',
        rights,
        historyVisibleFrom: null,
      });
    });

    const cached = queryClient.getQueryData<ParticipantProfile>(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
    );
    expect(cached?.historyVisibleFrom).toBeNull();
  });

  it('n’écrase pas un octroi déjà en cache quand l’événement ne le porte pas', () => {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      baseProfile({ historyVisibleFrom: '2026-01-15T00:00:00.000Z' })
    );
    renderHook(() => useParticipantRightsSync(CONVERSATION_ID), { wrapper });

    act(() => {
      // `historyVisibleFrom` absent (champ optionnel) — événement plus ancien
      // ou producteur qui ne le porte pas encore.
      capturedHandler?.({
        conversationId: CONVERSATION_ID,
        participantId: PARTICIPANT_ID,
        updatedBy: 'admin-1',
        rights,
      } as ParticipantRightsUpdatedEventData);
    });

    const cached = queryClient.getQueryData<ParticipantProfile>(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
    );
    expect(cached?.historyVisibleFrom).toBe('2026-01-15T00:00:00.000Z');
  });
});

/**
 * **`canViewHistory` peut MANQUER de la charge** (#4009, décision porteur du
 * 2026-08-27) : le gateway le retire de l'événement diffusé à la ROOM de
 * conversation — « qui a le droit de voir l'historique » est un fait de
 * modération, comme `historyVisibleFrom` que #3898 avait déjà retiré du même
 * payload.
 *
 * Or un HÔTE qui a la conversation ouverte reçoit **les deux** événements — la
 * charge réduite par la room, la charge complète par sa room personnelle — et
 * **leur ordre ne se suppose pas**. Ce handler recopiait `rights` EN BLOC :
 * la charge réduite effaçait donc `canViewHistory` de la fiche affichée, au
 * hasard de l'ordre d'arrivée.
 *
 * Même discriminant que pour `historyVisibleFrom` : la PRÉSENCE de la clé,
 * jamais sa valeur. Absente ⇒ on garde ce qu'on a.
 */
describe('useParticipantRightsSync — une capacité NON DITE ne s’efface pas (#4009)', () => {
  const { canViewHistory: _omitted, ...reducedRights } = rights;

  function syncWith(payload: Partial<ParticipantRightsUpdatedEventData>, seeded: ParticipantProfile) {
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID),
      seeded
    );
    renderHook(() => useParticipantRightsSync(CONVERSATION_ID), { wrapper });

    act(() => {
      capturedHandler?.({
        conversationId: CONVERSATION_ID,
        participantId: PARTICIPANT_ID,
        updatedBy: 'admin-1',
        rights: reducedRights,
        ...payload,
      } as ParticipantRightsUpdatedEventData);
    });

    return queryClient.getQueryData<ParticipantProfile>(
      queryKeys.conversations.participantProfile(CONVERSATION_ID, PARTICIPANT_ID)
    );
  }

  it('garde le `canViewHistory` déjà connu quand la charge ne le porte pas', () => {
    const seeded = baseProfile({ entryCapabilities: { ...rights, canViewHistory: true } });

    const cached = syncWith({}, seeded);

    expect(cached?.entryCapabilities?.canViewHistory).toBe(true);
  });

  it('applique bien les AUTRES droits de la charge réduite', () => {
    const seeded = baseProfile({ entryCapabilities: { ...rights, canViewHistory: true } });

    const cached = syncWith({ rights: { ...reducedRights, canSendFiles: true } as never }, seeded);

    expect(cached?.entryCapabilities?.canSendFiles).toBe(true);
    expect(cached?.entryCapabilities?.canViewHistory).toBe(true);
  });

  it('applique la valeur quand la charge la PORTE — la clé présente fait autorité', () => {
    const seeded = baseProfile({ entryCapabilities: { ...rights, canViewHistory: true } });

    const cached = syncWith({ rights: { ...reducedRights, canViewHistory: false } }, seeded);

    expect(cached?.entryCapabilities?.canViewHistory).toBe(false);
  });
});
