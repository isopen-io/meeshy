import { describe, expect, test } from 'bun:test';

import type { OnboardingState } from '@meeshy/shared/types/onboarding';

import {
  EMPTY_PROGRESS,
  FRIENDSHIP_POINTS,
  LEVEL_ONE_POINTS,
  announcedPoints,
  greetingDraft,
  nextStepAfter,
  pointsOf,
  recapOf,
  replayServedState,
  resumeStep,
  withDone,
  withFriendRequest,
  withScore,
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

describe('les points de la session — lus au serveur, jamais calculés ici (#7908)', () => {
  test('rien lu : zéro, et le premier niveau est à 10', () => {
    expect(pointsOf(EMPTY_PROGRESS)).toBe(0);
    expect(LEVEL_ONE_POINTS).toBe(10);
  });

  test('la première lecture du score pose la BASE : la session part de zéro', () => {
    expect(pointsOf(withScore(EMPTY_PROGRESS, 120))).toBe(0);
  });

  test('la session vaut ce que le serveur a crédité depuis la base — élan compris', () => {
    const started = withScore(EMPTY_PROGRESS, 120);
    expect(pointsOf(withScore(started, 148))).toBe(28);
    expect(pointsOf(withScore(withScore(started, 148), 169))).toBe(49);
  });

  test('une étape confirmée ne fabrique aucun point sans relecture', () => {
    expect(pointsOf(withDone(withScore(EMPTY_PROGRESS, 0), 'global'))).toBe(0);
  });

  test('une demande d’ami ne crédite rien tant qu’elle n’est pas acceptée', () => {
    expect(pointsOf(withFriendRequest(EMPTY_PROGRESS, 'u1'))).toBe(0);
  });

  test('la même personne ajoutée deux fois est UNE demande', () => {
    expect(withFriendRequest(withFriendRequest(EMPTY_PROGRESS, 'u1'), 'u1').friendRequests).toEqual(['u1']);
  });
});

describe('announcedPoints — l’annonce avant le geste est celle du serveur, élan compris (#7908)', () => {
  test('servie à l’élan courant : le chiffre servi, pas le barème', () => {
    const served = state({ stepRewards: { global: 28, story: 20, friendship: 14 } });
    expect(announcedPoints('global', served)).toBe(28);
    expect(announcedPoints('story', served)).toBe(20);
  });

  test('un serveur qui ne la sert pas : le barème nu, un plancher', () => {
    expect(announcedPoints('global', state())).toBe(14);
    expect(announcedPoints('story', state())).toBe(10);
  });

  test('l’amitié s’annonce par son plancher : l’autre personne crédite à son propre élan', () => {
    expect(FRIENDSHIP_POINTS).toBe(7);
  });
});

describe('recapOf — le récapitulatif ne compte que ce que le serveur sait', () => {
  test('les demandes en route sont celles que le serveur dit EN ATTENTE, pas celles parties d’ici (#7910)', () => {
    const progress = withFriendRequest(withFriendRequest(EMPTY_PROGRESS, 'u1'), 'u2');
    expect(recapOf(progress, state({ pendingFriendRequests: 1 })).pendingFriends).toBe(1);
    expect(recapOf(progress, state({ pendingFriendRequests: 0 })).pendingFriends).toBe(0);
  });

  test('ni série ni badges inventés : seulement les points de la session', () => {
    const progress = withScore(withScore(withDone(EMPTY_PROGRESS, 'global'), 10), 24);
    expect(recapOf(progress, state())).toEqual({ points: 14, pendingFriends: 0 });
  });
});

describe('l’étape du courriel (#7907) — proposée au seul courriel NON vérifié', () => {
  test('non vérifié : elle vient juste après les langues', () => {
    const unverified = context({ state: state({ emailVerified: false }) });
    expect(nextStepAfter('languages', unverified)).toBe('email');
    expect(nextStepAfter('email', unverified)).toBe('global');
  });

  test('vérifié (pré-cochée par le serveur) ou inconnu : jamais proposée', () => {
    expect(nextStepAfter('languages', context({ state: state({ emailVerified: true, prefilledSteps: ['email'] }) }))).toBe('global');
    expect(nextStepAfter('languages', context())).toBe('global');
  });

  test('la carte affichée, le courriel vérifié ailleurs (le lien cliqué) : on passe à la suite', () => {
    const verified = context({ state: state({ emailVerified: true, seenSteps: ['languages'], prefilledSteps: ['email'] }) });
    expect(replayServedState({ context: verified, step: 'email', ownSteps: new Set() })).toBe('global');
  });

  test('passée (« Plus tard ») : la reprise ne la rouvre pas', () => {
    expect(resumeStep(context({ state: state({ emailVerified: false, seenSteps: ['languages', 'email'] }) }))).toBe('global');
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
