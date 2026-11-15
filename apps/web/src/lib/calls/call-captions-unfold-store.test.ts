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
    store.toggle('call-1', 'band', 'a');
    expect(store.revealed('call-1', 'band').has('a')).toBe(true);
    expect(store.revealed('call-2', 'band').size).toBe(0);
    store.toggle('call-2', 'band', 'b');
    expect(store.revealed('call-1', 'band').size).toBe(0);
    expect(store.revealed('call-2', 'band').has('b')).toBe(true);
  });

  test('une phrase touchée dans la bande reste repliée dans le journal, et l’inverse (iOS CallCaptionsReveals, #17678)', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'band', 'a');
    store.toggle('call-1', 'journal', 'b');
    expect([...store.revealed('call-1', 'band')]).toEqual(['a']);
    expect([...store.revealed('call-1', 'journal')]).toEqual(['b']);
  });

  test('la lecture rend le même ensemble tant que rien ne change (useSyncExternalStore)', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'band', 'a');
    expect(store.revealed('call-1', 'band')).toBe(store.revealed('call-1', 'band'));
  });

  test('la fin de l’appel libère tout : rien ne reste en mémoire une fois l’appel parti', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'band', 'a');
    store.toggle('call-1', 'journal', 'b');
    store.follow({ callId: 'call-1', captionsMode: 'translated' });
    expect(store.revealed('call-1', 'band').size).toBe(1);
    store.follow(null);
    expect(store.store.getState().ids).toEqual({ band: [], journal: [] });
    expect(store.revealed('call-1', 'journal').size).toBe(0);
  });

  test('un autre appel qui commence libère celui d’avant', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'band', 'a');
    store.follow({ callId: 'call-2', captionsMode: 'translated' });
    expect(store.store.getState().ids).toEqual({ band: [], journal: [] });
  });

  test('couper les sous-titres replie la bande (iOS et Android), le journal garde les siennes', () => {
    const store = createCaptionRevealStore();
    store.toggle('call-1', 'band', 'a');
    store.toggle('call-1', 'journal', 'b');
    store.follow({ callId: 'call-1', captionsMode: 'off' });
    expect(store.revealed('call-1', 'band').size).toBe(0);
    expect([...store.revealed('call-1', 'journal')]).toEqual(['b']);
  });

  test('suivre l’appel sans rien de révélé n’écrit rien : aucun rendu pour les abonnés', () => {
    const store = createCaptionRevealStore();
    const before = store.store.getState();
    store.follow({ callId: 'call-1', captionsMode: 'off' });
    store.follow(null);
    expect(store.store.getState()).toBe(before);
  });
});
