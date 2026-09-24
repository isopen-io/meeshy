import { describe, expect, test } from 'bun:test';

import { postMenuEntries } from './publication-menu';

/**
 * LE MENU « ⋯ » D'UNE PUBLICATION (#7533) — l'ORDRE et les CONDITIONS d'iOS
 * (`FeedPostCard+Header.swift:164-241`), et rien qui n'ait de geste (loi 4).
 */
const base = { viewerId: 'u-me', authorId: 'u-other', isDetail: false, hasText: true, canShare: true, canSave: true } as const;

describe('postMenuEntries', () => {
  test('la publication d’un AUTRE : Ouvrir · Copier · Partager · Enregistrer · Signaler', () => {
    expect(postMenuEntries(base)).toEqual(['open', 'copyText', 'share', 'save', 'report']);
  });

  test('MA publication : Épingler et Supprimer, jamais Signaler', () => {
    expect(postMenuEntries({ ...base, authorId: 'u-me' })).toEqual(['open', 'copyText', 'share', 'save', 'pin', 'delete']);
  });

  test('sans texte, rien à copier ; sur la fiche, rien à ouvrir', () => {
    expect(postMenuEntries({ ...base, hasText: false, isDetail: true })).toEqual(['share', 'save', 'report']);
  });

  test('sans hôte de partage ni de signet, ces entrées n’existent pas', () => {
    expect(postMenuEntries({ ...base, canShare: false, canSave: false })).toEqual(['open', 'copyText', 'report']);
  });

  test('un INVITÉ ne signale pas, n’enregistre pas, et rien n’est « à lui » — même sans auteur connu', () => {
    expect(postMenuEntries({ ...base, viewerId: null, authorId: undefined })).toEqual(['open', 'copyText', 'share']);
  });

  test('un auteur INCONNU n’est jamais « moi »', () => {
    expect(postMenuEntries({ ...base, authorId: undefined })).toContain('report');
    expect(postMenuEntries({ ...base, authorId: undefined })).not.toContain('delete');
  });
});
