import { describe, expect, test } from 'bun:test';

import {
  PUBLICATION_KINDS,
  publicationKindFromSearch,
  publicationSearchValue,
  studioOriginFromSearch,
  studioPublishRefusal,
  studioReelMedia,
  type PublicationKind,
  type PublicationRefusal,
} from './publication-kind';
import {
  currentStudioPage,
  emptyStudioDraft,
  studioPublishablePageCount,
  withAddedPage,
  withSound,
  withText,
  withVisual,
  withoutPage,
  type StudioDraft,
} from './studio';
import { IDENTITY_POSE } from './studio-pose';

const ready = { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'f.jpg' } as const;

function withBackground(draft: StudioDraft, mediaType: 'image' | 'video', durationMs?: number): StudioDraft {
  return withVisual(draft, 'visual', {
    previewUrl: 'blob:fond',
    mediaType,
    upload: ready,
    caption: '',
    pose: IDENTITY_POSE,
    ...(durationMs !== undefined ? { durationMs } : {}),
  });
}

function withOverlayImage(draft: StudioDraft): StudioDraft {
  return withVisual(draft, 'overlay', { previewUrl: 'blob:calque', mediaType: 'image', upload: ready, caption: '', pose: IDENTITY_POSE });
}

const textOnly = (): StudioDraft => withText(emptyStudioDraft('fr'), 'text-1', 'Bonjour');

describe('publicationKindFromSearch — le format suit le point d’entrée', () => {
  test('sans `?type=`, le format par défaut de l’entrée est servi', () => {
    expect(publicationKindFromSearch(new URLSearchParams(''), 'STORY')).toBe('STORY');
    expect(publicationKindFromSearch(new URLSearchParams(''), 'POST')).toBe('POST');
  });

  test('`?type=` choisit parmi les trois formats, quel que soit le défaut', () => {
    expect(publicationKindFromSearch(new URLSearchParams('type=reel'), 'POST')).toBe('REEL');
    expect(publicationKindFromSearch(new URLSearchParams('type=post'), 'STORY')).toBe('POST');
    expect(publicationKindFromSearch(new URLSearchParams('type=story'), 'POST')).toBe('STORY');
  });

  test('une valeur inconnue retombe sur le défaut, jamais sur un format inventé', () => {
    expect(publicationKindFromSearch(new URLSearchParams('type=mood'), 'STORY')).toBe('STORY');
  });

  test('l’aller-retour format → adresse → format est stable pour les trois', () => {
    PUBLICATION_KINDS.forEach((kind: PublicationKind) => {
      expect(publicationKindFromSearch(new URLSearchParams(`type=${publicationSearchValue(kind)}`), 'STORY')).toBe(kind);
    });
  });
});

describe('studioReelMedia / studioPublishRefusal — le réel se REFUSE, il ne se dégrade pas', () => {
  test('story et post ne sont jamais refusés pour leur composition', () => {
    expect(studioPublishRefusal(textOnly(), 'STORY')).toBeNull();
    expect(studioPublishRefusal(textOnly(), 'POST')).toBeNull();
  });

  test('un réel de texte seul est refusé en le nommant', () => {
    expect(studioPublishRefusal(textOnly(), 'REEL')).toBe('reel-without-qualifying-media');
  });

  test('une vidéo de fond ≥ 3 s qualifie le réel ; une vidéo de durée inconnue ou trop courte, non', () => {
    expect(studioPublishRefusal(withBackground(textOnly(), 'video', 4000), 'REEL')).toBeNull();
    expect(studioPublishRefusal(withBackground(textOnly(), 'video', 2000), 'REEL')).toBe('reel-without-qualifying-media');
    expect(studioPublishRefusal(withBackground(textOnly(), 'video'), 'REEL')).toBe('reel-without-qualifying-media');
  });

  test('deux images (fond + calque) qualifient ; une seule, non', () => {
    expect(studioPublishRefusal(withBackground(textOnly(), 'image'), 'REEL')).toBe('reel-without-qualifying-media');
    expect(studioPublishRefusal(withOverlayImage(withBackground(textOnly(), 'image')), 'REEL')).toBeNull();
  });

  test('un son ≥ 3 s qualifie le réel', () => {
    const draft = withSound(textOnly(), { previewUrl: 'blob:son', upload: ready, plane: 'background', durationMs: 5000 });
    expect(studioPublishRefusal(draft, 'REEL')).toBeNull();
    expect(studioReelMedia(draft)).toEqual([{ mimeType: 'audio/*', duration: 5000 }]);
  });

  test('DEUX PAGES d’UNE image chacune qualifient le réel (#7684) — la règle APLATIT tout le document', () => {
    const twoPages = withAddedPage(withBackground(textOnly(), 'image'), 'fr');
    expect(studioReelMedia(twoPages)).toHaveLength(1);
    expect(studioPublishRefusal(twoPages, 'REEL')).toBe('reel-without-qualifying-media');
    const secondImage = withBackground(twoPages, 'image');
    expect(studioReelMedia(secondImage)).toHaveLength(2);
    expect(studioPublishRefusal(secondImage, 'REEL')).toBeNull();
  });
});

describe('studioPublishRefusal — une STORY de plusieurs pages n’est PLUS refusée (#7707)', () => {
  const twoPublishablePages = (): StudioDraft => {
    const second = withAddedPage(textOnly(), 'fr');
    return withText(second, currentStudioPage(second).texts[0]!.id, 'Deuxième');
  };

  test('deux pages AVEC matière : ni la story, ni le post ne sont refusés — le canal `.scene` les publie', () => {
    expect(studioPublishRefusal(twoPublishablePages(), 'STORY')).toBeNull();
    expect(studioPublishRefusal(twoPublishablePages(), 'POST')).toBeNull();
  });

  test('le réel sans média qualifiant reste refusé, inchangé', () => {
    expect(studioPublishRefusal(textOnly(), 'REEL')).toBe('reel-without-qualifying-media');
  });

  test('retirer une page ne change toujours rien pour la story', () => {
    const draft = twoPublishablePages();
    expect(studioPublishRefusal(withoutPage(draft, draft.currentPage), 'STORY')).toBeNull();
  });

  test('`PublicationRefusal` ne porte plus que le réel — vérifié au COMPILATEUR', () => {
    const onlyReel: PublicationRefusal = 'reel-without-qualifying-media';
    expect(onlyReel).toBe('reel-without-qualifying-media');
  });
});

describe('studioPublishablePageCount — les pages qui produiront une SCÈNE', () => {
  test('une page vide ne compte pas ; une page de texte, oui', () => {
    const draft = withAddedPage(textOnly(), 'fr');
    expect(studioPublishablePageCount(draft)).toBe(1);
    expect(studioPublishablePageCount(withText(draft, currentStudioPage(draft).texts[0]!.id, 'Deux'))).toBe(2);
  });
});

describe('studioOriginFromSearch — l’accueil ramène à lui (#7729)', () => {
  test('?from=onboarding, et rien d’autre', () => {
    expect(studioOriginFromSearch(new URLSearchParams('from=onboarding'))).toBe('onboarding');
    expect(studioOriginFromSearch(new URLSearchParams('from=https://evil.example'))).toBeNull();
    expect(studioOriginFromSearch(new URLSearchParams(''))).toBeNull();
  });
});
