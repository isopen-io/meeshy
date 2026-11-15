import { describe, expect, test } from 'bun:test';

import { studioOffersReel } from './reel-offer';
import { emptyStudioDraft, withAddedPage, withPostText, withSound, withVisual, type StudioDraft } from './studio';
import { studioPublicationContent } from './studio-publish-flow';
import { IDENTITY_POSE } from './studio-pose';

/**
 * **UN POST À UNE SEULE VIDÉO PROPOSE LE RÉEL** (#8603) — le studio lit la
 * règle PARTAGÉE (`offersReelForPost`, `@meeshy/shared/utils/reel-composition`)
 * sur les médias de TOUTES les pages (`studioReelMedia`) : un seul cas ouvre
 * le modal, tous les autres publient sans question.
 */

const ready = { phase: 'ready', postMediaId: 'pm-1', fileUrl: 'f.mp4' } as const;

const visual = (mediaType: 'image' | 'video', durationMs?: number) => ({
  previewUrl: `blob:${mediaType}`,
  mediaType,
  upload: ready,
  caption: '',
  pose: IDENTITY_POSE,
  ...(durationMs !== undefined ? { durationMs } : {}),
});

const withVideo = (draft: StudioDraft, durationMs = 12_000): StudioDraft => withVisual(draft, 'visual', visual('video', durationMs));
const videoPost = (): StudioDraft => withPostText(withVideo(emptyStudioDraft('fr')), 'Mon texte');

describe('studioOffersReel — le seul cas qui ouvre le modal', () => {
  test('un POST, une vidéo, du texte d’accompagnement : le réel est proposé', () => {
    expect(studioOffersReel({ draft: videoPost(), kind: 'POST', formatChosenByAuthor: false })).toBe(true);
  });
});

describe('studioOffersReel — aucun modal hors de ce cas', () => {
  test('une photo seule', () => {
    expect(studioOffersReel({ draft: withVisual(emptyStudioDraft('fr'), 'visual', visual('image')), kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });

  test('plusieurs médias : vidéo + calque image', () => {
    const draft = withVisual(videoPost(), 'overlay', visual('image'));
    expect(studioOffersReel({ draft, kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });

  test('plusieurs médias : une vidéo par page', () => {
    const draft = withVideo(withAddedPage(videoPost(), 'fr'));
    expect(studioOffersReel({ draft, kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });

  test('un son seul', () => {
    const draft = withSound(emptyStudioDraft('fr'), { previewUrl: 'blob:son', upload: ready, plane: 'background', durationMs: 8_000 });
    expect(studioOffersReel({ draft, kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });

  test('un texte seul', () => {
    expect(studioOffersReel({ draft: withPostText(emptyStudioDraft('fr'), 'Bonjour'), kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });

  test('une story', () => {
    expect(studioOffersReel({ draft: videoPost(), kind: 'STORY', formatChosenByAuthor: false })).toBe(false);
  });

  test('déjà en mode réel', () => {
    expect(studioOffersReel({ draft: videoPost(), kind: 'REEL', formatChosenByAuthor: false })).toBe(false);
  });

  test('l’auteur a choisi « Post » au chevron', () => {
    expect(studioOffersReel({ draft: videoPost(), kind: 'POST', formatChosenByAuthor: true })).toBe(false);
  });

  test('une vidéo trop courte pour qualifier', () => {
    expect(studioOffersReel({ draft: withVideo(emptyStudioDraft('fr'), 2_000), kind: 'POST', formatChosenByAuthor: false })).toBe(false);
  });
});

describe('studioPublicationContent — le texte du post suit le post PROMU en réel', () => {
  test('« C’est un Réel » garde le texte d’accompagnement', () => {
    expect(studioPublicationContent({ kind: 'REEL', postText: ' Mon texte ', promotedFromPost: true })).toBe('Mon texte');
  });

  test('un réel composé comme tel ne porte toujours pas de corps', () => {
    expect(studioPublicationContent({ kind: 'REEL', postText: 'Mon texte', promotedFromPost: false })).toBeUndefined();
  });

  test('une story promue ne se conçoit pas : pas de corps', () => {
    expect(studioPublicationContent({ kind: 'STORY', postText: 'Mon texte', promotedFromPost: true })).toBeUndefined();
  });
});
