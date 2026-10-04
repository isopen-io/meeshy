import { describe, expect, test } from 'bun:test';

import { studioSeedOfShare } from './compose-from-share';

const photo = new File(['a'], 'a.jpg', { type: 'image/jpeg' });

describe('studioSeedOfShare (#9286) — ce que « Modifier avant de publier » sème', () => {
  test('des fichiers partagés : les fichiers, et la légende tapée dans la feuille', () => {
    expect(studioSeedOfShare({ kind: 'files', files: [photo] }, '  Vu ce matin ')).toEqual({ files: [photo], text: 'Vu ce matin' });
  });

  test('un texte et son adresse : le corps, l’adresse sur sa ligne, la légende devant', () => {
    expect(studioSeedOfShare({ kind: 'text', text: 'À lire', url: 'https://ex.am/ple' }, 'Pour toi')).toEqual({
      files: [],
      text: 'Pour toi\nÀ lire\nhttps://ex.am/ple',
    });
  });

  test('ce qui vient de Meeshy (publication, pièce, messages) ne se recompose pas ici', () => {
    expect(studioSeedOfShare({ kind: 'media', url: 'https://cdn/x.jpg', mime: 'image/jpeg', name: 'x.jpg', preview: { kind: 'image', thumbUrl: 'https://cdn/x.jpg' } }, '')).toBeNull();
  });
});
