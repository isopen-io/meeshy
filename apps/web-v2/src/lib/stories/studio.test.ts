import { describe, expect, test } from 'bun:test';

import {
  canPublishStudioDraft,
  emptyStudioDraft,
  isStudioDraftEmpty,
  readyAssetOf,
  withBackground,
  withBackgroundUpload,
  withoutBackground,
  withoutSound,
  withSound,
  withSoundUpload,
  withText,
  type StudioDraft,
} from './studio';

const file = (name: string, type: string): File => new File([new Uint8Array([1, 2, 3])], name, { type });

const backgroundAsset = () => ({ file: file('a.jpg', 'image/jpeg'), previewUrl: 'blob:bg', mediaType: 'image' as const, upload: { phase: 'uploading' as const } });
const soundAsset = () => ({ file: file('a.m4a', 'audio/mp4'), previewUrl: 'blob:snd', upload: { phase: 'uploading' as const } });

describe('emptyStudioDraft / isStudioDraftEmpty', () => {
  test('un brouillon neuf est vide', () => expect(isStudioDraftEmpty(emptyStudioDraft())).toBe(true));
  test('un texte seul le rend NON vide', () => expect(isStudioDraftEmpty(withText(emptyStudioDraft(), 'x'))).toBe(false));
  test('un texte fait d’espaces reste VIDE (miroir du serveur, .trim())', () =>
    expect(isStudioDraftEmpty(withText(emptyStudioDraft(), '   '))).toBe(true));
  test('un fond seul le rend NON vide', () => expect(isStudioDraftEmpty(withBackground(emptyStudioDraft(), backgroundAsset()))).toBe(false));
  test('un son seul le rend NON vide', () => expect(isStudioDraftEmpty(withSound(emptyStudioDraft(), soundAsset()))).toBe(false));
});

describe('withBackground / withoutBackground — REMPLACE, ne s’empile pas (P1, une seule place)', () => {
  test('poser un second fond REMPLACE le premier', () => {
    const first = withBackground(emptyStudioDraft(), backgroundAsset());
    const second = withBackground(first, { ...backgroundAsset(), previewUrl: 'blob:bg2' });
    expect(second.background?.previewUrl).toBe('blob:bg2');
  });

  test('withoutBackground retire sans muter le brouillon reçu', () => {
    const withAsset = withBackground(emptyStudioDraft(), backgroundAsset());
    const without = withoutBackground(withAsset);
    expect(withAsset.background).not.toBeNull();
    expect(without.background).toBeNull();
  });
});

describe('withBackgroundUpload / withSoundUpload — met à jour le SEUL champ upload, sans toucher au fichier', () => {
  test('idempotent sans asset (aucun effet, jamais une exception)', () => {
    const draft = withBackgroundUpload(emptyStudioDraft(), { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' });
    expect(draft.background).toBeNull();
  });

  test('fait passer uploading -> ready sans changer le fichier ni l’URL locale', () => {
    const draft = withBackground(emptyStudioDraft(), backgroundAsset());
    const ready = withBackgroundUpload(draft, { phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.previewUrl).toBe('blob:bg');
    expect(ready.background?.file).toBe(draft.background!.file);
  });

  test('son : idem', () => {
    const draft = withSound(emptyStudioDraft(), soundAsset());
    const failed = withSoundUpload(draft, { phase: 'failed', reason: 'réseau indisponible' });
    expect(failed.sound?.upload).toEqual({ phase: 'failed', reason: 'réseau indisponible' });
  });
});

describe('canPublishStudioDraft — loi 4, un contrôle existe s’il a un effet', () => {
  test('vide ⇒ inerte', () => expect(canPublishStudioDraft(emptyStudioDraft())).toBe(false));

  test('texte seul ⇒ publiable', () => expect(canPublishStudioDraft(withText(emptyStudioDraft(), 'Bonjour'))).toBe(true));

  test('fond en ÉCHEC ⇒ inerte tant que non résolu', () => {
    const draft = withBackgroundUpload(withBackground(emptyStudioDraft(), backgroundAsset()), { phase: 'failed', reason: 'x' });
    expect(canPublishStudioDraft(draft)).toBe(false);
  });

  test('fond EN VOL ⇒ publiable (publier() attend l’accusé, ne bloque pas le geste)', () => {
    const draft = withBackground(emptyStudioDraft(), backgroundAsset());
    expect(draft.background?.upload.phase).toBe('uploading');
    expect(canPublishStudioDraft(draft)).toBe(true);
  });

  test('son PRÊT + texte ⇒ publiable', () => {
    const draft = withSoundUpload(withSound(withText(emptyStudioDraft(), 'x'), soundAsset()), {
      phase: 'ready',
      postMediaId: 'pm-2',
      fileUrl: 'k',
    });
    expect(canPublishStudioDraft(draft)).toBe(true);
  });
});

describe('readyAssetOf', () => {
  test('phase ready ⇒ la référence', () =>
    expect(readyAssetOf({ phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' })).toEqual({ postMediaId: 'pm-1', fileUrl: 'k' }));
  test('uploading/failed ⇒ null', () => {
    expect(readyAssetOf({ phase: 'uploading' })).toBeNull();
    expect(readyAssetOf({ phase: 'failed', reason: 'x' })).toBeNull();
  });
});

describe('withoutSound — miroir de withoutBackground', () => {
  test('retire sans muter', () => {
    const withAsset = withSound(emptyStudioDraft(), soundAsset());
    const without = withoutSound(withAsset);
    expect(withAsset.sound).not.toBeNull();
    expect(without.sound).toBeNull();
  });
});

describe('immuabilité — chaque transition rend une valeur NEUVE', () => {
  test('withText ne mute pas le brouillon reçu', () => {
    const before: StudioDraft = emptyStudioDraft();
    const after = withText(before, 'x');
    expect(before.text).toBe('');
    expect(after.text).toBe('x');
    expect(after).not.toBe(before);
  });
});
