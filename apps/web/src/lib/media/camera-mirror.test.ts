import { describe, expect, test } from 'bun:test';

import { cameraMirrored } from './camera-mirror';

describe('cameraMirrored', () => {
  test('la caméra avant se voit en miroir dans son aperçu', () => {
    expect(cameraMirrored({ facing: 'user', role: 'preview' })).toBe(true);
  });

  test('la caméra arrière ne se voit jamais en miroir', () => {
    expect(cameraMirrored({ facing: 'environment', role: 'preview' })).toBe(false);
  });

  test('le flux envoyé ne part jamais en miroir, quelle que soit la caméra', () => {
    expect(cameraMirrored({ facing: 'user', role: 'sent' })).toBe(false);
    expect(cameraMirrored({ facing: 'environment', role: 'sent' })).toBe(false);
  });

  test("une capture montre ce que l'autre voit : jamais en miroir", () => {
    expect(cameraMirrored({ facing: 'user', role: 'capture' })).toBe(false);
    expect(cameraMirrored({ facing: 'environment', role: 'capture' })).toBe(false);
  });

  test("un écran partagé n'est jamais retourné, même dans l'aperçu", () => {
    expect(cameraMirrored({ facing: 'user', role: 'preview', screen: true })).toBe(false);
  });
});
