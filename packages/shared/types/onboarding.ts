import { z } from 'zod';

/**
 * Le contrat de l'onboarding post-inscription (#7729) — UNE forme pour la
 * passerelle (`GET`/`PATCH /api/v1/me/onboarding`), web-v2 et iOS.
 *
 * Source : docs/marketing/campagne-2026-09/onboarding-parcours.md § 2, § 3.
 *
 * L'état vit sur `User` : `onboardingCompletedAt DateTime?` (jamais de booléen
 * jumeau) et `onboardingSteps String[]` (les étapes VUES, faites ou passées).
 */

export const ONBOARDING_STEP_IDS = ['languages', 'global', 'story', 'friends', 'notifications'] as const;

export const OnboardingStepIdSchema = z.enum(ONBOARDING_STEP_IDS);
export type OnboardingStepId = z.infer<typeof OnboardingStepIdSchema>;

export const OnboardingStepOutcomeSchema = z.enum(['done', 'skipped']);
export type OnboardingStepOutcome = z.infer<typeof OnboardingStepOutcomeSchema>;

export const StoryDefaultVisibilitySchema = z.enum(['public', 'friends']);
export type StoryDefaultVisibility = z.infer<typeof StoryDefaultVisibilitySchema>;

/** Seuls les comptes créés à partir de ce jour reçoivent le parcours. */
export const ONBOARDING_START_AT = '2026-09-24T00:00:00.000Z';
/** Au-delà, un parcours non fini est clos par le serveur, sans insister. */
export const ONBOARDING_WINDOW_DAYS = 7;
export const ONBOARDING_MAX_SUGGESTIONS = 6;

/**
 * Un profil suggéré à l'étape « Trouve ta bande ». Strict : ni présence ni
 * `lastActiveAt` ni date de naissance ne peuvent voyager à côté.
 */
export const OnboardingSuggestionSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
    languages: z.array(z.string()),
  })
  .strict();
export type OnboardingSuggestion = z.infer<typeof OnboardingSuggestionSchema>;

export const OnboardingStateSchema = z
  .object({
    eligible: z.boolean(),
    completedAt: z.iso.datetime().nullable(),
    seenSteps: z.array(OnboardingStepIdSchema),
    prefilledSteps: z.array(OnboardingStepIdSchema),
    globalConversationId: z.string().nullable(),
    protectedRegime: z.boolean(),
    storyDefaultVisibility: StoryDefaultVisibilitySchema,
    suggestions: z.array(OnboardingSuggestionSchema).max(ONBOARDING_MAX_SUGGESTIONS),
  })
  .strict();
export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

export const OnboardingPatchBodySchema = z.union([
  z.object({ step: OnboardingStepIdSchema, outcome: OnboardingStepOutcomeSchema }).strict(),
  z.object({ finish: z.literal(true) }).strict(),
]);
export type OnboardingPatchBody = z.infer<typeof OnboardingPatchBodySchema>;

export const isOnboardingStepId = (value: string): value is OnboardingStepId =>
  (ONBOARDING_STEP_IDS as readonly string[]).includes(value);

/**
 * Les étapes vues, plus `step` : sans doublon, dans l'ordre du parcours, et
 * sans ce que la base porterait d'inconnu.
 */
export function addOnboardingStep(seen: readonly string[], step: OnboardingStepId): OnboardingStepId[] {
  const present = new Set<string>([...seen, step]);
  return ONBOARDING_STEP_IDS.filter((id) => present.has(id));
}
