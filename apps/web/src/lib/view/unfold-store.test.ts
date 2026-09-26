import { afterEach, describe, expect, test } from 'bun:test';

import { collapseUnfolded, readUnfolded, subscribeUnfolded, toggleUnfolded } from './unfold-store';

afterEach(() => collapseUnfolded());

describe('le message déplié du fil (#8147) — un seul à la fois', () => {
  test('rien n’est déplié au départ', () => {
    expect(readUnfolded()).toBeNull();
  });

  test('toucher « Lire la suite » déplie ce message, toucher « Réduire » le replie', () => {
    toggleUnfolded('m-1');
    expect(readUnfolded()).toBe('m-1');
    toggleUnfolded('m-1');
    expect(readUnfolded()).toBeNull();
  });

  test('déplier un second message replie le premier', () => {
    toggleUnfolded('m-1');
    toggleUnfolded('m-2');
    expect(readUnfolded()).toBe('m-2');
  });

  test('chaque changement prévient les abonnés, et eux seuls tant qu’ils le restent', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeUnfolded(() => seen.push(readUnfolded()));
    toggleUnfolded('m-1');
    collapseUnfolded();
    unsubscribe();
    toggleUnfolded('m-2');
    expect(seen).toEqual(['m-1', null]);
  });

  test('replier quand rien n’est déplié ne prévient personne', () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribeUnfolded(() => seen.push(readUnfolded()));
    collapseUnfolded();
    unsubscribe();
    expect(seen).toEqual([]);
  });
});
