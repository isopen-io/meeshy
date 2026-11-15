/**
 * « Ce post doit-il proposer le réel ? » (#8603, demande porteur 2026-09-28).
 *
 * Publier un POST dont le SEUL média est UNE vidéo ouvre un modal « C'est un
 * Réel / C'est un Post ». La règle est PURE et UNIQUE côté TS
 * (`@meeshy/shared/utils/reel-composition`, consommée par le web) ; son
 * miroir Swift est `ReelComposition.offersReelForPost` (SDK). Chaque cas du
 * critère de fin a son témoin : un seul cas vrai, tous les autres faux.
 */

import { describe, it, expect } from 'vitest';
import { offersReelForPost, type ReelOfferContext } from '../../utils/reel-composition';

const video = (duration: number | null = 12_000) => ({ mimeType: 'video/mp4', duration });
const image = () => ({ mimeType: 'image/jpeg', duration: null });
const audio = () => ({ mimeType: 'audio/m4a', duration: 8_000 });

const context = (over: Partial<ReelOfferContext> = {}): ReelOfferContext => ({
  type: 'POST',
  media: [video()],
  isRepost: false,
  isEdit: false,
  formatChosenByAuthor: false,
  ...over,
});

describe('offersReelForPost — le seul cas qui propose le réel', () => {
  it('un POST dont le seul média est une vidéo propose le réel', () => {
    expect(offersReelForPost(context())).toBe(true);
  });

  it('le MIME se lit sans casse, comme la règle serveur', () => {
    expect(offersReelForPost(context({ media: [{ mimeType: 'VIDEO/QUICKTIME', duration: 4_000 }] }))).toBe(true);
  });
});

describe('offersReelForPost — aucun modal hors de ce cas', () => {
  it('plusieurs médias : vidéo + photo', () => {
    expect(offersReelForPost(context({ media: [video(), image()] }))).toBe(false);
  });

  it('plusieurs médias : deux vidéos', () => {
    expect(offersReelForPost(context({ media: [video(), video()] }))).toBe(false);
  });

  it('une photo seule', () => {
    expect(offersReelForPost(context({ media: [image()] }))).toBe(false);
  });

  it('un audio seul', () => {
    expect(offersReelForPost(context({ media: [audio()] }))).toBe(false);
  });

  it('un texte seul (aucun média)', () => {
    expect(offersReelForPost(context({ media: [] }))).toBe(false);
  });

  it('une story', () => {
    expect(offersReelForPost(context({ type: 'STORY' }))).toBe(false);
  });

  it('déjà en mode réel', () => {
    expect(offersReelForPost(context({ type: 'REEL' }))).toBe(false);
  });

  it('un repost', () => {
    expect(offersReelForPost(context({ isRepost: true }))).toBe(false);
  });

  it("l'édition d'un post existant", () => {
    expect(offersReelForPost(context({ isEdit: true }))).toBe(false);
  });

  it("l'auteur a CHOISI « Post » au chevron : il l'a déjà dit", () => {
    expect(offersReelForPost(context({ formatChosenByAuthor: true }))).toBe(false);
  });

  it('une vidéo trop courte : le serveur rétrograderait le réel en post, le proposer mentirait', () => {
    expect(offersReelForPost(context({ media: [video(2_000)] }))).toBe(false);
  });

  it('une vidéo de durée inconnue : même raison', () => {
    expect(offersReelForPost(context({ media: [video(null)] }))).toBe(false);
  });
});
