import { describe, expect, test } from 'bun:test';

import { offerStudioSeed, offerStudioSeedOf, takeStudioSeed } from './studio-seed';

describe('studio-seed (#6303, #9286)', () => {
  test('la pièce offerte par la visionneuse se prend une fois, et une seule', () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    offerStudioSeed(file);
    expect(takeStudioSeed()).toEqual({ files: [file], text: '' });
    expect(takeStudioSeed()).toBeNull();
  });

  test('un partage entrant sème PLUSIEURS fichiers et leur texte', () => {
    const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const b = new File(['b'], 'b.mp4', { type: 'video/mp4' });
    offerStudioSeedOf({ files: [a, b], text: 'Vu ce matin' });
    expect(takeStudioSeed()).toEqual({ files: [a, b], text: 'Vu ce matin' });
    expect(takeStudioSeed()).toBeNull();
  });
});
