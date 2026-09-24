import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEP_IDS,
  OnboardingPatchBodySchema,
  OnboardingStateSchema,
  addOnboardingStep,
} from '../onboarding';

const state = {
  eligible: true,
  completedAt: null,
  seenSteps: ['languages'],
  prefilledSteps: [],
  globalConversationId: '68a000000000000000000009',
  protectedRegime: true,
  storyDefaultVisibility: 'friends',
  suggestions: [
    { id: '68a000000000000000000002', username: 'nova', displayName: 'Nova', avatarUrl: null, languages: ['fr'] },
  ],
};

describe('le contrat d\'onboarding (#7729)', () => {
  it('déclare les cinq étapes dans l\'ordre du parcours', () => {
    expect(ONBOARDING_STEP_IDS).toEqual(['languages', 'global', 'story', 'friends', 'notifications']);
  });

  it('accepte un état complet', () => {
    expect(OnboardingStateSchema.safeParse(state).success).toBe(true);
  });

  it('refuse une étape inconnue et plus de six suggestions', () => {
    expect(OnboardingStateSchema.safeParse({ ...state, seenSteps: ['tutorial'] }).success).toBe(false);
    const seven = Array.from({ length: 7 }, () => state.suggestions[0]);
    expect(OnboardingStateSchema.safeParse({ ...state, suggestions: seven }).success).toBe(false);
  });

  it('refuse une suggestion qui transporterait la présence', () => {
    const withPresence = [{ ...state.suggestions[0], isOnline: true, lastActiveAt: '2026-09-24T10:00:00.000Z' }];
    expect(OnboardingStateSchema.safeParse({ ...state, suggestions: withPresence }).success).toBe(false);
  });

  it('accepte { step, outcome } et { finish: true }, rien d\'autre', () => {
    expect(OnboardingPatchBodySchema.safeParse({ step: 'global', outcome: 'done' }).success).toBe(true);
    expect(OnboardingPatchBodySchema.safeParse({ step: 'story', outcome: 'skipped' }).success).toBe(true);
    expect(OnboardingPatchBodySchema.safeParse({ finish: true }).success).toBe(true);
    expect(OnboardingPatchBodySchema.safeParse({ finish: false }).success).toBe(false);
    expect(OnboardingPatchBodySchema.safeParse({ step: 'global', outcome: 'maybe' }).success).toBe(false);
    expect(OnboardingPatchBodySchema.safeParse({ step: 'global', outcome: 'done', finish: true }).success).toBe(false);
    expect(OnboardingPatchBodySchema.safeParse({}).success).toBe(false);
  });

  it('ajoute une étape sans doublon et range dans l\'ordre du parcours', () => {
    expect(addOnboardingStep(['story', 'languages'], 'global')).toEqual(['languages', 'global', 'story']);
    expect(addOnboardingStep(['languages', 'global'], 'global')).toEqual(['languages', 'global']);
  });

  it('écarte une valeur inconnue relue de la base', () => {
    expect(addOnboardingStep(['languages', 'legacy'], 'friends')).toEqual(['languages', 'friends']);
  });
});
