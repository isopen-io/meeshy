import { describe, expect, test } from 'bun:test';

import type { OnboardingState } from '@meeshy/shared/types/onboarding';

import {
  EMPTY_PROGRESS,
  LEVEL_ONE_POINTS,
  greetingDraft,
  nextStepAfter,
  pointsOf,
  recapOf,
  replayServedState,
  resumeStep,
  withDone,
  withFriendRequest,
  type JourneyContext,
} from './journey';

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

const context = (overrides: Partial<JourneyContext> = {}): JourneyContext => ({
  state: state(),
  progress: EMPTY_PROGRESS,
  notificationsAskable: true,
  ...overrides,
});

describe('resumeStep — la reprise rouvre la PREMIÈRE étape manquante', () => {
  test('un compte neuf commence par les langues', () => {
    expect(resumeStep(context())).toBe('languages');
  });

  test('les étapes vues sont sautées', () => {
    expect(resumeStep(context({ state: state({ seenSteps: ['languages'] }) }))).toBe('global');
  });

  test('les étapes déjà faites ailleurs (pré-cochées par le serveur) sont sautées', () => {
    expect(resumeStep(context({ state: state({ seenSteps: ['languages'], prefilledSteps: ['global', 'story'] }) }))).toBe('friends');
  });

  test('les notifications ne sont proposées que si une étape a PRODUIT quelque chose', () => {
    const allButLast = state({ seenSteps: ['languages', 'global', 'story', 'friends'] });
    expect(resumeStep(context({ state: allButLast }))).toBe('recap');
    expect(resumeStep(context({ state: allButLast, progress: withDone(EMPTY_PROGRESS, 'global') }))).toBe('notifications');
  });

  test('une story publiée ailleurs compte comme une production', () => {
    const allButLast = state({ seenSteps: ['languages', 'global', 'friends'], prefilledSteps: ['story'] });
    expect(resumeStep(context({ state: allButLast }))).toBe('notifications');
  });

  test('une étape CONFIRMÉE sur cet appareil est réglée, même si le serveur ne l’a pas encore vue', () => {
    const greeted = withDone(EMPTY_PROGRESS, 'global');
    expect(resumeStep(context({ state: state({ seenSteps: ['languages'] }), progress: greeted }))).toBe('story');
    const published = withDone(greeted, 'story');
    expect(resumeStep(context({ state: state({ seenSteps: ['languages'] }), progress: published }))).toBe('friends');
    expect(nextStepAfter('languages', context({ progress: published }))).toBe('friends');
  });

  test('une demande d’ami envoyée compte comme une production', () => {
    const allButLast = state({ seenSteps: ['languages', 'global', 'story', 'friends'] });
    expect(resumeStep(context({ state: allButLast, progress: withFriendRequest(EMPTY_PROGRESS, 'u1') }))).toBe('notifications');
  });

  test('sans fenêtre système disponible (API absente, déjà répondue), l’étape n’est jamais offerte', () => {
    const allButLast = state({ seenSteps: ['languages', 'global', 'story', 'friends'] });
    expect(resumeStep(context({ state: allButLast, progress: withDone(EMPTY_PROGRESS, 'global'), notificationsAskable: false }))).toBe('recap');
  });
});

describe('nextStepAfter — on avance sans jamais revenir en arrière', () => {
  test('après les langues vient Global', () => {
    expect(nextStepAfter('languages', context())).toBe('global');
  });

  test('saute ce que le serveur a pré-coché', () => {
    expect(nextStepAfter('global', context({ state: state({ prefilledSteps: ['story'] }) }))).toBe('friends');
  });

  test('après les amis, rien produit : le récapitulatif', () => {
    expect(nextStepAfter('friends', context())).toBe('recap');
  });

  test('après les notifications : le récapitulatif', () => {
    expect(nextStepAfter('notifications', context({ progress: withDone(EMPTY_PROGRESS, 'global') }))).toBe('recap');
  });
});

describe('les points — ce que les règles du serveur créditent, jamais plus', () => {
  test('rien fait : zéro, et le premier niveau est à 10', () => {
    expect(pointsOf(EMPTY_PROGRESS)).toBe(0);
    expect(LEVEL_ONE_POINTS).toBe(10);
  });

  test('un salut confirmé rapporte 9 + 5, une story 9 + 1', () => {
    expect(pointsOf(withDone(EMPTY_PROGRESS, 'global'))).toBe(14);
    expect(pointsOf(withDone(withDone(EMPTY_PROGRESS, 'global'), 'story'))).toBe(24);
  });

  test('une demande d’ami ne crédite rien tant qu’elle n’est pas acceptée', () => {
    expect(pointsOf(withFriendRequest(EMPTY_PROGRESS, 'u1'))).toBe(0);
  });

  test('marquer deux fois la même étape ne compte qu’une fois', () => {
    expect(pointsOf(withDone(withDone(EMPTY_PROGRESS, 'global'), 'global'))).toBe(14);
  });

  test('la même personne ajoutée deux fois est UNE demande', () => {
    expect(withFriendRequest(withFriendRequest(EMPTY_PROGRESS, 'u1'), 'u1').friendRequests).toEqual(['u1']);
  });
});

describe('recapOf — le récapitulatif final', () => {
  test('salut + story + deux demandes', () => {
    const progress = withFriendRequest(withFriendRequest(withDone(withDone(EMPTY_PROGRESS, 'global'), 'story'), 'u1'), 'u2');
    expect(recapOf(progress)).toEqual({ points: 24, levelReached: true, streakDays: 1, badges: 2, pendingFriends: 2 });
  });

  test('rien fait : aucun niveau, aucune série', () => {
    expect(recapOf(EMPTY_PROGRESS)).toEqual({ points: 0, levelReached: false, streakDays: 0, badges: 0, pendingFriends: 0 });
  });
});

describe('greetingDraft — un salut pré-rempli, jamais le même, avec un trou personnel', () => {
  const templates = ['Salut ! Moi c’est {name}. Ce qui me fait vibrer : [[la musique]] !', 'Hello, {name} ici — je parle {languages}. [[Qui d’autre ?]]'];

  test('remplit le pseudo et les langues, et désigne le trou à sélectionner', () => {
    const draft = greetingDraft({ templates, index: 0, name: 'Tom', languages: 'français' });
    expect(draft.text).toBe('Salut ! Moi c’est Tom. Ce qui me fait vibrer : la musique !');
    expect(draft.text.slice(draft.holeStart, draft.holeEnd)).toBe('la musique');
  });

  test('le trou reste juste quand les paramètres le précèdent', () => {
    const draft = greetingDraft({ templates, index: 1, name: 'Aïcha', languages: 'français et arabe' });
    expect(draft.text).toBe('Hello, Aïcha ici — je parle français et arabe. Qui d’autre ?');
    expect(draft.text.slice(draft.holeStart, draft.holeEnd)).toBe('Qui d’autre ?');
  });

  test('l’index est borné au nombre de gabarits', () => {
    expect(greetingDraft({ templates, index: 5, name: 'Tom', languages: 'x' }).text).toBe(
      greetingDraft({ templates, index: 1, name: 'Tom', languages: 'x' }).text,
    );
  });
});

describe('replayServedState — une relecture du serveur rejouée contre la carte affichée', () => {
  const none = new Set<never>();

  test('un parcours clos ailleurs (fini sur iOS, plus de sept jours) : on sort', () => {
    expect(replayServedState({ context: context({ state: state({ eligible: false }) }), step: 'languages', ownSteps: none })).toBe('closed');
  });

  test('un parcours que CE parcours vient de clore (ses cinq étapes vues, dont une par nous) : on reste', () => {
    const all = state({ eligible: false, completedAt: '2026-09-24T10:00:00.000Z', seenSteps: ['languages', 'global', 'story', 'friends', 'notifications'] });
    expect(replayServedState({ context: context({ state: all }), step: 'global', ownSteps: new Set(['global'] as const) })).toBe('stay');
  });

  test('l’étape affichée réglée AILLEURS (salut pré-coché) : on passe à la suivante', () => {
    const replay = replayServedState({ context: context({ state: state({ seenSteps: ['languages'], prefilledSteps: ['global'] }) }), step: 'global', ownSteps: none });
    expect(replay).toBe('story');
  });

  test('l’étape réglée par CE parcours (son accusé) : on reste, la carte montre ce qui vient d’arriver', () => {
    const served = context({ state: state({ seenSteps: ['languages', 'global'] }) });
    expect(replayServedState({ context: served, step: 'global', ownSteps: new Set(['global'] as const) })).toBe('stay');
    expect(replayServedState({ context: { ...served, progress: withDone(EMPTY_PROGRESS, 'global') }, step: 'global', ownSteps: none })).toBe('stay');
  });

  test('rien de neuf : on reste', () => {
    expect(replayServedState({ context: context(), step: 'languages', ownSteps: none })).toBe('stay');
  });
});
