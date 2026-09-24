import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { OnboardingState } from '@meeshy/shared/types/onboarding';

import { ONBOARDING_QUERY_KEY } from '@/lib/api/onboarding';
import { scriptedGateway } from '@/test-support/scripted-transport';

import { finishJourney, recordStep } from './actions';

const PATCH = 'PATCH /api/v1/me/onboarding';

const state = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: 'g1',
  protectedRegime: false,
  storyDefaultVisibility: 'public',
  suggestions: [],
  ...overrides,
});

describe('recordStep — l’étape vue s’écrit au geste, la passerelle confirme ensuite', () => {
  test('le cache porte l’étape AVANT la réponse, puis l’état servi', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state());
    const { deps, calls } = scriptedGateway({ [PATCH]: { ok: true, data: state({ seenSteps: ['languages'], prefilledSteps: ['story'] }) } });

    const pending = recordStep({ ...deps, queryClient }, 'languages', 'done');
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.seenSteps).toEqual(['languages']);
    expect(await pending).toBe(true);
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.prefilledSteps).toEqual(['story']);
    expect(calls()).toEqual([{ method: 'PATCH', path: '/api/v1/me/onboarding', body: { step: 'languages', outcome: 'done' } }]);
  });

  test('un échec garde l’étape vue localement : on ne fait pas revenir une carte déjà quittée', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state());
    const { deps } = scriptedGateway({ [PATCH]: { ok: false, status: 0, error: 'hors ligne' } });

    expect(await recordStep({ ...deps, queryClient }, 'global', 'skipped')).toBe(false);
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.seenSteps).toEqual(['global']);
  });
});

describe('finishJourney — « Passer tout » et la fin du récapitulatif', () => {
  test('le parcours est clos dans le cache au geste, et part en { finish: true }', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state());
    const { deps, calls } = scriptedGateway({ [PATCH]: { ok: true, data: state({ eligible: false, completedAt: '2026-09-24T10:00:00.000Z' }) } });

    const pending = finishJourney({ ...deps, queryClient });
    const optimistic = queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY);
    expect(optimistic?.eligible).toBe(false);
    expect(optimistic?.completedAt).not.toBeNull();
    await pending;
    expect(calls()).toEqual([{ method: 'PATCH', path: '/api/v1/me/onboarding', body: { finish: true } }]);
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.completedAt).toBe('2026-09-24T10:00:00.000Z');
  });
});
