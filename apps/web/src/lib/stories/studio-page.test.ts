import { describe, expect, test } from 'bun:test';

import {
  emptyStudioPage,
  isStudioPageEmpty,
  isStudioPagePublishable,
  pageMediaCount,
  pageWithAddedText,
  pageWithMediaDuration,
  pageWithSelected,
  pageWithSound,
  pageWithSoundPlane,
  pageWithSoundUpload,
  pageWithText,
  pageWithTextLayer,
  pageWithVisual,
  pageWithVisualAspectRatio,
  pageWithVisualCaption,
  pageWithVisualPose,
  pageWithVisualUpload,
  pageWithoutSound,
  pageWithoutText,
  pageWithoutVisual,
  readyAssetOf,
  selectedTextLayerOf,
  studioDoorAccepts,
  studioFailureKey,
} from './studio-page';
import { IDENTITY_POSE } from './studio-pose';

/**
 * **UNE PAGE = UN FOND, UN CALQUE, DES TEXTES, UN SON** (#7684) — les cas de
 * `studio.test.ts` (avant ce lot) DÉPLACÉS ici tels quels : le studio de
 * #6900/#6943/#6944 les vérifiait sur `StudioDraft` directement ; ils portent
 * désormais sur `StudioPage`, l'unité qui se répète (§1.1 de la
 * spécification). `studio.test.ts` garde la DÉLÉGATION vers la page courante
 * et la gestion des PAGES elles-mêmes.
 */

const file = (name: string, type: string): File => new File([new Uint8Array([1, 2, 3])], name, { type });

const page = (): ReturnType<typeof emptyStudioPage> => emptyStudioPage('page-1', 'text-1', 'fr');
const seedId = (p: ReturnType<typeof emptyStudioPage>): string => p.texts[0]!.id;
const typed = (text: string) => {
  const p = page();
  return pageWithText(p, seedId(p), text);
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

describe('emptyStudioPage / isStudioPageEmpty', () => {
  test('une page NEUVE est vide, mais porte DÉJÀ un objet texte sélectionné', () => {
    const p = page();
    expect(isStudioPageEmpty(p)).toBe(true);
    expect(p.id).toBe('page-1');
    expect(p.texts).toHaveLength(1);
    expect(p.selected).toBe(seedId(p));
    expect(selectedTextLayerOf(p)?.text).toBe('');
  });
  test('l’objet texte naît dans la langue de composition, pas dans celle du navigateur', () => {
    expect(emptyStudioPage('page-1', 'text-1', 'ar').texts[0]!.language).toBe('ar');
  });
  test('un texte seul rend la page NON vide', () => expect(isStudioPageEmpty(typed('x'))).toBe(false));
  test('un texte fait d’espaces reste VIDE (miroir du serveur, .trim())', () => expect(isStudioPageEmpty(typed('   '))).toBe(true));
  test('un fond seul rend la page NON vide', () => expect(isStudioPageEmpty(pageWithVisual(page(), 'visual', visualAsset()))).toBe(false));
  test('un CALQUE seul rend la page NON vide', () => expect(isStudioPageEmpty(pageWithVisual(page(), 'overlay', visualAsset()))).toBe(false));
  test('un son seul rend la page NON vide', () => expect(isStudioPageEmpty(pageWithSound(page(), soundAsset()))).toBe(false));
});

describe('les objets TEXTE s’AJOUTENT sur une page — c’est tout l’objet du lot (#6943)', () => {
  test('ajouter un texte crée un objet NEUF, d’identifiant distinct, et le SÉLECTIONNE', () => {
    const p = pageWithAddedText(typed('Bonjour'), 'text-2', 'en');
    expect(p.texts).toHaveLength(2);
    expect(new Set(p.texts.map((l) => l.id)).size).toBe(2);
    expect(p.selected).toBe(p.texts[1]!.id);
    expect(p.texts[1]!.language).toBe('en');
  });

  test('chaque texte garde SA pose, SA langue et SON style — un réglage n’en touche qu’un', () => {
    const two = pageWithAddedText(typed('Bonjour'), 'text-2', 'en');
    const first = two.texts[0]!.id;
    const second = two.texts[1]!.id;
    const styled = pageWithTextLayer(two, second, (layer) => ({ ...layer, effect: 'neon', pose: { x: 0.1, y: 0.2, scale: 3, rotation: 45 } }));
    expect(styled.texts[0]!.effect).toBe('none');
    expect(styled.texts[0]!.pose).toEqual(IDENTITY_POSE);
    expect(styled.texts[1]!.effect).toBe('neon');
    expect(styled.texts[1]!.pose).toEqual({ x: 0.1, y: 0.2, scale: 3, rotation: 45 });
    expect(first).not.toBe(second);
  });

  test('retirer un texte parmi PLUSIEURS le retire et reporte la sélection', () => {
    const two = pageWithAddedText(typed('Bonjour'), 'text-2', 'fr');
    const removed = pageWithoutText(two, two.texts[1]!.id);
    expect(removed.texts).toHaveLength(1);
    expect(removed.selected).toBe(removed.texts[0]!.id);
  });

  test('retirer le DERNIER texte le VIDE sans le supprimer — une page sans cible de frappe serait un cul-de-sac', () => {
    const one = typed('Bonjour');
    const cleared = pageWithoutText(one, seedId(one));
    expect(cleared.texts).toHaveLength(1);
    expect(cleared.texts[0]!.text).toBe('');
    expect(cleared.selected).toBe(seedId(one));
  });

  test('la sélection se pose et se retire', () => {
    expect(pageWithSelected(page(), null).selected).toBeNull();
    expect(selectedTextLayerOf(pageWithSelected(page(), 'inconnu'))).toBeNull();
  });
});

describe('pageWithVisual / pageWithoutVisual — REMPLACE, ne s’empile pas (P1, une seule place par porte)', () => {
  test('poser un second fond REMPLACE le premier', () => {
    const first = pageWithVisual(page(), 'visual', visualAsset());
    const second = pageWithVisual(first, 'visual', { ...visualAsset(), previewUrl: 'blob:bg2' });
    expect(second.background?.previewUrl).toBe('blob:bg2');
  });

  test('le FOND et le CALQUE sont deux places distinctes — poser l’un ne touche pas l’autre', () => {
    const both = pageWithVisual(pageWithVisual(page(), 'visual', visualAsset()), 'overlay', { ...visualAsset(), previewUrl: 'blob:ov' });
    expect(both.background?.previewUrl).toBe('blob:bg');
    expect(both.overlay?.previewUrl).toBe('blob:ov');
  });

  test('pageWithoutVisual retire sans muter la page reçue, et lâche la sélection du calque', () => {
    const withAsset = pageWithSelected(pageWithVisual(page(), 'overlay', visualAsset()), 'overlay');
    const without = pageWithoutVisual(withAsset, 'overlay');
    expect(withAsset.overlay).not.toBeNull();
    expect(without.overlay).toBeNull();
    expect(without.selected).toBeNull();
  });
});

describe('pageWithVisualUpload / pageWithSoundUpload — met à jour le SEUL champ upload, sans toucher au fichier', () => {
  test('idempotent sans asset (aucun effet, jamais une exception)', () => {
    expect(pageWithVisualUpload(page(), 'visual', { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' }).background).toBeNull();
  });

  test('fait passer uploading -> ready sans changer le fichier ni l’URL locale', () => {
    const p = pageWithVisual(page(), 'visual', visualAsset());
    const ready = pageWithVisualUpload(p, 'visual', { phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-1', fileUrl: '2026/09/x.jpg' });
    expect(ready.background?.previewUrl).toBe('blob:bg');
    expect(ready.background?.file).toBe(p.background!.file);
  });

  test('son : idem', () => {
    const failed = pageWithSoundUpload(pageWithSound(page(), soundAsset()), { phase: 'failed', reasonKey: 'story.studio.failure.network' });
    expect(failed.sound?.upload).toEqual({ phase: 'failed', reasonKey: 'story.studio.failure.network' });
  });
});

describe('LE SON se place en FOND ou POSÉ (#6943)', () => {
  test('il naît en fond — le cas nominal d’une story', () => {
    expect(pageWithSound(page(), soundAsset()).sound?.plane).toBe('background');
  });
  test('la bascule change SON plan, et rien d’autre', () => {
    const posed = pageWithSoundPlane(pageWithSound(page(), soundAsset()), 'foreground');
    expect(posed.sound?.plane).toBe('foreground');
    expect(posed.sound?.previewUrl).toBe('blob:snd');
  });
  test('sans son, la bascule est inerte', () => expect(pageWithSoundPlane(page(), 'foreground').sound).toBeNull());
});

describe('LA LÉGENDE d’un média (#6944) — un TROISIÈME contenu, jamais Post.content', () => {
  test('elle se pose sur la porte de SON média', () => {
    const both = pageWithVisual(pageWithVisual(page(), 'visual', visualAsset()), 'overlay', visualAsset());
    const captioned = pageWithVisualCaption(both, 'visual', 'Au lever du jour');
    expect(captioned.background?.caption).toBe('Au lever du jour');
    expect(captioned.overlay?.caption).toBe('');
  });

  test('elle est TAILLÉE à la saisie — l’auteur ne perd pas sa phrase au moment de publier', () => {
    const captioned = pageWithVisualCaption(pageWithVisual(page(), 'visual', visualAsset()), 'visual', 'x'.repeat(1500));
    expect(captioned.background?.caption).toHaveLength(1000);
  });

  test('sans média, aucune légende à poser', () => expect(pageWithVisualCaption(page(), 'visual', 'x').background).toBeNull());
});

describe('pageWithVisualPose — le CALQUE se déplace, s’agrandit et tourne, DANS ses bornes', () => {
  test('la pose est bornée à l’écriture, jamais au rendu', () => {
    const posed = pageWithVisualPose(pageWithVisual(page(), 'overlay', visualAsset()), 'overlay', { x: 3, y: -1, scale: 99, rotation: 540 });
    expect(posed.overlay?.pose).toEqual({ x: 1, y: 0, scale: 4, rotation: 180 });
  });
});

describe('isStudioPagePublishable — loi 4, un contrôle existe s’il a un effet', () => {
  test('vide ⇒ publiable (une page vide n’empêche rien en soi ; c’est le brouillon entier qui juge le vide)', () =>
    expect(isStudioPagePublishable(page())).toBe(true));

  test('fond en ÉCHEC ⇒ non publiable tant que non résolu', () => {
    const p = pageWithVisualUpload(pageWithVisual(page(), 'visual', visualAsset()), 'visual', {
      phase: 'failed',
      reasonKey: 'story.studio.failure.network',
    });
    expect(isStudioPagePublishable(p)).toBe(false);
  });

  test('CALQUE en échec ⇒ non publiable aussi — la garde couvre les TROIS portes', () => {
    const p = pageWithVisualUpload(pageWithVisual(page(), 'overlay', visualAsset()), 'overlay', {
      phase: 'failed',
      reasonKey: 'story.studio.failure.tooLarge',
    });
    expect(isStudioPagePublishable(p)).toBe(false);
  });

  test('fond EN VOL ⇒ publiable (la publication attend l’accusé, ne bloque pas le geste)', () => {
    const p = pageWithVisual(page(), 'visual', visualAsset());
    expect(p.background?.upload.phase).toBe('uploading');
    expect(isStudioPagePublishable(p)).toBe(true);
  });
});

describe('pageMediaCount — le fond, le calque et le son comptent, prêts OU en vol', () => {
  test('une page vide ne compte aucun média', () => expect(pageMediaCount(page())).toBe(0));
  test('les trois portes comptent chacune pour un', () => {
    const full = pageWithSound(pageWithVisual(pageWithVisual(page(), 'visual', visualAsset()), 'overlay', visualAsset()), soundAsset());
    expect(pageMediaCount(full)).toBe(3);
  });
});

describe('readyAssetOf', () => {
  test('phase ready ⇒ la référence', () =>
    expect(readyAssetOf({ phase: 'ready', postMediaId: 'pm-1', fileUrl: 'k' })).toEqual({ postMediaId: 'pm-1', fileUrl: 'k' }));
  test('phase ready avec thumbHash ⇒ recopié', () =>
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

describe('pageWithVisualAspectRatio — la mesure LOCALE', () => {
  test('pose le rapport sur le média COURANT de cette porte', () => {
    const measured = pageWithVisualAspectRatio(pageWithVisual(page(), 'visual', visualAsset()), 'visual', 'blob:bg', 0.5625);
    expect(measured.background?.aspectRatio).toBe(0.5625);
  });

  test('un média déjà REMPLACÉ (autre `previewUrl`) le temps de la mesure n’hérite PAS le rapport de l’ancien fichier', () => {
    const replaced = pageWithVisual(pageWithVisual(page(), 'visual', visualAsset()), 'visual', { ...visualAsset(), previewUrl: 'blob:bg2' });
    const stale = pageWithVisualAspectRatio(replaced, 'visual', 'blob:bg', 0.5625);
    expect(stale).toBe(replaced);
    expect(stale.background?.aspectRatio).toBeUndefined();
  });

  test('un média RETIRÉ le temps de la mesure ne ressuscite pas', () => {
    const removed = pageWithoutVisual(pageWithVisual(page(), 'visual', visualAsset()), 'visual');
    expect(pageWithVisualAspectRatio(removed, 'visual', 'blob:bg', 0.5625)).toBe(removed);
  });
});

describe('pageWithMediaDuration — la durée mesurée (#7497)', () => {
  test('un visuel', () => {
    const measured = pageWithMediaDuration(pageWithVisual(page(), 'visual', visualAsset()), 'visual', 'blob:bg', 4200);
    expect(measured.background?.durationMs).toBe(4200);
  });
  test('un son', () => {
    const measured = pageWithMediaDuration(pageWithSound(page(), soundAsset()), 'sound', 'blob:snd', 1500);
    expect(measured.sound?.durationMs).toBe(1500);
  });
});

describe('pageWithoutSound — miroir de pageWithoutVisual', () => {
  test('retire sans muter', () => {
    const withAsset = pageWithSound(page(), soundAsset());
    const without = pageWithoutSound(withAsset);
    expect(withAsset.sound).not.toBeNull();
    expect(without.sound).toBeNull();
  });
});

describe('immuabilité — chaque transition rend une valeur NEUVE', () => {
  test('pageWithText ne mute pas la page reçue', () => {
    const before = page();
    const after = pageWithText(before, seedId(before), 'x');
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
