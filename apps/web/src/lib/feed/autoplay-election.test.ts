import { describe, expect, test } from 'bun:test';

import { electActive } from './autoplay-election';

describe('electActive — une seule surface, la plus proche du centre', () => {
  test('la plus proche du centre gagne', () => {
    expect(
      electActive({
        candidates: [
          { id: 'a', distance: 40 },
          { id: 'b', distance: 5 },
          { id: 'c', distance: 20 },
        ],
        reducedMotion: false,
        hidden: false,
      }),
    ).toBe('b');
  });

  test('aucun candidat visible ⇒ null', () => {
    expect(electActive({ candidates: [], reducedMotion: false, hidden: false })).toBeNull();
  });

  test('prefers-reduced-motion ⇒ null, même avec des candidats', () => {
    expect(electActive({ candidates: [{ id: 'a', distance: 0 }], reducedMotion: true, hidden: false })).toBeNull();
  });

  test('page cachée (visibilitychange) ⇒ null', () => {
    expect(electActive({ candidates: [{ id: 'a', distance: 0 }], reducedMotion: false, hidden: true })).toBeNull();
  });

  test('égalité de distance ⇒ le premier (stable)', () => {
    expect(
      electActive({
        candidates: [
          { id: 'first', distance: 10 },
          { id: 'second', distance: 10 },
        ],
        reducedMotion: false,
        hidden: false,
      }),
    ).toBe('first');
  });
});
