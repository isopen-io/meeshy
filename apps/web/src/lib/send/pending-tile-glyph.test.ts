import { describe, expect, test } from 'bun:test';

import { pendingTileGlyph } from './pending-tile-glyph';

/**
 * #9119 — miroir de `ComposerPendingTileGlyph` (iOS) : toucher une pièce en
 * attente l'ÉDITE, son centre le dit.
 */
describe('pendingTileGlyph — type → glyphe central', () => {
  test('image, vidéo, audio : « éditer »', () => {
    expect(pendingTileGlyph({ kind: 'image', mimeType: 'image/png' })).toBe('edit');
    expect(pendingTileGlyph({ kind: 'video', mimeType: 'video/mp4' })).toBe('edit');
    expect(pendingTileGlyph({ kind: 'audio', mimeType: 'audio/webm' })).toBe('edit');
  });

  test('un GIF ne s’offre pas à la retouche : aucun glyphe promis', () => {
    expect(pendingTileGlyph({ kind: 'image', mimeType: 'image/gif' })).toBeNull();
  });

  test('un fichier : aucun glyphe', () => {
    expect(pendingTileGlyph({ kind: 'file', mimeType: 'application/pdf' })).toBeNull();
  });
});
