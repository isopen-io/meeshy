import { describe, expect, test } from 'bun:test';

import { scriptedGateway, scriptedTransport } from '@/test-support/scripted-transport';

import { decodeOnboardingState, loadOnboarding, patchOnboarding, ONBOARDING_QUERY_KEY, onboardingQueryOptions } from './onboarding';

/**
 * LE PORT DE L'ACCUEIL POST-INSCRIPTION (#7729) — `GET`/`PATCH
 * /api/v1/me/onboarding`, la forme déclarée par
 * `packages/shared/types/onboarding.ts` (`OnboardingStateSchema`).
 */

const PATH = '/api/v1/me/onboarding';

const served = (overrides: Record<string, unknown> = {}) => ({
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: '64b000000000000000000001',
  protectedRegime: false,
  storyDefaultVisibility: 'public',
  suggestions: [
    { id: 'u1', username: 'aicha', displayName: 'Aïcha', avatarUrl: null, languages: ['fr', 'ar'] },
  ],
  ...overrides,
});

describe('decodeOnboardingState — la frontière', () => {
  test('rend l’état servi, tel quel', () => {
    expect(decodeOnboardingState(served())).toEqual({
      eligible: true,
      completedAt: null,
      seenSteps: [],
      prefilledSteps: [],
      globalConversationId: '64b000000000000000000001',
      protectedRegime: false,
      storyDefaultVisibility: 'public',
      suggestions: [{ id: 'u1', username: 'aicha', displayName: 'Aïcha', avatarUrl: null, languages: ['fr', 'ar'] }],
    });
  });

  test('les champs de #7907/#7908/#7910 se lisent, et leur absence (serveur antérieur) aussi', () => {
    const extended = served({
      prefilledSteps: ['email'],
      emailVerified: true,
      canPublishStory: true,
      pendingFriendRequests: 2,
      stepRewards: { global: 28, story: 20, friendship: 14 },
    });
    const decoded = decodeOnboardingState(extended);
    expect({
      prefilledSteps: decoded?.prefilledSteps,
      emailVerified: decoded?.emailVerified,
      canPublishStory: decoded?.canPublishStory,
      pendingFriendRequests: decoded?.pendingFriendRequests,
      stepRewards: decoded?.stepRewards,
    }).toEqual({
      prefilledSteps: ['email'],
      emailVerified: true,
      canPublishStory: true,
      pendingFriendRequests: 2,
      stepRewards: { global: 28, story: 20, friendship: 14 },
    });
    expect(decodeOnboardingState(served())?.stepRewards).toBeUndefined();
  });

  test('un compte de demandes négatif ou des points hors forme : illisible', () => {
    expect(decodeOnboardingState(served({ pendingFriendRequests: -1 }))).toBeNull();
    expect(decodeOnboardingState(served({ stepRewards: { global: 1, story: 1 } }))).toBeNull();
  });

  test('une étape inconnue rend la charge ILLISIBLE, jamais une étape devinée', () => {
    expect(decodeOnboardingState(served({ seenSteps: ['languages', 'bonus'] }))).toBeNull();
  });

  test('une présence qui voyagerait à côté d’une suggestion est refusée (fail-closed)', () => {
    const leaking = served({
      suggestions: [{ id: 'u1', username: 'a', displayName: 'A', avatarUrl: null, languages: [], isOnline: true }],
    });
    expect(decodeOnboardingState(leaking)).toBeNull();
  });

  test('un régime protégé sans visibilité « friends » est refusé — la loi ne se relâche pas au client', () => {
    expect(decodeOnboardingState(served({ protectedRegime: true, storyDefaultVisibility: 'public' }))).toBeNull();
  });

  test('plus de six suggestions : illisible', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `u${i}`, username: `u${i}`, displayName: `U${i}`, avatarUrl: null, languages: [] }));
    expect(decodeOnboardingState(served({ suggestions: many }))).toBeNull();
  });
});

describe('loadOnboarding — GET /me/onboarding', () => {
  test('lit la route du contrat et rend l’état décodé', async () => {
    const { deps, calls } = scriptedGateway({ [`GET ${PATH}`]: { ok: true, data: served() } });
    const result = await loadOnboarding(deps);
    expect(result.ok && result.data.eligible).toBe(true);
    expect(calls()).toEqual([{ method: 'GET', path: PATH }]);
  });

  test('une charge illisible est un échec nommé', async () => {
    const { deps } = scriptedGateway({ [`GET ${PATH}`]: { ok: true, data: { eligible: 'oui' } } });
    const result = await loadOnboarding(deps);
    expect(result.ok ? null : result.code).toBe('UNREADABLE');
  });

  test('les fixtures servent un parcours éligible sans toucher le réseau', async () => {
    const { transport, calls } = scriptedTransport({});
    const result = await loadOnboarding({ source: 'fixtures', transport });
    expect(result.ok && result.data.eligible).toBe(true);
    expect(result.ok && result.data.suggestions.length).toBeGreaterThan(0);
    expect(calls()).toEqual([]);
  });
});

describe('patchOnboarding — PATCH /me/onboarding', () => {
  test('une étape part avec son issue, et l’état servi revient', async () => {
    const { deps, calls } = scriptedGateway({ [`PATCH ${PATH}`]: { ok: true, data: served({ seenSteps: ['languages'] }) } });
    const result = await patchOnboarding(deps, { step: 'languages', outcome: 'done' });
    expect(result.ok && result.data.seenSteps).toEqual(['languages']);
    expect(calls()).toEqual([{ method: 'PATCH', path: PATH, body: { step: 'languages', outcome: 'done' } }]);
  });

  test('« Passer tout » part en { finish: true }', async () => {
    const { deps, calls } = scriptedGateway({
      [`PATCH ${PATH}`]: { ok: true, data: served({ eligible: false, completedAt: '2026-09-24T10:00:00.000Z' }) },
    });
    const result = await patchOnboarding(deps, { finish: true });
    expect(result.ok && result.data.completedAt).toBe('2026-09-24T10:00:00.000Z');
    expect(calls()).toEqual([{ method: 'PATCH', path: PATH, body: { finish: true } }]);
  });

  test('en fixtures, l’étape est retenue pour la lecture suivante', async () => {
    const { transport } = scriptedTransport({});
    const deps = { source: 'fixtures' as const, transport };
    await patchOnboarding(deps, { step: 'global', outcome: 'skipped' });
    const after = await loadOnboarding(deps);
    expect(after.ok && after.data.seenSteps).toContain('global');
  });
});

describe('onboardingQueryOptions — cache d’abord', () => {
  test('clé stable sous l’espace « me », jamais relue à chaque focus', () => {
    const { transport } = scriptedTransport({});
    const options = onboardingQueryOptions({ source: 'fixtures', transport });
    expect(options.queryKey).toEqual(ONBOARDING_QUERY_KEY);
    expect(ONBOARDING_QUERY_KEY).toEqual(['me', 'onboarding']);
    expect(options.staleTime).toBeGreaterThan(0);
  });
});
