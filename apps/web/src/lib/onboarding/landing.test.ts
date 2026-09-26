import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { OnboardingState } from '@meeshy/shared/types/onboarding';

import { ONBOARDING_QUERY_KEY } from '@/lib/api/onboarding';

import { createOnboardingLanding, shouldOfferOnboarding } from './landing';
import { takeOnboardingWaiver, waiveNextOnboardingOffer } from './landing-waiver';

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

describe('shouldOfferOnboarding — la loi, pure', () => {
  const base = { source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list' } as const;

  test('un compte éligible qui arrive sur l’accueil y est mené', () => {
    expect(shouldOfferOnboarding({ ...base, state: state() })).toBe(true);
  });

  test('jamais un compte non éligible, ni un parcours fini', () => {
    expect(shouldOfferOnboarding({ ...base, state: state({ eligible: false }) })).toBe(false);
    expect(shouldOfferOnboarding({ ...base, state: state({ completedAt: '2026-09-24T10:00:00.000Z' }) })).toBe(false);
  });

  test('ni un invité, ni un visiteur, ni en fixtures (le POC et ses captures ne sont jamais détournés)', () => {
    expect(shouldOfferOnboarding({ ...base, sessionStatus: 'guest', state: state() })).toBe(false);
    expect(shouldOfferOnboarding({ ...base, sessionStatus: 'anonymous', state: state() })).toBe(false);
    expect(shouldOfferOnboarding({ ...base, source: 'fixtures', state: state() })).toBe(false);
  });

  test('seulement depuis l’accueil : un lien profond (une invitation, un fil) n’est jamais détourné', () => {
    expect(shouldOfferOnboarding({ ...base, routeKey: 'thread', state: state() })).toBe(false);
    expect(shouldOfferOnboarding({ ...base, routeKey: 'chatJoin', state: state() })).toBe(false);
  });

  test('sans état connu : rien', () => {
    expect(shouldOfferOnboarding({ ...base, state: undefined })).toBe(false);
  });
});

describe('createOnboardingLanding — cache d’abord, une fois par lancement', () => {
  const fixture = () => {
    takeOnboardingWaiver();
    const queryClient = new QueryClient();
    const visits: string[] = [];
    let loads = 0;
    const landing = createOnboardingLanding({
      queryClient,
      load: async () => {
        loads += 1;
        return state();
      },
      navigate: (path) => visits.push(path),
    });
    return { queryClient, visits, loads: () => loads, landing };
  };

  test('un état en cache mène sans attendre le réseau', async () => {
    const { queryClient, visits, loads, landing } = fixture();
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state());
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' });
    expect(visits).toEqual(['/onboarding']);
    expect(loads()).toBe(0);
  });

  test('un cache PÉRIMÉ (persisté depuis une heure) ne décide pas : le serveur relu tranche', async () => {
    const queryClient = new QueryClient();
    const visits: string[] = [];
    let loads = 0;
    const landing = createOnboardingLanding({
      queryClient,
      load: async () => {
        loads += 1;
        return state({ eligible: false, completedAt: '2026-09-24T09:00:00.000Z' });
      },
      navigate: (path) => visits.push(path),
    });
    queryClient.setQueryData(ONBOARDING_QUERY_KEY, state(), { updatedAt: Date.now() - 60 * 60_000 });
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' });
    expect(loads).toBe(1);
    expect(visits).toEqual([]);
  });

  test('sans cache, l’état se lit puis décide', async () => {
    const { visits, loads, landing } = fixture();
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' });
    expect(loads()).toBe(1);
    expect(visits).toEqual(['/onboarding']);
  });

  test('une seule proposition par lancement et par compte : revenir à l’accueil ne ramène pas le parcours', async () => {
    const { visits, landing } = fixture();
    const at = { source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' } as const;
    await landing.offer(at);
    await landing.offer(at);
    expect(visits).toEqual(['/onboarding']);
  });

  test('une lecture qui échoue ne mène nulle part et ne lève pas', async () => {
    const queryClient = new QueryClient();
    const visits: string[] = [];
    const landing = createOnboardingLanding({
      queryClient,
      load: async () => {
        throw new Error('hors ligne');
      },
      navigate: (path) => visits.push(path),
    });
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' });
    expect(visits).toEqual([]);
  });

  test('une arrivée CÉLÉBRÉE par le lien (#8088) mène aux conversations : le parcours ne s’y substitue pas, ni ensuite dans ce lancement', async () => {
    const { visits, loads, landing } = fixture();
    const at = { source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' } as const;
    waiveNextOnboardingOffer();
    await landing.offer(at);
    await landing.offer(at);
    expect(visits).toEqual([]);
    expect(loads()).toBe(0);
  });

  test('la renonciation ne vaut qu’UNE arrivée : un autre compte, plus tard, se voit proposer le parcours', async () => {
    const { visits, landing } = fixture();
    waiveNextOnboardingOffer();
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'me' });
    await landing.offer({ source: 'gateway', sessionStatus: 'authenticated', routeKey: 'list', viewerId: 'autre' });
    expect(visits).toEqual(['/onboarding']);
  });
});
