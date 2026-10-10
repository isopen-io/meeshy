import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  onboardingStepSeenKey,
  type GuideAction,
  type OnboardingStep,
  type OnboardingStepKey,
} from '@meeshy/shared/utils/game/guide';

import type { EngagementWithGame } from '@/lib/api/engagement';

/**
 * LE GESTE QUE RÉCLAME UNE ÉTAPE (#9379) — l'intégration compte sept cartes ;
 * trois d'entre elles demandent un geste au joueur : le premier (envoyer un
 * message, « je compte tes points »), la mission facile du jour, et revenir le
 * lendemain pour que la Flamme grandisse. Une carte qui dit « fais-le » puis
 * passe à la suivante au premier toucher ment : ces trois étapes AVANCENT
 * QUAND LE GESTE A EU LIEU, ce que montrent le bloc `game` et la charge
 * d'engagement, jamais une supposition. Le joueur peut toujours PASSER.
 *
 * Une étape n'attend que si son geste est POSSIBLE : les missions fermées
 * (niveau 5 pas atteint) ou une Flamme jamais allumée ne retiennent rien — un
 * geste impossible ferait de la carte une impasse.
 *
 * La loi partagée (`guide.ts`) nomme les étapes et leur bouton ; elle ne
 * connaît pas le geste. Tant que l'étape ATTEND, son bouton mène à l'endroit
 * où le geste se fait (`action`), pas à la rubrique suivante.
 *
 * Une étape est « vue » dès qu'elle s'affiche (clé serveur inchangée) : la
 * DERNIÈRE étape vue, dont le geste manque, est celle qu'on re-dit à
 * l'ouverture — passer une étape montre la suivante, qui devient la dernière
 * vue, et laisse donc la précédente derrière.
 */

export type GuideGesture = 'first-points' | 'easy-mission' | 'flame-next-day';

type StepGesture = { readonly gesture: GuideGesture; readonly action: GuideAction };

const GESTURES: Readonly<Partial<Record<OnboardingStepKey, StepGesture>>> = {
  welcome: { gesture: 'first-points', action: 'earn-first-points' },
  missions: { gesture: 'easy-mission', action: 'see-missions' },
  flame: { gesture: 'flame-next-day', action: 'see-flame' },
};

export const stepGesture = (key: OnboardingStepKey): StepGesture | null => GESTURES[key] ?? null;

/** Le geste est-il possible aujourd'hui ? Sinon l'étape ne retient personne. */
const possible = (gesture: GuideGesture, view: EngagementWithGame): boolean => {
  const game = view.game;
  if (game === undefined) return false;
  switch (gesture) {
    case 'first-points':
      return true;
    case 'easy-mission':
      return game.missions.unlocked;
    case 'flame-next-day':
      return game.flame.days >= 1;
  }
};

const done = (gesture: GuideGesture, view: EngagementWithGame): boolean => {
  const game = view.game;
  if (game === undefined) return false;
  switch (gesture) {
    case 'first-points':
      return game.level.score > 0 || !view.isEmpty;
    case 'easy-mission':
      return game.missions.items.some((mission) => mission.difficulty === 'easy' && mission.completedAt !== null);
    case 'flame-next-day':
      return game.flame.days >= 2;
  }
};

/** L'étape attend-elle son geste, dans l'état courant du jeu ? */
export function awaitingGesture(key: OnboardingStepKey, view: EngagementWithGame): boolean {
  const entry = stepGesture(key);
  return entry !== null && possible(entry.gesture, view) && !done(entry.gesture, view);
}

const lastSeenStep = (seen: Iterable<string>): OnboardingStep | null => {
  const keys = new Set(seen);
  return [...ONBOARDING_STEPS].reverse().find((step) => keys.has(onboardingStepSeenKey(step.key))) ?? null;
};

/**
 * L'étape à dire à l'OUVERTURE de l'écran : celle qui attend encore son geste
 * (la dernière vue), sinon la première non vue.
 */
export function openingStep(view: EngagementWithGame, seen: Iterable<string>): OnboardingStep | null {
  const keys = [...seen];
  const last = lastSeenStep(keys);
  if (last !== null && awaitingGesture(last.key, view)) return last;
  return nextOnboardingStep(keys);
}
