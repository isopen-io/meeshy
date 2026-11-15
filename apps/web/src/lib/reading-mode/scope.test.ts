import { describe, expect, test } from 'bun:test';

import { readingModeScopeOf } from './scope';

describe('readingModeScopeOf — F7 (#5650)', () => {
  test('sans identité ⇒ local', () => {
    expect(readingModeScopeOf({ id: null })).toBe('local');
  });

  test('avec identité ⇒ u_<id>', () => {
    expect(readingModeScopeOf({ id: 'u1' })).toBe('u_u1');
  });

  test('deux ids ⇒ deux scopes distincts', () => {
    expect(readingModeScopeOf({ id: 'u1' })).not.toBe(readingModeScopeOf({ id: 'u2' }));
  });
});
