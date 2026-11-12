import { describe, expect, test } from 'bun:test';

import { CAPTION_REVEAL_LIMIT, createCaptionRevealStore, toggledReveals } from './call-captions-unfold-store';

describe('les phrases révélées d’un appel (L3.9) : par identifiant de phrase, hors du composant, bornées', () => {
  test('un toucher révèle, le second replie', () => {
    expect(toggledReveals([], 'a')).toEqual(['a']);
    expect(toggledReveals(['a', 'b'], 'a')).toEqual(['b']);
  });

  test('la borne oublie les plus anciennes, jamais la dernière touchée', () => {
    const full = Array.from({ length: CAPTION_REVEAL_LIMIT }, (_, at) => `s${at}`);
    const next = toggledReveals(full, 'new');
    expect(next).toHaveLength(CAPTION_REVEAL_LIMIT);
    expect(next.at(-1)).toBe('new');
    expect(next).not.toContain('s0');
  });

  test('le magasin survit au composant qui le lit, et ne se mêle pas d’un appel à l’autre', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'a');
    expect(store.revealed('call-1').has('a')).toBe(true);
    expect(store.revealed('call-2').size).toBe(0);
    store.toggle('call-2', 'b');
    expect(store.revealed('call-1').size).toBe(0);
    expect(store.revealed('call-2').has('b')).toBe(true);
  });

  test('la lecture rend le même ensemble tant que rien ne change (useSyncExternalStore)', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'a');
    expect(store.revealed('call-1')).toBe(store.revealed('call-1'));
  });
});
