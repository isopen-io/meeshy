import { describe, expect, test } from 'bun:test';

import {
  STUDIO_PAGE_MAX,
  canPublishStudioDraft,
  currentStudioPage,
  emptyStudioDraft,
  isStudioDraftEmpty,
  selectedTextLayer,
  studioDraftFromSnapshot,
  studioMediaCount,
  studioPlaceRefusal,
  studioSnapshotOf,
  withAddedPage,
  withAddedText,
  withAudience,
  withCurrentPage,
  withPage,
  withSound,
  withSoundUpload,
  withText,
  withVisual,
  withVisualUpload,
  withoutPage,
  withoutPages,
  type StudioDraft,
} from './studio';
import { IDENTITY_POSE } from './studio-pose';

/**
 * **CE FICHIER PORTE LA DÉLÉGATION VERS LA PAGE COURANTE ET LA GESTION DES
 * PAGES** (#7684). Les cas qui vérifiaient les objets texte, les trois portes
 * et le son SUR le brouillon directement ont DÉMÉNAGÉ dans
 * `studio-page.test.ts` (même comportement, sur `StudioPage`) — ils ne sont
 * PAS dupliqués ici.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- @meeshy/shared importé UNIQUEMENT pour épingler l'égalité des deux plafonds (voir plus bas), jamais en production.
import { MAX_POST_MEDIA } from '@meeshy/shared/types/attachment';

const file = (name: string, type: string): File => new File([new Uint8Array([1, 2, 3])], name, { type });

const empty = (): StudioDraft => emptyStudioDraft('fr');
const seedId = (draft: StudioDraft): string => currentStudioPage(draft).texts[0]!.id;
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
  test('un brouillon neuf porte UNE page, courante, avec DÉJÀ un objet texte sélectionné', () => {
    const draft = empty();
    expect(isStudioDraftEmpty(draft)).toBe(true);
    expect(draft.pages).toHaveLength(1);
    expect(draft.currentPage).toBe(draft.pages[0]!.id);
    expect(currentStudioPage(draft).selected).toBe(seedId(draft));
    expect(selectedTextLayer(draft)?.text).toBe('');
  });
  test('l’objet texte naît dans la langue de composition, pas dans celle du navigateur', () => {
    expect(currentStudioPage(emptyStudioDraft('ar')).texts[0]!.language).toBe('ar');
  });
  test('un texte seul le rend NON vide', () => expect(isStudioDraftEmpty(typed('x'))).toBe(false));
  test('un texte fait d’espaces reste VIDE (miroir du serveur, .trim())', () => expect(isStudioDraftEmpty(typed('   '))).toBe(true));
});

describe('les fonctions déléguées atteignent la page COURANTE, jamais une autre (#7684)', () => {
  test('withText/withVisual/withSound écrivent sur `currentStudioPage`', () => {
    const withMedia = withSound(withVisual(typed('Bonjour'), 'visual', visualAsset()), soundAsset());
    const page = currentStudioPage(withMedia);
    expect(page.texts[0]!.text).toBe('Bonjour');
    expect(page.background?.previewUrl).toBe('blob:bg');
    expect(page.sound?.previewUrl).toBe('blob:snd');
  });

  test('withAddedText calcule l’identifiant CONTRE TOUTES LES PAGES — deux pages ne partagent jamais un `id` de texte', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    // La nouvelle page porte déjà `text-2` (graine) — ajouter un texte sur
    // elle doit sauter par-dessus, jamais re-servir `text-2`.
    const withMore = withAddedText(twoPages, 'fr');
    const allIds = withMore.pages.flatMap((page) => page.texts.map((layer) => layer.id));
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(allIds).toContain('text-3');
  });

  test('withAddedText retombe sur `currentStudioPage` même après un changement de page', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    const backToFirst = withCurrentPage(twoPages, twoPages.pages[0]!.id);
    const added = withAddedText(backToFirst, 'fr');
    expect(currentStudioPage(added).texts).toHaveLength(2);
    expect(added.pages[1]!.texts).toHaveLength(1);
  });
});

describe('withPage — LE SITE UNIQUE de mutation d’une page', () => {
  test('un `id` inconnu rend le brouillon INCHANGÉ (même identité)', () => {
    const draft = empty();
    expect(withPage(draft, 'page-9', (page) => ({ ...page, selected: null }))).toBe(draft);
  });

  test('seule la page ciblée change ; les AUTRES gardent leur IDENTITÉ (Zero Unnecessary Re-render)', () => {
    const draft = withAddedPage(typed('Une'), 'fr');
    const firstPageBefore = draft.pages[0]!;
    const changed = withPage(draft, draft.pages[1]!.id, (page) => ({ ...page, selected: null }));
    expect(changed.pages[0]).toBe(firstPageBefore);
    expect(changed.pages[1]).not.toBe(draft.pages[1]);
  });
});

describe('withAddedPage — ajoute une page VIDE et la rend COURANTE (#7684)', () => {
  test('la première page ajoutée devient `page-2`, courante, et vide', () => {
    const draft = withAddedPage(typed('Une'), 'fr');
    expect(draft.pages).toHaveLength(2);
    expect(draft.pages[1]!.id).toBe('page-2');
    expect(draft.currentPage).toBe('page-2');
    expect(isStudioDraftEmpty(withoutPage(draft, 'page-1'))).toBe(true);
  });

  test('l’identifiant de PAGE se calcule contre l’EXISTANT — retirer puis rajouter ne fait pas renaître `page-2`', () => {
    const draft = withoutPage(withAddedPage(withAddedPage(typed('Une'), 'fr'), 'fr'), 'page-2');
    expect(draft.pages.map((p) => p.id)).toEqual(['page-1', 'page-3']);
    expect(withAddedPage(draft, 'fr').pages.map((p) => p.id)).toEqual(['page-1', 'page-3', 'page-4']);
  });

  test('son texte de graine reçoit un `id` UNIQUE contre TOUTES les pages (translationSetPath, storyEffectsV3.ts:635-643)', () => {
    const withThird = withAddedPage(withAddedPage(typed('Une'), 'fr'), 'fr');
    const allIds = withThird.pages.flatMap((page) => page.texts.map((layer) => layer.id));
    expect(allIds).toEqual(['text-1', 'text-2', 'text-3']);
  });

  test('au PLAFOND, le brouillon reste INCHANGÉ (même identité) — jamais une onzième page silencieuse', () => {
    // Le plafond de PAGES épingle CELUI de MAX_POST_MEDIA (@meeshy/shared) —
    // les deux valent 10 pour des raisons distinctes (§ CLAUDE.md studio.ts),
    // et ce témoin prouve qu'elles ne divergent pas en silence.
    expect(STUDIO_PAGE_MAX).toBe(MAX_POST_MEDIA);
    expect(STUDIO_PAGE_MAX).toBe(10);

    let draft = typed('Une');
    for (let i = 1; i < STUDIO_PAGE_MAX; i += 1) draft = withAddedPage(draft, 'fr');
    expect(draft.pages).toHaveLength(STUDIO_PAGE_MAX);
    const atCeiling = withAddedPage(draft, 'fr');
    expect(atCeiling).toBe(draft);
  });
});

describe('withoutPage — inerte sous DEUX pages, reporte la page courante (#7684)', () => {
  test('sous deux pages, retirer la seule page ne fait rien', () => {
    const draft = empty();
    expect(withoutPage(draft, draft.pages[0]!.id)).toBe(draft);
  });

  test('un `id` inconnu ne change rien', () => {
    const draft = withAddedPage(typed('Une'), 'fr');
    expect(withoutPage(draft, 'page-9')).toBe(draft);
  });

  test('retirer la page COURANTE fait courante la PRÉCÉDENTE', () => {
    const threePages = withAddedPage(withAddedPage(typed('Une'), 'fr'), 'fr');
    expect(threePages.currentPage).toBe('page-3');
    const removed = withoutPage(threePages, 'page-3');
    expect(removed.pages.map((p) => p.id)).toEqual(['page-1', 'page-2']);
    expect(removed.currentPage).toBe('page-2');
  });

  test('retirer la PREMIÈRE page pendant qu’elle est courante fait courante la PREMIÈRE restante', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    const backToFirst = withCurrentPage(twoPages, 'page-1');
    const removed = withoutPage(backToFirst, 'page-1');
    expect(removed.pages.map((p) => p.id)).toEqual(['page-2']);
    expect(removed.currentPage).toBe('page-2');
  });

  test('retirer une AUTRE page que la courante ne change JAMAIS la courante', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    const backToFirst = withCurrentPage(twoPages, 'page-1');
    const threePages = withAddedPage(backToFirst, 'fr');
    const onFirst = withCurrentPage(threePages, 'page-1');
    const removed = withoutPage(onFirst, 'page-2');
    expect(removed.currentPage).toBe('page-1');
  });
});

describe('withoutPages — retirer les pages PUBLIÉES d’un coup (#7707)', () => {
  test('retire plusieurs pages en un geste ; les pages restantes gardent leur IDENTITÉ', () => {
    const threePages = withAddedPage(withAddedPage(typed('Une'), 'fr'), 'fr');
    const secondPageObject = threePages.pages.find((p) => p.id === 'page-2')!;
    const removed = withoutPages(threePages, ['page-1', 'page-3']);
    expect(removed.pages.map((p) => p.id)).toEqual(['page-2']);
    expect(removed.pages[0]).toBe(secondPageObject);
  });

  test('la page COURANTE retirée ⇒ la PREMIÈRE restante devient courante', () => {
    const threePages = withAddedPage(withAddedPage(typed('Une'), 'fr'), 'fr');
    expect(threePages.currentPage).toBe('page-3');
    const removed = withoutPages(threePages, ['page-1', 'page-3']);
    expect(removed.currentPage).toBe('page-2');
  });

  test('des `id` inconnus sont ignorés', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    const removed = withoutPages(twoPages, ['page-9']);
    expect(removed).toBe(twoPages);
  });

  test('retirer TOUTES les pages laisse le brouillon INCHANGÉ — le succès complet passe par `clear`', () => {
    const twoPages = withAddedPage(typed('Une'), 'fr');
    expect(withoutPages(twoPages, twoPages.pages.map((p) => p.id))).toBe(twoPages);
  });
});

describe('withCurrentPage — un `id` inconnu laisse le brouillon inchangé', () => {
  test('bascule vers une page connue', () => {
    const draft = withAddedPage(typed('Une'), 'fr');
    expect(withCurrentPage(draft, 'page-1').currentPage).toBe('page-1');
  });
  test('un `id` inconnu ⇒ inchangé', () => {
    const draft = withAddedPage(typed('Une'), 'fr');
    expect(withCurrentPage(draft, 'page-9')).toBe(draft);
  });
});

describe('isStudioDraftEmpty / canPublishStudioDraft — sur TOUTES les pages, pas seulement la courante', () => {
  test('vide ⇒ inerte', () => expect(canPublishStudioDraft(empty())).toBe(false));
  test('texte seul ⇒ publiable', () => expect(canPublishStudioDraft(typed('Bonjour'))).toBe(true));

  test('une SECONDE page vide ne rend pas le brouillon vide si la première porte du texte', () => {
    expect(isStudioDraftEmpty(withAddedPage(typed('Bonjour'), 'fr'))).toBe(false);
  });

  test('un fond en ÉCHEC sur une page NON COURANTE inhibe quand même la publication (la garde couvre TOUTES les pages)', () => {
    const twoPages = withAddedPage(typed('Bonjour'), 'fr');
    const onFirst = withCurrentPage(twoPages, 'page-1');
    const withFailure = withVisualUpload(withVisual(onFirst, 'visual', visualAsset()), 'visual', {
      phase: 'failed',
      reasonKey: 'story.studio.failure.network',
    });
    const backToSecond = withCurrentPage(withFailure, 'page-2');
    expect(canPublishStudioDraft(backToSecond)).toBe(false);
  });

  test('un son PRÊT sur la page courante ⇒ publiable', () => {
    const draft = withSoundUpload(withSound(typed('x'), soundAsset()), { phase: 'ready', postMediaId: 'pm-2', fileUrl: 'k' });
    expect(canPublishStudioDraft(draft)).toBe(true);
  });
});

describe('studioMediaCount / studioPlaceRefusal — le plafond du DOCUMENT ENTIER (#7684)', () => {
  test('un MIME hors de la porte est TOUJOURS refusé, quel que soit le compte', () => {
    expect(studioPlaceRefusal(empty(), 'sound', 'image/png')).toBe('door');
  });

  test('neuf médias posés ⇒ le dixième passe encore (`null`)', () => {
    let draft = typed('Une');
    for (let i = 0; i < 4; i += 1) {
      draft = withVisual(draft, 'visual', visualAsset());
      draft = withVisual(draft, 'overlay', visualAsset());
      if (i < 1) draft = withSound(draft, soundAsset());
      draft = withAddedPage(draft, 'fr');
    }
    expect(studioMediaCount(draft)).toBe(9);
    expect(studioPlaceRefusal(draft, 'visual', 'image/jpeg')).toBeNull();
  });

  test('dix médias déjà posés (prêts OU en vol) ⇒ `media-max`', () => {
    let draft = typed('Une');
    for (let i = 0; i < 4; i += 1) {
      draft = withVisual(draft, 'visual', visualAsset());
      draft = withVisual(draft, 'overlay', visualAsset());
      if (i < 2) draft = withSound(draft, soundAsset());
      draft = withAddedPage(draft, 'fr');
    }
    expect(studioMediaCount(draft)).toBe(10);
    expect(studioPlaceRefusal(draft, 'visual', 'image/jpeg')).toBe('media-max');
  });

  test('au plafond, REMPLACER un média de la page courante passe — le compte ne monte pas ; en AJOUTER un, non', () => {
    const filled = (draft: StudioDraft): StudioDraft => withVisual(withVisual(draft, 'visual', visualAsset()), 'overlay', visualAsset());
    const tenOnFivePages = [1, 2, 3, 4].reduce((draft) => filled(withAddedPage(draft, 'fr')), filled(typed('Une')));
    expect(studioMediaCount(tenOnFivePages)).toBe(10);
    const onLastFilledPage = withCurrentPage(tenOnFivePages, tenOnFivePages.pages[2]!.id);
    expect(studioPlaceRefusal(onLastFilledPage, 'visual', 'image/jpeg')).toBeNull();
    expect(studioPlaceRefusal(onLastFilledPage, 'overlay', 'image/png')).toBeNull();
    expect(studioPlaceRefusal(onLastFilledPage, 'sound', 'audio/mp4')).toBe('media-max');
  });
});

describe('studioSnapshotOf / studioDraftFromSnapshot — les PAGES font l’aller-retour (#7684)', () => {
  test('deux pages, chacune avec ses propres objets, et la page COURANTE', () => {
    const onFirst = withCurrentPage(withAddedPage(typed('Une'), 'fr'), 'page-1');
    const withMedia = withSound(withVisual(onFirst, 'visual', visualAsset()), soundAsset());
    const backToSecond = withCurrentPage(
      withVisualUpload(withSoundUpload(withMedia, { phase: 'ready', postMediaId: 'pm-snd', fileUrl: 's.m4a' }), 'visual', {
        phase: 'ready',
        postMediaId: 'pm-bg',
        fileUrl: 'bg.jpg',
      }),
      'page-2',
    );
    const snapshot = studioSnapshotOf(backToSecond, 'fr');
    expect(snapshot.schema).toBe(2);
    expect(snapshot.pages).toHaveLength(2);
    expect(snapshot.currentPage).toBe('page-2');
    expect(snapshot.pages[0]!.background?.postMediaId).toBe('pm-bg');
    expect(snapshot.pages[0]!.sound?.postMediaId).toBe('pm-snd');
    expect(snapshot.pages[1]!.background).toBeUndefined();

    const restored = studioDraftFromSnapshot(snapshot, (u) => u, 'fr');
    expect(restored.pages).toHaveLength(2);
    expect(restored.currentPage).toBe('page-2');
    expect(restored.pages[0]!.background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm-bg', fileUrl: 'bg.jpg' });
    expect(canPublishStudioDraft(restored)).toBe(true);
  });

  test('un `currentPage` ORPHELIN (page retirée, donnée corrompue) retombe sur la PREMIÈRE page', () => {
    const restored = studioDraftFromSnapshot(
      { schema: 2, pages: [{ id: 'page-1', texts: [{ id: 'text-1', text: 'a' }] }], currentPage: 'page-9' },
      (u) => u,
      'fr',
    );
    expect(restored.currentPage).toBe('page-1');
  });

  test('aucun brouillon ⇒ un plateau vide, dans la langue demandée', () => {
    const restored = studioDraftFromSnapshot(null, (u) => u, 'pt');
    expect(isStudioDraftEmpty(restored)).toBe(true);
    expect(restored.pages).toHaveLength(1);
    expect(currentStudioPage(restored).texts[0]!.language).toBe('pt');
  });

  test('un média EN VOL n’est pas persisté — seuls les médias PRÊTS survivent', () => {
    const draft = withVisual(typed('Une'), 'visual', visualAsset());
    expect(studioSnapshotOf(draft, 'fr').pages[0]!.background).toBeUndefined();
  });
});

describe('l’audience du brouillon (#7683) — voyage, jamais un défaut recopié', () => {
  test('rien n’est choisi à la naissance', () => {
    expect(emptyStudioDraft('fr').visibility).toBeNull();
  });

  test('withAudience pose la valeur SANS toucher au reste du brouillon (fonction pure)', () => {
    const draft = typed('Bonjour');
    const next = withAudience(draft, 'COMMUNITY');
    expect(next.visibility).toBe('COMMUNITY');
    expect(next.pages).toBe(draft.pages);
  });

  test('choisie ⇒ la clé `visibility` PART du snapshot ; sans choix ⇒ elle est ABSENTE', () => {
    const chosen = studioSnapshotOf(withAudience(typed('Bonjour'), 'FRIENDS'), 'fr');
    expect(chosen.visibility).toBe('FRIENDS');
    const none = studioSnapshotOf(typed('Bonjour'), 'fr');
    expect('visibility' in none).toBe(false);
  });

  test('relue depuis un snapshot, sinon null', () => {
    expect(
      studioDraftFromSnapshot({ schema: 2, pages: [{ id: 'page-1', texts: [{ id: 'text-1', text: '' }] }], visibility: 'PRIVATE' }, (u) => u, 'fr').visibility,
    ).toBe('PRIVATE');
    expect(studioDraftFromSnapshot({ schema: 2, pages: [{ id: 'page-1', texts: [{ id: 'text-1', text: '' }] }] }, (u) => u, 'fr').visibility).toBeNull();
  });

  test('un snapshot NOMINATIF (ONLY/EXCEPT, sans leur liste) se relit SANS audience — jamais un état que la passerelle refuserait', () => {
    for (const visibility of ['ONLY', 'EXCEPT'] as const) {
      expect(
        studioDraftFromSnapshot({ schema: 2, pages: [{ id: 'page-1', texts: [{ id: 'text-1', text: 'x' }] }], visibility }, (u) => u, 'fr').visibility,
      ).toBeNull();
    }
  });

  test('une audience seule ne tient pas un brouillon en vie (la mémoire s’en charge)', () => {
    expect(isStudioDraftEmpty(withAudience(emptyStudioDraft('fr'), 'FRIENDS'))).toBe(true);
  });
});
