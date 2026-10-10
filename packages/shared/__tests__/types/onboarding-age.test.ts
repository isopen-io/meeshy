import { describe, it, expect } from 'vitest';
import {
  BirthDateDeclarationBodySchema,
  BirthDateDeclarationResultSchema,
  ONBOARDING_COMPLETION_STEP_IDS,
  ONBOARDING_STEP_IDS,
  OnboardingStateSchema,
  addOnboardingStep,
} from '../../types/onboarding.js';
import { ErrorCode, ErrorStatusMap } from '../../types/errors.js';

const baseState = {
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: null,
  protectedRegime: true,
  storyDefaultVisibility: 'friends',
  suggestions: [],
} as const;

describe('l’étape d’âge de l’onboarding (#9927)', () => {
  it('existe, juste après les langues', () => {
    expect(ONBOARDING_STEP_IDS.indexOf('age')).toBe(ONBOARDING_STEP_IDS.indexOf('languages') + 1);
  });

  it('est FACULTATIVE : elle ne compte pas pour clore le parcours', () => {
    expect((ONBOARDING_COMPLETION_STEP_IDS as readonly string[]).includes('age')).toBe(false);
  });

  it('se range à sa place parmi les étapes vues', () => {
    expect(addOnboardingStep(['languages', 'global'], 'age')).toEqual(['languages', 'age', 'global']);
  });

  it('l’état peut dire que Global est en lecture seule pour le lecteur — ou ne rien dire', () => {
    expect(OnboardingStateSchema.safeParse({ ...baseState, viewerWriteRestriction: 'minor-global' }).success).toBe(true);
    expect(OnboardingStateSchema.safeParse({ ...baseState, viewerWriteRestriction: null }).success).toBe(true);
    expect(OnboardingStateSchema.safeParse(baseState).success).toBe(true);
    expect(OnboardingStateSchema.safeParse({ ...baseState, viewerWriteRestriction: 'adult' }).success).toBe(false);
  });
});

describe('PUT /me/birth-date — le contrat', () => {
  it('le corps est un jour AAAA-MM-JJ, et rien d’autre', () => {
    expect(BirthDateDeclarationBodySchema.safeParse({ birthDate: '2010-04-01' }).success).toBe(true);
    expect(BirthDateDeclarationBodySchema.safeParse({ birthDate: '2010-04-31' }).success).toBe(false);
    expect(BirthDateDeclarationBodySchema.safeParse({ birthDate: '2010-04-01T00:00:00Z' }).success).toBe(false);
    expect(BirthDateDeclarationBodySchema.safeParse({ birthDate: '2010-04-01', role: 'ADMIN' }).success).toBe(false);
  });

  it('la réponse dit la classe d’âge et si Global est fermée en écriture', () => {
    expect(BirthDateDeclarationResultSchema.safeParse({ ageClass: 'minor', viewerWriteRestrictionGlobal: true }).success).toBe(true);
    expect(BirthDateDeclarationResultSchema.safeParse({ ageClass: 'unknown', viewerWriteRestrictionGlobal: false }).success).toBe(false);
  });
});

describe('les codes d’erreur de la règle des 13-17 ans', () => {
  it('portent leur statut HTTP', () => {
    expect(ErrorStatusMap[ErrorCode.GLOBAL_ADULTS_ONLY]).toBe(403);
    expect(ErrorStatusMap[ErrorCode.AGE_BELOW_MINIMUM]).toBe(422);
    expect(ErrorStatusMap[ErrorCode.BIRTH_DATE_ALREADY_SET]).toBe(409);
  });
});
