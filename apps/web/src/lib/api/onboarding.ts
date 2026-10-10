import * as z from 'zod/mini';

import type {
  OnboardingState as SharedOnboardingState,
  OnboardingStepId as SharedOnboardingStepId,
  OnboardingStepOutcome,
} from '@meeshy/shared/types/onboarding';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **LE PORT DE L'ACCUEIL POST-INSCRIPTION** (#7729) — `GET`/`PATCH
 * me.onboarding` (`services/gateway/src/routes/me/onboarding.ts`).
 *
 * La FORME est celle de `packages/shared/types/onboarding.ts` : les TYPES en
 * viennent (`import type`, effacé à la compilation), le DÉCODEUR est écrit en
 * `zod/mini` parce que le schéma partagé tire `zod` entier dans le chunk qui
 * l'importe (D-14, chaque kilo-octet se paie sur la 3G visée). La jumelle ne
 * peut pas diverger en silence : `Served` est contraint, à la compilation,
 * de produire EXACTEMENT `OnboardingState` (`sameShape` plus bas).
 *
 * **Strict aux frontières** : une clé de plus sur une suggestion (une
 * présence qui voyagerait à côté) ou un régime protégé servi avec une
 * visibilité publique rendent la charge ILLISIBLE — jamais une valeur
 * devinée. Le cache de requêtes est persisté (`query-client.ts`) : ce qui
 * entre ici survit à la session.
 *
 * **Une étape inconnue de CE client est IGNORÉE** (#9928, D-182) : elle ne
 * révèle rien, et la refuser rendait tout l'accueil illisible au premier
 * serveur qui ajoute une étape — l'ancien client cassait contre le nouveau
 * serveur, ce que la rétrocompatibilité interdit.
 */

export const ONBOARDING_QUERY_KEY = ['me', 'onboarding'] as const;

export type OnboardingDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const PATH = meEndpoints.onboarding;

/**
 * **L'ÂGE** (#9928) — l'étape FACULTATIVE que le lot passerelle (#9927) ajoute
 * à `ONBOARDING_STEP_IDS`. Le web la connaît avant que le fichier partagé la
 * déclare : l'union reste juste dans les deux états du dépôt (`'age'` y est
 * absorbé quand le partagé l'ajoute), et une passerelle qui l'ignore ne
 * bloque rien — son `PATCH` refusé laisse simplement l'étape à reproposer.
 */
export type OnboardingStepId = SharedOnboardingStepId | 'age';

/** La restriction d'écriture que la passerelle calcule pour le lecteur (#9927). */
export type ViewerWriteRestriction = 'minor-global';

/**
 * L'état servi, tel que CE client le lit : la forme partagée, plus l'étape de
 * l'âge et la restriction d'écriture (optionnelle, `null` = aucune ; absente
 * = serveur antérieur).
 */
export type OnboardingState = Omit<SharedOnboardingState, 'seenSteps' | 'prefilledSteps'> & {
  readonly seenSteps: OnboardingStepId[];
  readonly prefilledSteps: OnboardingStepId[];
  readonly viewerWriteRestriction?: ViewerWriteRestriction | null | undefined;
};

export type OnboardingPatchBody =
  | { readonly step: OnboardingStepId; readonly outcome: OnboardingStepOutcome }
  | { readonly finish: true };

/** L'ordre du parcours — celui de `ONBOARDING_STEP_IDS` (shared), lu sans
 * importer `zod`, l'âge juste avant Meeshy Global : c'est lui qui dit si le
 * salut peut y partir. `satisfies` + `ExhaustiveSteps` le tiennent complet. */
export const ONBOARDING_STEPS = ['languages', 'email', 'age', 'global', 'story', 'friends', 'notifications'] as const satisfies readonly OnboardingStepId[];

/** Les étapes dont la vue clôt le parcours — `ONBOARDING_COMPLETION_STEP_IDS`
 * (shared) : `email`, proposée au seul courriel non vérifié, n'en est pas. */
export const ONBOARDING_COMPLETION_STEPS = ['languages', 'global', 'story', 'friends', 'notifications'] as const satisfies readonly OnboardingStepId[];

/* `age` (#9927) est au contrat partagé mais pas encore dans ce parcours : la passerelle ne
   la sert qu'au client qui annonce `X-Meeshy-Capabilities: onboarding-age`, et sa carte arrive
   avec #9928. Purement de TYPE, ce gabarit ne pèse rien dans la première peinture. */
type ServedStepId = Exclude<OnboardingStepId, 'age'>;
type ExhaustiveSteps = [ServedStepId] extends [(typeof ONBOARDING_STEPS)[number]] ? true : never;
const stepsAreExhaustive: ExhaustiveSteps = true;
void stepsAreExhaustive;

const Suggestion = z.strictObject({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.nullable(z.string()),
  languages: z.array(z.string()),
});

const Count = z.number().check(z.int(), z.minimum(0));

const StepRewards = z.strictObject({ global: Count, story: Count, friendship: Count });

const isKnownStep = (id: string): id is OnboardingStepId => (ONBOARDING_STEPS as readonly string[]).includes(id);

/** Les étapes que ce client connaît, dans l'ordre servi ; les autres tombent. */
const Steps = z.pipe(
  z.array(z.string()),
  z.transform((ids: string[]) => ids.filter(isKnownStep)),
);

const Served = z.strictObject({
  eligible: z.boolean(),
  completedAt: z.nullable(z.string()),
  seenSteps: Steps,
  prefilledSteps: Steps,
  globalConversationId: z.nullable(z.string()),
  protectedRegime: z.boolean(),
  storyDefaultVisibility: z.enum(['public', 'friends']),
  suggestions: z.array(Suggestion).check(z.maxLength(6)),
  emailVerified: z.optional(z.boolean()),
  canPublishStory: z.optional(z.boolean()),
  pendingFriendRequests: z.optional(Count),
  stepRewards: z.optional(StepRewards),
  viewerWriteRestriction: z.optional(z.nullable(z.literal('minor-global'))),
});

type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type ServedState = Omit<OnboardingState, 'seenSteps' | 'prefilledSteps' | 'viewerWriteRestriction'> & {
  seenSteps: ServedStepId[];
  prefilledSteps: ServedStepId[];
};
const sameShape: SameShape<z.infer<typeof Served>, ServedState> = true;
void sameShape;

export function decodeOnboardingState(raw: unknown): OnboardingState | null {
  const parsed = Served.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.protectedRegime && parsed.data.storyDefaultVisibility !== 'friends') return null;
  return parsed.data;
}

const decoded = (result: ApiResult<unknown>): ApiResult<OnboardingState> => {
  if (!result.ok) return result;
  const state = decodeOnboardingState(result.data);
  return state === null ? unreadableFailure('Accueil') : { ok: true, data: state };
};

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadOnboarding(deps: OnboardingDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<OnboardingState>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureOnboarding } = await import('./fixtures-onboarding');
    return { ok: true, data: fixtureOnboarding() };
  }
  return decoded(await deps.transport.request<unknown>({ method: 'GET', path: PATH, ...withSignal(deps.signal) }));
}

export async function patchOnboarding(deps: OnboardingDeps, body: OnboardingPatchBody): Promise<ApiResult<OnboardingState>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePatchOnboarding } = await import('./fixtures-onboarding');
    return { ok: true, data: fixturePatchOnboarding(body) };
  }
  return decoded(await deps.transport.request<unknown>({ method: 'PATCH', path: PATH, body }));
}

/**
 * **CINQ MINUTES DE FRAÎCHEUR** — l'état n'a qu'un auteur, assis devant
 * l'écran, et chaque geste du parcours écrit le cache avec la valeur SERVIE
 * (`onboarding-actions.ts`). Ce qui peut changer ailleurs (une story publiée
 * depuis un autre appareil pré-coche l'étape) arrive à la relecture suivante.
 */
export const ONBOARDING_STALE_TIME = 5 * 60_000;

export function onboardingQueryOptions(deps: OnboardingDeps) {
  return {
    queryKey: ONBOARDING_QUERY_KEY,
    staleTime: ONBOARDING_STALE_TIME,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) => unwrap(await loadOnboarding({ ...deps, ...withSignal(signal) })),
  };
}
