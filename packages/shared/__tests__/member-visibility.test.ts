import { describe, it, expect } from 'vitest';
import {
  MEMBER_COUNT_DISPLAY_CAP,
  ACTIVE_MEMBER_LISTING_LIMIT,
  presentMemberCount,
  formatMemberCount,
  isMemberListingRestricted,
} from '../utils/member-visibility';

describe('presentMemberCount — cap 199+ du compteur de membres', () => {
  it('expose les constantes produit 199 / 99', () => {
    expect(MEMBER_COUNT_DISPLAY_CAP).toBe(199);
    expect(ACTIVE_MEMBER_LISTING_LIMIT).toBe(99);
  });

  it('laisse passer un compte <= 199 sans drapeau', () => {
    expect(presentMemberCount(0)).toEqual({ memberCount: 0 });
    expect(presentMemberCount(42)).toEqual({ memberCount: 42 });
    expect(presentMemberCount(199)).toEqual({ memberCount: 199 });
  });

  it('plafonne à 199 avec drapeau au-delà de 199', () => {
    expect(presentMemberCount(200)).toEqual({ memberCount: 199, memberCountCapped: true });
    expect(presentMemberCount(12345)).toEqual({ memberCount: 199, memberCountCapped: true });
  });

  it('rend la valeur exacte sans drapeau quand le lecteur voit les comptes exacts', () => {
    expect(presentMemberCount(200, { viewerSeesExactCount: true })).toEqual({ memberCount: 200 });
    expect(presentMemberCount(12345, { viewerSeesExactCount: true })).toEqual({ memberCount: 12345 });
  });
});

describe('formatMemberCount — affichage client', () => {
  it('affiche la valeur brute quand non plafonné', () => {
    expect(formatMemberCount(42)).toBe('42');
    expect(formatMemberCount(199)).toBe('199');
    expect(formatMemberCount(199, false)).toBe('199');
  });

  it('affiche « 199+ » quand plafonné', () => {
    expect(formatMemberCount(199, true)).toBe('199+');
  });
});

describe('isMemberListingRestricted — top-99 réservé aux simples membres', () => {
  it('restreint un USER plateforme simple membre de la conversation', () => {
    expect(
      isMemberListingRestricted({ platformRole: 'USER', conversationRole: 'member', communityRole: null })
    ).toBe(true);
  });

  it('restreint un anonyme (aucun rôle plateforme)', () => {
    expect(
      isMemberListingRestricted({ platformRole: null, conversationRole: 'member', communityRole: null })
    ).toBe(true);
  });

  it('restreint un AGENT (sous USER dans la hiérarchie)', () => {
    expect(
      isMemberListingRestricted({ platformRole: 'AGENT', conversationRole: 'member', communityRole: null })
    ).toBe(true);
  });

  it('exempte tout rôle plateforme au-dessus de USER', () => {
    for (const role of ['BIGBOSS', 'ADMIN', 'MODERATOR', 'AUDIT', 'ANALYST']) {
      expect(
        isMemberListingRestricted({ platformRole: role, conversationRole: 'member', communityRole: null })
      ).toBe(false);
    }
  });

  it('exempte un rôle de conversation au-dessus de member', () => {
    for (const role of ['creator', 'admin', 'moderator']) {
      expect(
        isMemberListingRestricted({ platformRole: 'USER', conversationRole: role, communityRole: null })
      ).toBe(false);
    }
  });

  it('exempte un admin ou modérateur de la communauté de la conversation', () => {
    for (const role of ['admin', 'moderator']) {
      expect(
        isMemberListingRestricted({ platformRole: 'USER', conversationRole: 'member', communityRole: role })
      ).toBe(false);
    }
  });

  it('reste restreint quand le rôle communauté est simple member', () => {
    expect(
      isMemberListingRestricted({ platformRole: 'USER', conversationRole: 'member', communityRole: 'member' })
    ).toBe(true);
  });

  it('tolère la casse des rôles venus du fil ou de la base', () => {
    expect(
      isMemberListingRestricted({ platformRole: 'user', conversationRole: 'MEMBER', communityRole: null })
    ).toBe(true);
    expect(
      isMemberListingRestricted({ platformRole: 'admin', conversationRole: 'member', communityRole: null })
    ).toBe(false);
    expect(
      isMemberListingRestricted({ platformRole: 'USER', conversationRole: 'member', communityRole: 'ADMIN' })
    ).toBe(false);
  });

  it('reste restreint face à un rôle plateforme inconnu (prudence)', () => {
    expect(
      isMemberListingRestricted({ platformRole: 'WIZARD', conversationRole: 'member', communityRole: null })
    ).toBe(true);
  });
});
