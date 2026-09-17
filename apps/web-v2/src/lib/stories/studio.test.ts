import { describe, expect, test } from 'bun:test';

import {
  canPublishStudioDraft,
  emptyStudioDraft,
  isStudioDraftEmpty,
  readyAssetOf,
  selectedTextLayer,
  studioDoorAccepts,
  studioDraftFromSnapshot,
  studioFailureKey,
  studioSnapshotOf,
  withAddedText,
  withSelected,
  withSound,
  withSoundPlane,
  withSoundUpload,
  withText,
  withTextLayer,
  withVisual,
  withVisualAspectRatio,
  withVisualCaption,
  withVisualPose,
  withVisualUpload,
  withoutSound,
  withoutText,
  withoutVisual,
  type StudioDraft,
} from './studio';
import { IDENTITY_POSE } from './studio-pose';

const file = (name: string, type: string): File => new File([new Uint8Array([1, 2, 3])], name, { type });

const empty = (): StudioDraft => emptyStudioDraft('fr');
const seedId = (draft: StudioDraft): string => draft.texts[0]!.id;
const typed = (text: string): StudioDraft => {
  const draft = empty();
  return withText(draft, seedId(draft), text);
};

const visualAsset = () => ({
  file: file('a.jpg', 'image/jpeg'),
  previewUrl: 'blob:bg',
  mediaType: 'image' as const,
  upload: { phase: 'uploading' as const, progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
});
const soundAsset = () => ({
  file: file('a.m4a', 'audio/mp4'),
  previewUrl: 'blob:snd',
  upload: { phase: 'uploading' as const, progress: 0 },
  plane: 'background' as const,
});

describe('emptyStudioDraft / isStudioDraftEmpty', () => {
  test('un plateau neuf est vide, mais porte DÉJÀ un objet texte sélectionné', () => {
    const draft = empty();
    expect(isStudioDraftEmpty(draft)).toBe(true);
    expect(draft.texts).toHaveLength(1);
    expect(draft.selected).toBe(seedId(draft));
    expect(selectedTextLayer(draft)?.text).toBe('');
  });
  test('l’objet texte naît dans la langue de composition, pas dans celle du navigateur', () => {
    expect(emptyStudioDraft('ar').texts[0]!.language).toBe('ar');
  });
  test('un texte seul le rend NON vide', () => expect(isStudioDraftEmpty(typed('x'))).toBe(false));
  test('un texte fait d’espaces reste VIDE (miroir du serveur, .trim())', () => expect(isStudioDraftEmpty(typed('   '))).toBe(true));
  test('un fond seul le rend NON vide', () => expect(isStudioDraftEmpty(withVisual(empty(), 'visual', visualAsset()))).toBe(false));
  test('un CALQUE seul le rend NON vide', () => expect(isStudioDraftEmpty(withVisual(empty(), 'overlay', visualAsset()))).toBe(false));
  test('un son seul le rend NON vide', () => expect(isStudioDraftEmpty(withSound(empty(), soundAsset()))).toBe(false));
});

describe('les objets TEXTE s’AJOUTENT — c’est tout l’objet du lot (#6943)', () => {
  test('ajouter un texte crée un objet NEUF, d’identifiant distinct, et le SÉLECTIONNE', () => {
    const draft = withAddedText(typed('Bonjour'), 'en');
    expect(draft.texts).toHaveLength(2);
    expect(new Set(draft.texts.map((l) => l.id)).size).toBe(2);
    expect(draft.selected).toBe(draft.texts[1]!.id);
    expect(draft.texts[1]!.language).toBe('en');
  });

  test('l’identifiant se calcule contre l’EXISTANT — un brouillon relu ne fait pas renaître `text-1`', () => {
    const restored = studioDraftFromSnapshot(
      { texts: [{ id: 'text-1', text: 'a' }, { id: 'text-7', text: 'b' }] },
      (u) => u,
      'fr',
    );
    expect(withAddedText(restored, 'fr').texts[2]!.id).toBe('text-8');
  });

  test('chaque texte garde SA pose, SA langue et SON style — un réglage n’en touche qu’un', () => {
    const two = withAddedText(typed('Bonjour'), 'en');
    const first = two.texts[0]!.id;
    const second = two.texts[1]!.id;
    const styled = withTextLayer(two, second, (layer) => ({ ...layer, effect: 'neon', pose: { x: 0.1, y: 0.2, scale: 3, rotation: 45 } }));
    expect(styled.texts[0]!.effect).toBe('none');
    expect(styled.texts[0]!.pose).toEqual(IDENTITY_POSE);
    expect(styled.texts[1]!.effect).toBe('neon');
    expect(styled.texts[1]!.pose).toEqual({ x: 0.1, y: 0.2, scale: 3, rotation: 45 });
    expect(first).not.toBe(second);
  });

  test('retirer un texte parmi PLUSIEURS le retire et reporte la sélection', () => {
    const two = withAddedText(typed('Bonjour'), 'fr');
    const removed = withoutText(two, two.texts[1]!.id);
    expect(removed.texts).toHaveLength(1);
    expect(removed.selected).toBe(removed.texts[0]!.id);
  });

  test('retirer le DERNIER texte le VIDE sans le supprimer — un plateau sans cible de frappe serait un cul-de-sac', () => {
    const one = typed('Bonjour');
    const cleared = withoutText(one, seedId(one));
    expect(cleared.texts).toHaveLength(1);
    expect(cleared.texts[0]!.text).toBe('');
    expect(cleared.selected).toBe(seedId(one));
  });

  test('la sélection se pose et se retire', () => {
    expect(withSelected(empty(), null).selected).toBeNull();
    expect(selectedTextLayer(withSelected(empty(), 'inconnu'))).toBeNull();
  });
});

describe('withVisual / withoutVisual — REMPLACE, ne s’empile pas (P1, une seule place par porte)', () => {
  test('poser un second fond REMPLACE le premier', () => {
    const first = withVisual(empty(), 'visual', visualAsset());
    const second = withVisual(first, 'visual', { ...visualAsset(), previewUrl: 'blob:bg2' });
    expect(second.background?.previewUrl).toBe('blob:bg2');
  });

  test('le FOND et le CALQUE sont deux places distinctes — poser l’un ne touche pas l’autre', () => {
    const both = withVisual(withVisual(empty(), 'visual', visualAsset()), 'overlay', { ...visualAsset(), previewUrl: 'blob:ov' });
    expect(both.background?.previewUrl).toBe('blob:bg');
    expect(both.overlay?.previewUrl).toBe('blob:ov');
  });

  test('withoutVisual retire sans muter le brouillon reçu, et lâche la sélection du calque', () => {
    const withAsset = withSelected(withVisual(empty(), 'overlay', visualAsset()), 'overlay');
    const without = withoutVisual(withAsset, 'overlay');
    expect(withAsset.overlay).not.toBeNull();
    expect(without.overlay).toBeNull();
    expect(without.selected).toBeNull();
  });
});

describe('withVisualUpload / withSoundUpload — met à jour le SEUL champ upload, sans toucher au fichier', () => {
  test('idempotent sans asset (aucun effet, jamais une exception)', () => {
    expect(withVisualUpload(empty(), 'visual', { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' }).background).toBeNull();
  });

  test('fait passer uploading -> ready sans changer le fichier ni l’URL locale', () => {
    const draft = withVisual(empty(), 'visual', visualAsset());
    const ready = withVisualUpload(draft, 'visual', { phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.previewUrl).toBe('blob:bg');
    expect(ready.background?.file).toBe(draft.background!.file);
  });

  test('son : idem', () => {
    const failed = withSoundUpload(withSound(empty(), soundAsset()), { phase: 'failed', reasonKey: 'story.studio.failure.network' });
    expect(failed.sound?.upload).toEqual({ phase: 'failed', reasonKey: 'story.studio.failure.network' });
  });
});

describe('LE SON se place en FOND ou POSÉ (#6943)', () => {
  test('il naît en fond — le cas nominal d’une story', () => {
    expect(withSound(empty(), soundAsset()).sound?.plane).toBe('background');
  });
  test('la bascule change SON plan, et rien d’autre', () => {
    const posed = withSoundPlane(withSound(empty(), soundAsset()), 'foreground');
    expect(posed.sound?.plane).toBe('foreground');
    expect(posed.sound?.previewUrl).toBe('blob:snd');
  });
  test('sans son, la bascule est inerte', () => expect(withSoundPlane(empty(), 'foreground').sound).toBeNull());
});

describe('LA LÉGENDE d’un média (#6944) — un TROISIÈME contenu, jamais Post.content', () => {
  test('elle se pose sur la porte de SON média', () => {
    const both = withVisual(withVisual(empty(), 'visual', visualAsset()), 'overlay', visualAsset());
    const captioned = withVisualCaption(both, 'visual', 'Au lever du jour');
    expect(captioned.background?.caption).toBe('Au lever du jour');
    expect(captioned.overlay?.caption).toBe('');
  });

  test('elle est TAILLÉE à la saisie — l’auteur ne perd pas sa phrase au moment de publier', () => {
    const captioned = withVisualCaption(withVisual(empty(), 'visual', visualAsset()), 'visual', 'x'.repeat(1500));
    expect(captioned.background?.caption).toHaveLength(1000);
  });

  test('sans média, aucune légende à poser', () => expect(withVisualCaption(empty(), 'visual', 'x').background).toBeNull());
});

describe('withVisualPose — le CALQUE se déplace, s’agrandit et tourne, DANS ses bornes', () => {
  test('la pose est bornée à l’écriture, jamais au rendu', () => {
    const posed = withVisualPose(withVisual(empty(), 'overlay', visualAsset()), 'overlay', { x: 3, y: -1, scale: 99, rotation: 540 });
    expect(posed.overlay?.pose).toEqual({ x: 1, y: 0, scale: 4, rotation: 180 });
  });
});

describe('canPublishStudioDraft — loi 4, un contrôle existe s’il a un effet', () => {
  test('vide ⇒ inerte', () => expect(canPublishStudioDraft(empty())).toBe(false));

  test('texte seul ⇒ publiable', () => expect(canPublishStudioDraft(typed('Bonjour'))).toBe(true));

  test('fond en ÉCHEC ⇒ inerte tant que non résolu', () => {
    const draft = withVisualUpload(withVisual(empty(), 'visual', visualAsset()), 'visual', {
      phase: 'failed',
      reasonKey: 'story.studio.failure.network',
    });
    expect(canPublishStudioDraft(draft)).toBe(false);
  });

  test('CALQUE en échec ⇒ inerte aussi — la garde couvre les TROIS portes', () => {
    const draft = withVisualUpload(withVisual(empty(), 'overlay', visualAsset()), 'overlay', {
      phase: 'failed',
      reasonKey: 'story.studio.failure.tooLarge',
    });
    expect(canPublishStudioDraft(draft)).toBe(false);
  });

  test('fond EN VOL ⇒ publiable (publier() attend l’accusé, ne bloque pas le geste)', () => {
    const draft = withVisual(empty(), 'visual', visualAsset());
    expect(draft.background?.upload.phase).toBe('uploading');
    expect(canPublishStudioDraft(draft)).toBe(true);
  });

  test('son PRÊT + texte ⇒ publiable', () => {
    const draft = withSoundUpload(withSound(typed('x'), soundAsset()), { phase: 'ready', postMediaId: 'pm-2', fileUrl: 'k' });
    expect(canPublishStudioDraft(draft)).toBe(true);
  });
});

describe('readyAssetOf', () => {
  test('phase ready ⇒ la référence', () =>
    expect(readyAssetOf({ phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' })).toEqual({ postMediaId: 'pm-1', fileUrl: 'k' }));
  test('phase ready avec thumbHash (accusé TUS, §0 défaut 7) ⇒ recopié', () =>
    expect(readyAssetOf({ phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k', thumbHash: 'abc' })).toEqual({
      postMediaId: 'pm-1',
      fileUrl: 'k',
      thumbHash: 'abc',
    }));
  test('uploading/failed ⇒ null', () => {
    expect(readyAssetOf({ phase: 'uploading', progress: 0.5 })).toBeNull();
    expect(readyAssetOf({ phase: 'failed', reasonKey: 'story.studio.failure.network' })).toBeNull();
  });
});

describe('withVisualAspectRatio — la mesure LOCALE (§0, défaut 7)', () => {
  test('pose le rapport sur le média COURANT de cette porte', () => {
    const measured = withVisualAspectRatio(withVisual(empty(), 'visual', visualAsset()), 'visual', 'blob:bg', 0.5625);
    expect(measured.background?.aspectRatio).toBe(0.5625);
  });

  test('un média déjà REMPLACÉ (autre `previewUrl`) le temps de la mesure n’hérite PAS le rapport de l’ancien fichier', () => {
    const replaced = withVisual(withVisual(empty(), 'visual', visualAsset()), 'visual', { ...visualAsset(), previewUrl: 'blob:bg2' });
    const stale = withVisualAspectRatio(replaced, 'visual', 'blob:bg', 0.5625);
    expect(stale).toBe(replaced);
    expect(stale.background?.aspectRatio).toBeUndefined();
  });

  test('un média RETIRÉ le temps de la mesure ne ressuscite pas', () => {
    const removed = withoutVisual(withVisual(empty(), 'visual', visualAsset()), 'visual');
    expect(withVisualAspectRatio(removed, 'visual', 'blob:bg', 0.5625)).toBe(removed);
  });
});

describe('withoutSound — miroir de withoutVisual', () => {
  test('retire sans muter', () => {
    const withAsset = withSound(empty(), soundAsset());
    const without = withoutSound(withAsset);
    expect(withAsset.sound).not.toBeNull();
    expect(without.sound).toBeNull();
  });
});

describe('immuabilité — chaque transition rend une valeur NEUVE', () => {
  test('withText ne mute pas le brouillon reçu', () => {
    const before = empty();
    const after = withText(before, seedId(before), 'x');
    expect(before.texts[0]!.text).toBe('');
    expect(after.texts[0]!.text).toBe('x');
    expect(after).not.toBe(before);
  });
});

describe('studioDoorAccepts — le rôle vient de la PORTE, et un fichier hors de sa porte est REFUSÉ (§ 1.3)', () => {
  test('les deux portes visuelles prennent image et vidéo, jamais un son', () => {
    for (const door of ['visual', 'overlay'] as const) {
      expect(studioDoorAccepts(door, 'image/jpeg')).toBe(true);
      expect(studioDoorAccepts(door, 'video/mp4')).toBe(true);
      expect(studioDoorAccepts(door, 'audio/mpeg')).toBe(false);
    }
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
  test('les textes AVEC leur pose et les médias PRÊTS se persistent ; relus, ils sont PRÊTS sans aucun fichier local', () => {
    const two = withTextLayer(withAddedText(typed('Salut'), 'en'), 'text-2', (layer) => ({
      ...layer,
      text: 'Hello',
      effect: 'glow',
      pose: { x: 0.25, y: 0.75, scale: 2, rotation: 30 },
    }));
    const draft = withSoundUpload(
      withSound(
        withVisualUpload(withVisual(two, 'visual', visualAsset()), 'visual', {
          phase: 'ready',
          postMediaId: 'pm-bg',
          fileUrl: '2026/09/bg.jpg',
        }),
        soundAsset(),
      ),
      { phase: 'uploading', progress: 0.5 },
    );
    const snapshot = studioSnapshotOf(withVisualCaption(draft, 'visual', 'Au marché'), 'es');
    expect(snapshot.language).toBe('es');
    expect(snapshot.texts.map((l) => l.text)).toEqual(['Salut', 'Hello']);
    expect(snapshot.background).toEqual({
      postMediaId: 'pm-bg',
      fileUrl: '2026/09/bg.jpg',
      mediaType: 'image',
      caption: 'Au marché',
      pose: IDENTITY_POSE,
    });
    // Le son est EN VOL : il n'a pas d'identité serveur à conserver.
    expect(snapshot.sound).toBeUndefined();

    const restored = studioDraftFromSnapshot(snapshot, (fileUrl) => `https://cdn/${fileUrl}`, 'fr');
    expect(restored.texts.map((l) => l.text)).toEqual(['Salut', 'Hello']);
    expect(restored.texts[1]!.effect).toBe('glow');
    expect(restored.texts[1]!.pose).toEqual({ x: 0.25, y: 0.75, scale: 2, rotation: 30 });
    expect(restored.texts[1]!.language).toBe('en');
    expect(restored.background?.caption).toBe('Au marché');
    expect(restored.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-bg', fileUrl: '2026/09/bg.jpg' });
    expect(restored.background?.previewUrl).toBe('https://cdn/2026/09/bg.jpg');
    expect(restored.background?.file).toBeUndefined();
    expect(restored.sound).toBeNull();
    expect(canPublishStudioDraft(restored)).toBe(true);
  });

  test('un CALQUE et un son POSÉ survivent avec leur plan et leur pose', () => {
    const draft = withVisualPose(
      withVisualUpload(withVisual(empty(), 'overlay', visualAsset()), 'overlay', { phase: 'ready', postMediaId: 'pm-ov', fileUrl: 'o.png' }),
      'overlay',
      { x: 0.2, y: 0.3, scale: 1.5, rotation: -20 },
    );
    const withPosedSound = withSoundPlane(
      withSoundUpload(withSound(draft, soundAsset()), { phase: 'ready', postMediaId: 'pm-snd', fileUrl: 's.m4a' }),
      'foreground',
    );
    const restored = studioDraftFromSnapshot(studioSnapshotOf(withPosedSound, 'fr'), (u) => u, 'fr');
    expect(restored.overlay?.pose).toEqual({ x: 0.2, y: 0.3, scale: 1.5, rotation: -20 });
    expect(restored.sound?.plane).toBe('foreground');
  });

  test('aucun brouillon ⇒ un plateau vide, dans la langue demandée', () => {
    const restored = studioDraftFromSnapshot(null, (u) => u, 'pt');
    expect(isStudioDraftEmpty(restored)).toBe(true);
    expect(restored.texts[0]!.language).toBe('pt');
  });

  test('un objet texte ABÎMÉ est NORMALISÉ, jamais rendu tel quel — un style que rien ne peint serait pire', () => {
    const restored = studioDraftFromSnapshot(
      { texts: [{ id: 'text-1', text: 'a', style: 'zapfino', effect: 'licorne', color: 'nope', align: 'justifié', pose: { scale: -3 } }] },
      (u) => u,
      'fr',
    );
    const layer = restored.texts[0]!;
    expect(layer.style).toBe('bold');
    expect(layer.effect).toBe('none');
    expect(layer.color).toBe('FFFFFF');
    expect(layer.align).toBe('center');
    expect(layer.pose).toEqual(IDENTITY_POSE);
  });

  test('aspectRatio (mesure locale) et thumbHash (accusé TUS) SURVIVENT au remontage (§0, défaut 7)', () => {
    const withAspect = withVisualAspectRatio(withVisual(empty(), 'visual', visualAsset()), 'visual', 'blob:bg', 0.5625);
    const draft = withVisualUpload(withAspect, 'visual', { phase: 'ready', postMediaId: 'pm-bg', fileUrl: '2026/09/bg.jpg', thumbHash: 'abc123' });

    const snapshot = studioSnapshotOf(draft, 'fr');
    expect(snapshot.background).toEqual({
      postMediaId: 'pm-bg',
      fileUrl: '2026/09/bg.jpg',
      thumbHash: 'abc123',
      mediaType: 'image',
      aspectRatio: 0.5625,
      pose: IDENTITY_POSE,
    });

    const restored = studioDraftFromSnapshot(snapshot, (fileUrl) => `https://cdn/${fileUrl}`, 'fr');
    expect(restored.background?.aspectRatio).toBe(0.5625);
    expect(restored.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-bg', fileUrl: '2026/09/bg.jpg', thumbHash: 'abc123' });
  });
});
