import { describe, expect, test } from 'bun:test';

import {
  studioEffectCarousel,
  studioEffectToggled,
  studioLeadingSceneToggles,
  studioRehearsal,
  studioSceneEffectsServed,
  studioTrailingFocus,
  studioTrailingFoot,
  studioTrailingOptions,
  studioTransitionsAfter,
} from './studio-scene-columns';

/** Jumelle web de `ComposerSceneColumns` iOS (#8712–#8714, #8792). */
describe('studioLeadingSceneToggles — l’éclair PUIS le Cadre, après les portes (#8713)', () => {
  test('les deux servis : éclair, Cadre', () => {
    expect(studioLeadingSceneToggles({ animated: true, frame: true })).toEqual(['animated', 'frame']);
  });
  test('sans fond, le Cadre n’est pas servi, l’éclair ne bouge pas', () => {
    expect(studioLeadingSceneToggles({ animated: true, frame: false })).toEqual(['animated']);
  });
  test('rien de servi : aucun bouton', () => {
    expect(studioLeadingSceneToggles({ animated: false, frame: false })).toEqual([]);
  });
});

describe('studioSceneEffectsServed — deux familles, un fond vidéo n’a pas d’effet visuel (#8792, #8798)', () => {
  test('fond image : ouverture, puis visuel', () => {
    expect(studioSceneEffectsServed('image')).toEqual(['opening', 'visual']);
  });
  test('fond vidéo : ouverture seulement', () => {
    expect(studioSceneEffectsServed('video')).toEqual(['opening']);
  });
  test('aucun fond média : aucune colonne', () => {
    expect(studioSceneEffectsServed(null)).toEqual([]);
  });
});

describe('studioEffectToggled / studioEffectCarousel — le carrousel remplace audience et Publier (#8712)', () => {
  test('toucher l’effet ouvert le referme, un autre bascule', () => {
    expect(studioEffectToggled('opening', 'opening')).toBeNull();
    expect(studioEffectToggled('visual', 'opening')).toBe('visual');
    expect(studioEffectToggled('visual', null)).toBe('visual');
  });
  test('le carrousel vit tant que son effet est servi, sans objet touché ni outil', () => {
    const base = { open: 'visual' as const, served: ['opening', 'visual'] as const, objectSelected: false, toolOpen: false };
    expect(studioEffectCarousel(base)).toBe('visual');
    expect(studioEffectCarousel({ ...base, served: ['opening'] })).toBeNull();
    expect(studioEffectCarousel({ ...base, objectSelected: true })).toBeNull();
    expect(studioEffectCarousel({ ...base, toolOpen: true })).toBeNull();
    expect(studioEffectCarousel({ ...base, open: null })).toBeNull();
  });
});

describe('studioTransitionsAfter / studioRehearsal — chaque choix rejoue ouverture puis fermeture (#8792)', () => {
  const current = { opening: 'fade' as const, closing: 'zoom' as const };
  test('une ouverture garde la fermeture, une fermeture garde l’ouverture', () => {
    expect(studioTransitionsAfter({ kind: 'opening', effect: 'slide' }, current)).toEqual({ opening: 'slide', closing: 'zoom' });
    expect(studioTransitionsAfter({ kind: 'closing', effect: null }, current)).toEqual({ opening: 'fade', closing: null });
  });
  test('un effet visuel ne touche aucune transition, mais rejoue les deux', () => {
    expect(studioTransitionsAfter({ kind: 'visual', filter: 'bw' }, current)).toEqual(current);
    expect(studioRehearsal({ kind: 'visual', filter: 'bw' }, current)).toEqual(current);
  });
  test('sans aucune transition, rien à rejouer', () => {
    expect(studioRehearsal({ kind: 'visual', filter: null }, { opening: null, closing: null })).toBeNull();
    expect(studioRehearsal({ kind: 'opening', effect: null }, { opening: 'fade', closing: null })).toBeNull();
  });
});

describe('studioTrailingFocus / studioTrailingOptions / studioTrailingFoot — les options en haut, l’historique en bas (#8713, #8714)', () => {
  test('rien de touché, fond média : les effets, l’ouvert marqué, aucun (x)', () => {
    const focus = studioTrailingFocus({ toolOpen: false, object: null, effects: ['opening', 'visual'], openEffect: 'visual' });
    expect(studioTrailingOptions(focus)).toEqual([
      { kind: 'effect', effect: 'opening', open: false },
      { kind: 'effect', effect: 'visual', open: true },
    ]);
  });
  test('un effet ouvert que la scène ne sert plus n’est pas marqué', () => {
    const focus = studioTrailingFocus({ toolOpen: false, object: null, effects: ['opening'], openEffect: 'visual' });
    expect(studioTrailingOptions(focus)).toEqual([{ kind: 'effect', effect: 'opening', open: false }]);
  });
  test('un objet touché : « Modifier » d’abord, ses actions, puis (x) en dernier', () => {
    const focus = studioTrailingFocus({ toolOpen: false, object: { id: 't1', actions: ['raise', 'edit', 'remove'] }, effects: ['opening'], openEffect: null });
    expect(studioTrailingOptions(focus)).toEqual([
      { kind: 'object-action', action: 'edit' },
      { kind: 'object-action', action: 'raise' },
      { kind: 'object-action', action: 'remove' },
      { kind: 'exit-object' },
    ]);
  });
  test('un outil ouvert l’emporte sur la sélection : ses réglages vivent dans sa plaque, aucune option au rail', () => {
    const focus = studioTrailingFocus({ toolOpen: true, object: { id: 't1', actions: ['edit'] }, effects: ['opening'], openEffect: 'opening' });
    expect(focus.kind).toBe('tool');
    expect(studioTrailingOptions(focus)).toEqual([]);
  });
  test('le bas : TOUJOURS annuler et rétablir, « Temps » dessus sur une scène animée, jamais avec un outil ouvert', () => {
    const scene = studioTrailingFocus({ toolOpen: false, object: null, effects: [], openEffect: null });
    const tool = studioTrailingFocus({ toolOpen: true, object: null, effects: [], openEffect: null });
    expect(studioTrailingFoot(scene, true)).toEqual(['time', 'undo', 'redo']);
    expect(studioTrailingFoot(scene, false)).toEqual(['undo', 'redo']);
    expect(studioTrailingFoot(tool, true)).toEqual(['undo', 'redo']);
  });
});
