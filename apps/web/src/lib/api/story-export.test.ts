import { describe, expect, test } from 'bun:test';

import { storyDownloadableMedia, storyExportUrl } from './story-export';

/**
 * `storyDownloadableMedia` / `storyExportUrl` (#7116, revue) — la décision
 * d'OFFRIR « Enregistrer » et l'adresse que le geste télécharge.
 *
 * Le premier jet offrait le bouton sur TOUTE story de l'auteur et sortait
 * sans rien faire quand elle n'avait pas de média : un contrôle inerte, le
 * défaut que la loi 4 interdit. Et il visait la passerelle même sous
 * fixtures, où aucun serveur ne répond.
 */
describe('storyDownloadableMedia — un média que la passerelle SAIT exporter, sinon rien', () => {
  test('une story TEXTE (aucun média) ⇒ null : « Enregistrer » n’a rien à télécharger', () => {
    expect(storyDownloadableMedia({ media: [] })).toBeNull();
    expect(storyDownloadableMedia({})).toBeNull();
    expect(storyDownloadableMedia(undefined)).toBeNull();
  });

  test('le PREMIER média servi et exportable est élu', () => {
    const media = storyDownloadableMedia({
      media: [
        { id: 'sans-source', mimeType: 'image/jpeg' },
        { id: 'hors-carte', fileUrl: '/u/a.gif', mimeType: 'image/gif' },
        { id: 'elu', fileUrl: '/u/b.jpg', mimeType: 'image/jpeg' },
        { id: 'second', fileUrl: '/u/c.mp4', mimeType: 'video/mp4' },
      ],
    });
    expect(media?.id).toBe('elu');
  });

  test('un type HORS de la carte serveur (gif, heic…) ⇒ null — la passerelle rendrait 404', () => {
    expect(storyDownloadableMedia({ media: [{ id: 'g', fileUrl: '/u/a.gif', mimeType: 'image/gif' }] })).toBeNull();
    expect(storyDownloadableMedia({ media: [{ id: 'n', fileUrl: '/u/a', mimeType: null }] })).toBeNull();
  });
});

describe('storyExportUrl — la route d’export de la passerelle, ou le média lui-même sous fixtures', () => {
  test('passerelle ⇒ `GET /api/v1/posts/:postId/media/:mediaId/export` sur la base (`media-export.ts:112`)', () => {
    expect(
      storyExportUrl({
        source: 'gateway',
        base: 'https://gate.example',
        postId: 'p 1',
        media: { id: 'm/1', fileUrl: '/u/a.jpg', mimeType: 'image/jpeg' },
      }),
    ).toBe('https://gate.example/api/v1/posts/p%201/media/m%2F1/export');
  });

  test('fixtures ⇒ l’adresse du média servi, jamais un serveur qui n’existe pas', () => {
    const standIn = 'data:image/svg+xml;utf8,%3Csvg%2F%3E';
    expect(
      storyExportUrl({ source: 'fixtures', base: '', postId: 'st-mienne', media: { id: 'm4', url: standIn, mimeType: 'image/svg+xml' } }),
    ).toBe(standIn);
  });
});
