import type { OnboardingState, OnboardingStepId } from '@meeshy/shared/types/onboarding';

import { ONBOARDING_COMPLETION_STEPS, ONBOARDING_STEPS } from '@/lib/api/onboarding';

/**
 * **LA LOI DU PARCOURS D'ACCUEIL** (#7729) — pure : elle décide quelle carte
 * vient, ce qu'elle rapporte et ce que dit le récapitulatif. L'écran
 * (`routes/onboarding.tsx`) l'applique, il ne la réécrit pas.
 *
 * Source produit : `docs/marketing/campagne-2026-09/onboarding-parcours.md`
 * § 2 (les cinq cartes) et § 3 (reprise, étape 5 contextuelle).
 */

export type JourneyStep = OnboardingStepId | 'recap';

/**
 * Ce que CE client a vu se CONFIRMER pendant le parcours — un accusé de
 * message, une story publiée, une demande d'ami acceptée par la passerelle.
 * Jamais un geste simplement tenté : la récompense ne s'affiche qu'une fois
 * l'accusé reçu (§ 3, « jamais inventée »).
 */
export type JourneyProgress = {
  readonly done: readonly OnboardingStepId[];
  readonly friendRequests: readonly string[];
  /**
   * Le score d'engagement SERVI (`GET /me/engagement`) : `baseline` à la
   * première lecture du parcours, `last` à la plus récente (#7908). Les points
   * de la session sont leur écart — jamais une somme de barèmes locaux, que
   * l'élan rend fausse.
   */
  readonly score?: ScoreMark;
};

export type ScoreMark = { readonly baseline: number; readonly last: number };

export const EMPTY_PROGRESS: JourneyProgress = { done: [], friendRequests: [] };

export type JourneyContext = {
  readonly state: OnboardingState;
  readonly progress: JourneyProgress;
  /** La fenêtre système peut-elle encore s'ouvrir (API présente, jamais répondue) ? */
  readonly notificationsAskable: boolean;
};

export const withDone = (progress: JourneyProgress, step: OnboardingStepId): JourneyProgress =>
  progress.done.includes(step) ? progress : { ...progress, done: ONBOARDING_STEPS.filter((id) => id === step || progress.done.includes(id)) };

export const withFriendRequest = (progress: JourneyProgress, userId: string): JourneyProgress =>
  progress.friendRequests.includes(userId) ? progress : { ...progress, friendRequests: [...progress.friendRequests, userId] };

/** Une lecture du score servi : la première pose la base, les suivantes avancent `last`. */
export const withScore = (progress: JourneyProgress, score: number): JourneyProgress => ({
  ...progress,
  score: { baseline: progress.score?.baseline ?? score, last: score },
});

/**
 * **L'ÉTAPE 5 N'EST PROPOSÉE QUE SI 2, 3 OU 4 A PRODUIT QUELQUE CHOSE** qui
 * peut appeler une réponse — un salut, une story (y compris publiée ailleurs,
 * que le serveur pré-coche), une demande d'ami. C'est ce que le carrousel
 * #5218 a appris : la permission demandée à froid est refusée.
 */
export function producedSomething(context: Pick<JourneyContext, 'state' | 'progress'>): boolean {
  const { progress, state } = context;
  return (
    progress.done.includes('global') ||
    progress.done.includes('story') ||
    progress.friendRequests.length > 0 ||
    state.prefilledSteps.includes('global') ||
    state.prefilledSteps.includes('story')
  );
}

/**
 * **UNE ÉTAPE EST RÉGLÉE DÈS QU'ELLE S'EST CONFIRMÉE ICI** — vue par le
 * serveur, pré-cochée par lui, OU confirmée sur cet appareil (`progress.done`).
 * Le troisième terme ferme la fenêtre entre l'accusé et l'écriture serveur :
 * un salut accusé puis un rechargement avant que la passerelle ait enregistré
 * l'étape rouvrirait sinon un composeur neuf — et un second salut partirait.
 */
const isSettled = (step: OnboardingStepId, context: JourneyContext): boolean =>
  context.state.seenSteps.includes(step) || context.state.prefilledSteps.includes(step) || context.progress.done.includes(step);

/**
 * Une étape est-elle PROPOSÉE à ce compte ? Les notifications, seulement si
 * quelque chose appelle une réponse ; le courriel (#7907), seulement si le
 * serveur dit l'adresse NON vérifiée — un serveur muet ne la propose pas.
 */
export const isOffered = (step: OnboardingStepId, context: Pick<JourneyContext, 'state' | 'progress' | 'notificationsAskable'>): boolean => {
  if (step === 'email') return context.state.emailVerified === false;
  if (step === 'notifications') return context.notificationsAskable && producedSomething(context);
  return true;
};

const firstOpenFrom = (index: number, context: JourneyContext): JourneyStep =>
  ONBOARDING_STEPS.slice(index).find((step) => !isSettled(step, context) && isOffered(step, context)) ?? 'recap';

export const resumeStep = (context: JourneyContext): JourneyStep => firstOpenFrom(0, context);

export const nextStepAfter = (current: OnboardingStepId, context: JourneyContext): JourneyStep =>
  firstOpenFrom(ONBOARDING_STEPS.indexOf(current) + 1, context);

/**
 * **UNE RELECTURE DU SERVEUR SE REJOUE CONTRE LA CARTE AFFICHÉE.** L'écran
 * s'ouvre sur le cache (persisté, parfois vieux d'une heure), puis chaque
 * lecture de `GET /me/onboarding` qui aboutit peut dire ce qui s'est passé
 * AILLEURS :
 * - le parcours s'est clos (fini sur iOS, sept jours passés) ⇒ `'closed'` —
 *   sauf si c'est CE parcours qui vient de voir la cinquième étape : le
 *   serveur le clôt alors, et le récapitulatif reste dû ;
 * - l'étape affichée s'est réglée ailleurs (un salut parti d'iOS pré-coche
 *   `global`) ⇒ l'étape suivante, jamais un second « Envoyer ».
 * Ce que CE parcours a lui-même écrit (`ownSteps`) ou vu se confirmer
 * (`progress.done`) ne déplace jamais la carte : elle montre ce qui vient
 * d'arriver.
 */
export function replayServedState(input: {
  readonly context: JourneyContext;
  readonly step: OnboardingStepId;
  readonly ownSteps: ReadonlySet<OnboardingStepId>;
}): JourneyStep | 'closed' | 'stay' {
  const { context, step, ownSteps } = input;
  const { state } = context;
  const closed = !state.eligible || state.completedAt !== null;
  const closedHere = ownSteps.size > 0 && ONBOARDING_COMPLETION_STEPS.every((id) => state.seenSteps.includes(id));
  if (closed) return closedHere ? 'stay' : 'closed';
  const settledElsewhere =
    (state.seenSteps.includes(step) || state.prefilledSteps.includes(step)) && !ownSteps.has(step) && !context.progress.done.includes(step);
  return settledElsewhere ? nextStepAfter(step, context) : 'stay';
}

/**
 * **LE BARÈME NU** (§ 1 du parcours) — un premier message dans une
 * conversation : `content.text_message` (9) + `conversation.public` (5) ; une
 * story : `content.story` (9) + `tool.direct_publish` (1) ; une amitié
 * acceptée : `social.friendship` (7) à chacun. Le serveur les MULTIPLIE par
 * l'élan (#7908) : ce barème n'est qu'un PLANCHER, servi quand la passerelle
 * ne dit pas `stepRewards`, et jamais la mesure d'un gain.
 */
const BASE_POINTS = { global: 14, story: 10 } as const;

export const FRIENDSHIP_POINTS = 7;
export const LEVEL_ONE_POINTS = 10;

/** Ce que la carte ANNONCE avant le geste : la valeur servie à l'élan courant. */
export const announcedPoints = (step: 'global' | 'story', state: OnboardingState): number =>
  state.stepRewards?.[step] ?? BASE_POINTS[step];

/** Les points de la session : l'écart entre le score servi le plus récent et celui du départ. */
export const pointsOf = (progress: JourneyProgress): number =>
  progress.score === undefined ? 0 : Math.max(0, progress.score.last - progress.score.baseline);

/**
 * Le récapitulatif de REPLI, quand `GET /me/engagement` n'a pas répondu : les
 * points de la session et les demandes que le SERVEUR dit en attente (#7910)
 * — jamais une série, un niveau ou des badges déduits ici (#7909).
 */
export type JourneyRecap = {
  readonly points: number;
  readonly pendingFriends: number;
};

export function recapOf(progress: JourneyProgress, state: OnboardingState): JourneyRecap {
  return { points: pointsOf(progress), pendingFriends: state.pendingFriendRequests ?? 0 };
}

export type GreetingDraft = { readonly text: string; readonly holeStart: number; readonly holeEnd: number };

const HOLE = /\[\[([^\]]+)\]\]/;

/**
 * **UN SALUT PRÉ-REMPLI, JAMAIS LE MÊME** (§ 5, parade anti-spam) — un
 * gabarit tiré au hasard parmi ceux de la langue, `{name}` et `{languages}`
 * remplis, et un TROU personnel (`[[…]]`) que le composeur SÉLECTIONNE : taper
 * le remplace, ne rien taper l'envoie tel quel.
 */
export function greetingDraft(input: {
  readonly templates: readonly string[];
  readonly index: number;
  readonly name: string;
  readonly languages: string;
}): GreetingDraft {
  const template = input.templates[Math.min(Math.max(0, input.index), input.templates.length - 1)] ?? '';
  const filled = template.replaceAll('{name}', input.name).replaceAll('{languages}', input.languages);
  const match = HOLE.exec(filled);
  if (match === null || match[1] === undefined) return { text: filled, holeStart: filled.length, holeEnd: filled.length };
  const text = filled.replace(HOLE, match[1]);
  return { text, holeStart: match.index, holeEnd: match.index + match[1].length };
}
