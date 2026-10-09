import { describe, expect, test } from 'bun:test';

import { postMenuEntries } from './publication-menu';

/**
 * LE MENU « ⋯ » D'UNE PUBLICATION (#7533) — l'ORDRE et les CONDITIONS d'iOS
 * (`FeedPostCard+Header.swift:164-241`), et rien qui n'ait de geste (loi 4).
 */
const base = { viewerId: 'u-me', authorId: 'u-other', isDetail: false, hasText: true, canShare: true, canSave: true, viewerIsAdministrator: false } as const;

describe('postMenuEntries', () => {
  test('la publication d’un AUTRE : Ouvrir · Copier · Partager · Enregistrer · Signaler', () => {
    expect(postMenuEntries(base)).toEqual(['open', 'copyText', 'share', 'save', 'report']);
  });

  test('MA publication : Épingler, Modifier puis Supprimer — dans l’ordre d’iOS —, jamais Signaler ni « Vues »', () => {
    expect(postMenuEntries({ ...base, authorId: 'u-me' })).toEqual(['open', 'copyText', 'share', 'save', 'pin', 'edit', 'delete']);
  });

  /**
   * « VUES » (#9727, décision porteur du 2026-10-09) — seuls les ADMINISTRATEURS
   * (ADMIN/BIGBOSS) voient QUI a vu un post ou un réel ; l'auteur n'en voit que
   * le nombre, comme avant. La passerelle refuse la liste à tout autre (403).
   */
  test('« Vues » ne s’offre qu’à un administrateur — sur sa publication comme sur celle d’un autre', () => {
    expect(postMenuEntries({ ...base, authorId: 'u-me', viewerIsAdministrator: true })).toEqual([
      'open', 'copyText', 'share', 'save', 'views', 'pin', 'edit', 'delete',
    ]);
    expect(postMenuEntries({ ...base, viewerIsAdministrator: true })).toEqual(['open', 'copyText', 'share', 'save', 'views', 'report']);
  });

  test('un invité n’a jamais « Vues », même si un rôle traînait', () => {
    expect(postMenuEntries({ ...base, viewerId: null, viewerIsAdministrator: true })).not.toContain('views');
  });

  test('sans texte, rien à copier ; sur la fiche, rien à ouvrir', () => {
    expect(postMenuEntries({ ...base, hasText: false, isDetail: true })).toEqual(['share', 'save', 'report']);
  });

  test('sur la fiche, MA publication garde Épingler, Modifier et Supprimer', () => {
    expect(postMenuEntries({ ...base, authorId: 'u-me', isDetail: true })).toEqual(['copyText', 'share', 'save', 'pin', 'edit', 'delete']);
  });

  test('sans hôte de partage ni de signet, ces entrées n’existent pas', () => {
    expect(postMenuEntries({ ...base, canShare: false, canSave: false })).toEqual(['open', 'copyText', 'report']);
  });

  test('un INVITÉ ne signale pas, n’enregistre pas, et rien n’est « à lui » — même sans auteur connu', () => {
    expect(postMenuEntries({ ...base, viewerId: null, authorId: undefined })).toEqual(['open', 'copyText', 'share']);
  });

  test('un auteur INCONNU n’est jamais « moi » — ni Signaler ni Modifier', () => {
    expect(postMenuEntries({ ...base, authorId: undefined })).toContain('report');
    expect(postMenuEntries({ ...base, authorId: undefined })).not.toContain('delete');
    expect(postMenuEntries({ ...base, authorId: undefined })).not.toContain('edit');
  });

  test('la publication d’un AUTRE n’offre jamais Modifier', () => {
    expect(postMenuEntries(base)).not.toContain('edit');
  });
});
