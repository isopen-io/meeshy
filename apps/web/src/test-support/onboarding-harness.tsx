import { act } from 'react';
import { QueryClient } from '@tanstack/react-query';

import type { OnboardingPatchBody, OnboardingState, OnboardingStepId, OnboardingSuggestion } from '@meeshy/shared/types/onboarding';

import type { HttpRequest } from '@/lib/api/http';
import { ONBOARDING_QUERY_KEY } from '@/lib/api/onboarding';
import { sessionStore } from '@/lib/api/session';
import type { ScoreMark } from '@/lib/onboarding/journey';
import { createJourneyProgressStore } from '@/lib/onboarding/progress-store';
import type { GreetingSend } from '@/routes/onboarding-cards';
import type { OnboardingScreenDeps } from '@/routes/onboarding';

import { scriptedTransport } from './scripted-transport';

/**
 * LE BANC DE L'ACCUEIL POST-INSCRIPTION (#7729) — partagé par les témoins
 * montés de `routes/onboarding*.test.tsx`. Il simule la passerelle telle
 * qu'elle se comporte : l'état servi (`GET /me/onboarding`), les écritures
 * (`PATCH`), et le SCORE d'engagement que les gestes font avancer (#7908) —
 * un salut accusé crédite `greetingCredit` au score servi, comme
 * `recordActivity` le ferait à l'élan courant.
 */

export const SUGGESTION: OnboardingSuggestion = { id: 'u-aicha', username: 'aicha', displayName: 'Aïcha', avatarUrl: null, languages: ['fr', 'ar'] };

export const served = (overrides: Partial<OnboardingState> = {}): OnboardingState => ({
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: 'g-global',
  protectedRegime: false,
  storyDefaultVisibility: 'public',
  suggestions: [SUGGESTION],
  ...overrides,
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

export type HarnessOptions = {
  readonly state?: OnboardingState;
  readonly greeting?: GreetingSend;
  readonly askable?: boolean;
  readonly confirmed?: readonly OnboardingStepId[];
  /** Un cache PERSISTÉ vieux d'une heure : l'écran s'ouvre dessus, puis la relecture de `state` arrive quand le témoin la relâche. */
  readonly staleCache?: OnboardingState;
  /** L'id de la story que le studio vient VRAIMENT de publier (sa preuve de retour). */
  readonly publishedStory?: string;
  /** Le score d'engagement que la passerelle sert au montage. */
  readonly serverScore?: number;
  /** Ce qu'un salut accusé crédite au score servi — le barème × l'élan. */
  readonly greetingCredit?: number;
  /** Le repère de score persisté par une visite précédente (avant le studio, par exemple). */
  readonly mark?: ScoreMark;
  /** La relecture du score échoue (passerelle injoignable). */
  readonly scoreUnavailable?: boolean;
  /** Le renvoi du lien de vérification aboutit-il ? */
  readonly resend?: boolean;
  /** Ce que rend `loadRecap` ; `'hold'` le laisse en suspens. */
  readonly recap?: Awaited<ReturnType<OnboardingScreenDeps['loadRecap']>> | 'hold';
};

export function harness(options: HarnessOptions = {}) {
  let state = options.state ?? served();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const patches: OnboardingPatchBody[] = [];
  const greetings: { conversationId: string; content: string; language: string }[] = [];
  const friends: string[] = [];
  const visits: { path: string; replace: boolean }[] = [];
  const saves: unknown[] = [];
  let resent = 0;
  let asked = 0;
  let score = options.serverScore ?? 0;
  let onboardingReads = 0;

  const { transport } = scriptedTransport({});
  transport.request = (async (request: HttpRequest) => {
    if (request.method === 'PATCH') {
      patches.push(request.body as OnboardingPatchBody);
      return { ok: true, data: state };
    }
    onboardingReads += 1;
    if (options.staleCache !== undefined) await held;
    return { ok: true, data: state };
  }) as typeof transport.request;

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (options.staleCache === undefined) queryClient.setQueryData(ONBOARDING_QUERY_KEY, state);
  else queryClient.setQueryData(ONBOARDING_QUERY_KEY, options.staleCache, { updatedAt: Date.now() - 60 * 60_000 });

  const progress = createJourneyProgressStore({ storage: memoryStorage() });
  progress.write('u-maya', {
    done: options.confirmed ?? [],
    friendRequests: [],
    ...(options.mark === undefined ? {} : { score: options.mark }),
  });

  const deps: OnboardingScreenDeps = {
    api: { source: 'gateway', transport },
    queryClient,
    progress,
    sendGreeting: async (input) => {
      greetings.push({ conversationId: input.conversationId, content: input.content, language: input.language });
      const outcome = options.greeting ?? 'sent';
      if (outcome === 'sent') score += options.greetingCredit ?? 14;
      return outcome;
    },
    addFriend: async (suggestion) => {
      friends.push(suggestion.id);
      return 'done';
    },
    saveLanguages: async (patch) => {
      saves.push(patch);
      return 'saved';
    },
    notificationsAskable: () => options.askable ?? true,
    askNotifications: async () => {
      asked += 1;
    },
    loadRecap: () => (options.recap === 'hold' ? new Promise(() => undefined) : Promise.resolve(options.recap ?? null)),
    readScore: async () => (options.scoreUnavailable ? null : score),
    creditDelays: [0],
    resendVerification: async () => {
      resent += 1;
      return options.resend ?? true;
    },
    takeStoryProof: (storyId) => storyId === options.publishedStory,
    random: () => 0,
    navigate: (path, replace = false) => visits.push({ path, replace }),
  };
  const arrive = () =>
    act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  /** La passerelle change d'avis (le lien cliqué ailleurs, une demande acceptée) : la PROCHAINE lecture le dira. */
  const serve = (next: OnboardingState) => {
    state = next;
  };
  return {
    deps,
    patches,
    greetings,
    friends,
    visits,
    saves,
    resent: () => resent,
    asked: () => asked,
    onboardingReads: () => onboardingReads,
    arrive,
    serve,
  };
}

export const signIn = () =>
  sessionStore.getState().establish({
    user: { id: 'u-maya', username: 'maya', displayName: 'Maya', systemLanguage: 'fr' },
    token: 'jwt',
    sessionToken: 's',
    expiresIn: 3600,
  });
