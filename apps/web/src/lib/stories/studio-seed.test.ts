import { describe, expect, test } from 'bun:test';

import { offerStudioSeed, takeStudioSeed } from './studio-seed';

describe('studio-seed (#6303)', () => {
  test('la pièce offerte par la visionneuse se prend une fois, et une seule', () => {
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    offerStudioSeed(file);
    expect(takeStudioSeed()).toBe(file);
    expect(takeStudioSeed()).toBeNull();
  });
});
