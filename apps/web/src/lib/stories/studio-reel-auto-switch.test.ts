import { describe, expect, test } from 'bun:test';

import { emptyStudioDraft, withSound, withVisual, type StudioDraft, type StudioVisualAsset } from './studio';
import { IDENTITY_POSE } from './studio-pose';
import {
  NO_REEL_AUTO_SWITCH,
  reelAutoSwitchAuthorChose,
  reelAutoSwitchDecision,
  reelAutoSwitchApplied,
  studioSceneDemandsReel,
} from './studio-reel-auto-switch';

/** Jumelle web de `ComposerReelAutoSwitch` (#8793 — directive porteur
 * 2026-09-30, corrigée le même jour : la bascule va vers le RÉEL). */

const visual = (mediaType: 'image' | 'video', durationMs?: number): StudioVisualAsset => ({
  previewUrl: `blob:${mediaType}`,
  mediaType,
  upload: { phase: 'uploading', progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
  ...(durationMs !== undefined ? { durationMs } : {}),
});
const sound = { previewUrl: 'blob:sound', upload: { phase: 'uploading', progress: 0 } as const, plane: 'background' as const, durationMs: 5000 };

const withBackground = (mediaType: 'image' | 'video'): StudioDraft => withVisual(emptyStudioDraft('fr'), 'visual', visual(mediaType, 5000));

describe('studioSceneDemandsReel — ce qui DEMANDE le réel', () => {
  test('une vidéo de fond', () => {
    expect(studioSceneDemandsReel(withBackground('video'))).toBe(true);
  });
  test('un son posé sur une image de fond', () => {
    expect(studioSceneDemandsReel(withSound(withBackground('image'), sound))).toBe(true);
  });
  test('une image de fond seule, une vidéo au premier plan, un son sans fond : rien', () => {
    expect(studioSceneDemandsReel(withBackground('image'))).toBe(false);
    expect(studioSceneDemandsReel(withVisual(emptyStudioDraft('fr'), 'overlay', visual('video', 5000)))).toBe(false);
    expect(studioSceneDemandsReel(withSound(emptyStudioDraft('fr'), sound))).toBe(false);
  });
});

describe('reelAutoSwitchDecision — seule la création de POST bascule, jamais contre l’auteur', () => {
  const decide = (overrides: Partial<Parameters<typeof reelAutoSwitchDecision>[0]> = {}) =>
    reelAutoSwitchDecision({ demands: true, entryKind: 'POST', state: NO_REEL_AUTO_SWITCH, reelChoosable: true, ...overrides });

  test('un post qui demande le réel, et que le menu l’offre : il s’arme', () => {
    expect(decide()).toBe('arm-reel');
  });
  test('le menu ne l’offre pas (vidéo trop courte, durée pas encore mesurée) : rien', () => {
    expect(decide({ reelChoosable: false })).toBe('keep');
  });
  test('une story, un réel d’entrée : jamais de bascule', () => {
    expect(decide({ entryKind: 'STORY' })).toBe('keep');
    expect(decide({ entryKind: 'REEL' })).toBe('keep');
  });
  test('l’auteur a choisi au chevron : plus rien ne bascule, ni dans un sens ni dans l’autre', () => {
    expect(decide({ state: { authorChose: true, autoArmed: false } })).toBe('keep');
    expect(decide({ demands: false, state: { authorChose: true, autoArmed: true } })).toBe('keep');
  });
  test('la demande disparaît (vidéo retirée) : la bascule automatique se DÉSARME', () => {
    expect(decide({ demands: false, state: { authorChose: false, autoArmed: true } })).toBe('disarm');
  });
  test('déjà armé : rien de plus', () => {
    expect(decide({ state: { authorChose: false, autoArmed: true } })).toBe('keep');
  });
});

describe('reelAutoSwitchApplied / reelAutoSwitchAuthorChose', () => {
  test('armer publie un RÉEL sans disposition ; désarmer rend le POST', () => {
    expect(reelAutoSwitchApplied('arm-reel', NO_REEL_AUTO_SWITCH)).toEqual({ choice: { kind: 'REEL', layout: null }, state: { authorChose: false, autoArmed: true } });
    expect(reelAutoSwitchApplied('disarm', { authorChose: false, autoArmed: true })).toEqual({ choice: { kind: 'POST', layout: null }, state: { authorChose: false, autoArmed: false } });
    expect(reelAutoSwitchApplied('keep', NO_REEL_AUTO_SWITCH)).toBeNull();
  });
  test('le choix de l’auteur verrouille la composition', () => {
    expect(reelAutoSwitchAuthorChose({ authorChose: false, autoArmed: true })).toEqual({ authorChose: true, autoArmed: true });
  });
});
