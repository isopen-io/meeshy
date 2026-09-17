import { describe, expect, test } from 'bun:test';

import {
  canPublishStudioDraft,
  studioDoorAccepts,
  studioDraftFromSnapshot,
  studioFailureKey,
  studioSnapshotOf,
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

const backgroundAsset = () => ({ file: file('a.jpg', 'image/jpeg'), previewUrl: 'blob:bg', mediaType: 'image' as const, upload: { phase: 'uploading' as const, progress: 0 } });
const soundAsset = () => ({ file: file('a.m4a', 'audio/mp4'), previewUrl: 'blob:snd', upload: { phase: 'uploading' as const, progress: 0 } });

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
    const failed = withSoundUpload(draft, { phase: 'failed', reasonKey: 'story.studio.failure.network' });
    expect(failed.sound?.upload).toEqual({ phase: 'failed', reasonKey: 'story.studio.failure.network' });
  });
});

describe('canPublishStudioDraft — loi 4, un contrôle existe s’il a un effet', () => {
  test('vide ⇒ inerte', () => expect(canPublishStudioDraft(emptyStudioDraft())).toBe(false));

  test('texte seul ⇒ publiable', () => expect(canPublishStudioDraft(withText(emptyStudioDraft(), 'Bonjour'))).toBe(true));

  test('fond en ÉCHEC ⇒ inerte tant que non résolu', () => {
    const draft = withBackgroundUpload(withBackground(emptyStudioDraft(), backgroundAsset()), { phase: 'failed', reasonKey: 'story.studio.failure.network' });
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
    expect(readyAssetOf({ phase: 'uploading', progress: 0.5 })).toBeNull();
    expect(readyAssetOf({ phase: 'failed', reasonKey: 'story.studio.failure.network' })).toBeNull();
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

describe('studioDoorAccepts — le rôle vient de la PORTE, et un fichier hors de sa porte est REFUSÉ (§ 1.3)', () => {
  test('la porte visuelle prend image et vidéo, jamais un son', () => {
    expect(studioDoorAccepts('visual', 'image/jpeg')).toBe(true);
    expect(studioDoorAccepts('visual', 'video/mp4')).toBe(true);
    expect(studioDoorAccepts('visual', 'audio/mpeg')).toBe(false);
  });
  test('la porte sonore prend un son, jamais une image', () => {
    expect(studioDoorAccepts('sound', 'audio/mp4')).toBe(true);
    expect(studioDoorAccepts('sound', 'image/png')).toBe(false);
  });
  test('un MIME INCONNU du navigateur (chaîne vide) passe : la passerelle juge les OCTETS (tus-handler.ts:384-400)', () => {
    expect(studioDoorAccepts('visual', '')).toBe(true);
    expect(studioDoorAccepts('sound', '')).toBe(true);
  });
});

describe('studioFailureKey — la cause se DIT dans la langue de l’interface, avec le vocabulaire d’une story', () => {
  const failure = (status: number, code?: string) => ({ ok: false as const, status, error: 'x', ...(code !== undefined ? { code } : {}) });
  test('réseau, délai, annulation', () => {
    expect(studioFailureKey(failure(0, 'NETWORK'), 'upload')).toBe('story.studio.failure.network');
    expect(studioFailureKey(failure(0, 'TIMEOUT'), 'publish')).toBe('story.studio.failure.timeout');
    expect(studioFailureKey(failure(0, 'ABORTED'), 'upload')).toBeNull();
  });
  test('les refus de la montée ont leurs causes propres (413, 400, invité)', () => {
    expect(studioFailureKey(failure(413), 'upload')).toBe('story.studio.failure.tooLarge');
    expect(studioFailureKey(failure(400), 'upload')).toBe('story.studio.failure.fileRefused');
    expect(studioFailureKey(failure(403, 'POST_MEDIA_REQUIRES_ACCOUNT'), 'upload')).toBe('story.studio.failure.account');
  });
  test('la publication : session, cadence, refus, panne serveur, garde client', () => {
    expect(studioFailureKey(failure(401), 'publish')).toBe('story.studio.failure.session');
    expect(studioFailureKey(failure(429), 'publish')).toBe('story.studio.failure.rateLimited');
    expect(studioFailureKey(failure(400), 'publish')).toBe('story.studio.failure.refused');
    expect(studioFailureKey(failure(503), 'publish')).toBe('story.studio.failure.unavailable');
    expect(studioFailureKey(failure(0, 'MEDIA_NOT_CLAIMED'), 'publish')).toBe('story.studio.failure.refused');
  });
});

describe('studioSnapshotOf / studioDraftFromSnapshot — ce qui survit à un remontage', () => {
  test('seuls le texte et les médias PRÊTS se persistent ; relus, ils sont PRÊTS sans aucun fichier local', () => {
    const draft = withSoundUpload(
      withSound(
        withBackgroundUpload(withBackground(withText(emptyStudioDraft(), 'Salut'), backgroundAsset()), {
          phase: 'ready',
          postMediaId: 'pm-bg',
          fileUrl: '2026/09/bg.jpg',
        }),
        soundAsset(),
      ),
      { phase: 'uploading', progress: 0.5 },
    );
    const snapshot = studioSnapshotOf(draft, 'es');
    expect(snapshot).toEqual({ text: 'Salut', language: 'es', background: { postMediaId: 'pm-bg', fileUrl: '2026/09/bg.jpg', mediaType: 'image' } });

    const restored = studioDraftFromSnapshot(snapshot, (fileUrl) => `https://cdn/${fileUrl}`);
    expect(restored.text).toBe('Salut');
    expect(restored.language).toBe('es');
    expect(restored.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-bg', fileUrl: '2026/09/bg.jpg' });
    expect(restored.background?.previewUrl).toBe('https://cdn/2026/09/bg.jpg');
    expect(restored.background?.file).toBeUndefined();
    expect(restored.sound).toBeNull();
    expect(canPublishStudioDraft(restored)).toBe(true);
  });

  test('aucun brouillon ⇒ un studio vide', () => {
    expect(isStudioDraftEmpty(studioDraftFromSnapshot(null, (u) => u))).toBe(true);
  });
});
