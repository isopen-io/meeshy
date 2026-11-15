import { describe, expect, test } from 'bun:test';

import { appendToComposerText, composerInsertStore } from './composer-insert';

describe('composer-insert — une demande d’écriture dans le composeur du fil (#16338)', () => {
  test('la demande atteint le composeur abonné, et seulement tant qu’il l’est', () => {
    const received: string[] = [];
    expect(composerInsertStore.available()).toBe(false);
    const stop = composerInsertStore.subscribe((chunk) => received.push(chunk));
    expect(composerInsertStore.available()).toBe(true);
    composerInsertStore.request('@a ');
    stop();
    composerInsertStore.request('@b ');
    expect(received).toEqual(['@a ']);
    expect(composerInsertStore.available()).toBe(false);
  });

  test('le texte reçu s’ajoute à la suite de ce qui est déjà écrit, séparé d’une espace', () => {
    expect(appendToComposerText('', '@a ')).toBe('@a ');
    expect(appendToComposerText('Bonjour', '@a ')).toBe('Bonjour @a ');
    expect(appendToComposerText('Bonjour ', '@a ')).toBe('Bonjour @a ');
  });
});
