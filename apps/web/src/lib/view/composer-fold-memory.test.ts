import { describe, expect, test } from 'bun:test';

import type { SafeStorage } from '@/lib/storage';

import { composerFoldMemory } from './composer-fold-memory';

/**
 * #16341 — CHAQUE CONVERSATION SE SOUVIENT SI SA BARRE EST REPLIÉE, y compris
 * après un rechargement : la mémoire vit dans le stockage de l'appareil, une
 * entrée par conversation, et une conversation jamais touchée reste dépliée.
 */
const storage = (): SafeStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

describe('composerFoldMemory (#16341)', () => {
  test('une conversation jamais touchée garde sa barre dépliée', () => {
    expect(composerFoldMemory(storage()).isFolded('c-1')).toBe(false);
  });

  test('le repli survit au rechargement, conversation par conversation', () => {
    const disk = storage();
    composerFoldMemory(disk).remember('c-1', true);
    const afterReload = composerFoldMemory(disk);
    expect(afterReload.isFolded('c-1')).toBe(true);
    expect(afterReload.isFolded('c-2')).toBe(false);
  });

  test('déplier oublie le repli de CETTE conversation seulement', () => {
    const disk = storage();
    composerFoldMemory(disk).remember('c-1', true);
    composerFoldMemory(disk).remember('c-2', true);
    composerFoldMemory(disk).remember('c-1', false);
    expect(composerFoldMemory(disk).isFolded('c-1')).toBe(false);
    expect(composerFoldMemory(disk).isFolded('c-2')).toBe(true);
  });

  test('un stockage illisible rend le défaut, sans lever', () => {
    const disk = storage();
    disk.setItem('meeshy.conversation.composerFolded', '{pas du json');
    expect(composerFoldMemory(disk).isFolded('c-1')).toBe(false);
    disk.setItem('meeshy.conversation.composerFolded', JSON.stringify([1, null, 'c-9']));
    expect(composerFoldMemory(disk).isFolded('c-9')).toBe(true);
  });

  test('la mémoire est bornée : les replis les plus anciens tombent les premiers', () => {
    const disk = storage();
    const memory = composerFoldMemory(disk);
    Array.from({ length: 320 }, (_, index) => memory.remember(`c-${index}`, true));
    expect(composerFoldMemory(disk).isFolded('c-0')).toBe(false);
    expect(composerFoldMemory(disk).isFolded('c-319')).toBe(true);
  });
});
