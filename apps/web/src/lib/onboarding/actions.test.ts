import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { OnboardingState } from '@/lib/api/onboarding';

import { ONBOARDING_QUERY_KEY } from '@/lib/api/onboarding';
import { scriptedGateway } from '@/test-support/scripted-transport';

import { declareAge, finishJourney, recordStep } from './actions';

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

describe('declareAge — la date part une fois, la restriction servie gagne le cache (#9928)', () => {
  const PUT = 'PUT /api/v1/me/birth-date';

  test('un mineur : le cache de l’accueil porte la restriction, la liste des conversations se relit', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state({ viewerWriteRestriction: null }));
    queryClient.setQueryData(['conversations'], { pages: [], pageParams: [] });
    const { deps } = scriptedGateway({ [PUT]: { ok: true, data: { ageClass: 'minor', viewerWriteRestrictionGlobal: true } } });

    expect(await declareAge({ ...deps, queryClient }, '2011-01-01')).toEqual({ kind: 'saved', minorGlobal: true });
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.viewerWriteRestriction).toBe('minor-global');
    expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(true);
  });

  test('un majeur : aucune restriction, rien d’autre à relire', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state({ viewerWriteRestriction: null }));
    queryClient.setQueryData(['conversations'], { pages: [], pageParams: [] });
    const { deps } = scriptedGateway({ [PUT]: { ok: true, data: { ageClass: 'adult', viewerWriteRestrictionGlobal: false } } });

    expect(await declareAge({ ...deps, queryClient }, '1990-01-01')).toEqual({ kind: 'saved', minorGlobal: false });
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.viewerWriteRestriction).toBeNull();
    expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(false);
  });

  test('un refus ne touche pas le cache', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state({ viewerWriteRestriction: null }));
    const { deps } = scriptedGateway({ [PUT]: { ok: false, status: 422, error: 'trop jeune', code: 'AGE_BELOW_MINIMUM' } });

    expect(await declareAge({ ...deps, queryClient }, '2020-01-01')).toEqual({ kind: 'below-minimum' });
    expect(queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY)?.viewerWriteRestriction).toBeNull();
  });
});
