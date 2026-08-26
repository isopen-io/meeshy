import { describe, it, expect } from 'vitest';
import {
  MEMBER_COUNT_DISPLAY_CAP,
  ACTIVE_MEMBER_LISTING_LIMIT,
  presentMemberCount,
  formatMemberCount,
  isMemberListingRestricted,
  canViewExactMemberCount,
  platformRoleLevel,
} from '../utils/member-visibility';
import { GLOBAL_ROLE_HIERARCHY, GlobalUserRole, normalizeGlobalRole } from '../types/role-types';

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

describe('canViewExactMemberCount — qui a droit à l\'effectif ENTIER, sans plafond', () => {
  it('autorise les rôles plateforme ADMIN, BIGBOSS et MODERATOR', () => {
    for (const platformRole of ['BIGBOSS', 'ADMIN', 'MODERATOR']) {
      expect(canViewExactMemberCount({ platformRole, conversationRole: 'member' })).toBe(true);
    }
  });

  it('refuse AUDIT et ANALYST — voir des logs n\'est pas voir un effectif', () => {
    for (const platformRole of ['AUDIT', 'ANALYST']) {
      expect(canViewExactMemberCount({ platformRole, conversationRole: 'member' })).toBe(false);
    }
  });

  it('refuse un simple USER, un AGENT et un anonyme sans rôle de conversation', () => {
    expect(canViewExactMemberCount({ platformRole: 'USER', conversationRole: 'member' })).toBe(false);
    expect(canViewExactMemberCount({ platformRole: 'AGENT', conversationRole: 'member' })).toBe(false);
    expect(canViewExactMemberCount({ platformRole: null, conversationRole: null })).toBe(false);
    expect(canViewExactMemberCount({})).toBe(false);
  });

  it('autorise l\'admin du GROUPE — creator et admin de la conversation', () => {
    for (const conversationRole of ['creator', 'admin']) {
      expect(canViewExactMemberCount({ platformRole: 'USER', conversationRole })).toBe(true);
    }
  });

  it('refuse un simple modérateur de la conversation', () => {
    expect(canViewExactMemberCount({ platformRole: 'USER', conversationRole: 'moderator' })).toBe(false);
  });

  it('autorise un admin de groupe SANS aucun rôle plateforme (participant anonyme promu)', () => {
    expect(canViewExactMemberCount({ platformRole: null, conversationRole: 'admin' })).toBe(true);
  });

  it('tolère la casse des deux rôles', () => {
    expect(canViewExactMemberCount({ platformRole: 'moderator', conversationRole: 'member' })).toBe(true);
    expect(canViewExactMemberCount({ platformRole: 'user', conversationRole: 'CREATOR' })).toBe(true);
  });

  it('échoue fermé face à un rôle inconnu des deux hiérarchies', () => {
    expect(canViewExactMemberCount({ platformRole: 'WIZARD', conversationRole: 'sorcier' })).toBe(false);
  });

  // « Échoue fermé » se disait de DEUX hiérarchies et n'était vrai que d'une.
  // Le niveau de conversation lit la table directement (`?? 0`), mais le
  // niveau plateforme passait par `normalizeGlobalRole`, dont le contrat est de
  // RÉPARER une chaîne : il rend `USER` pour n'importe quoi, donc niveau 10.
  // La primitive voisine `hasMinimumRole` refuse délibérément ce détour et le
  // documente (role-types.ts). Inoffensif tant que le seuil vaut 60 — le jour
  // où il descendrait vers USER, « échoue fermé » deviendrait « échoue ouvert »
  // sans qu'un seul test rougisse. C'est ce niveau, pas la réponse du prédicat,
  // qui porte la propriété : les deux seuils en place refusent 0 comme 10.
  it('donne le niveau 0 — pas le 10 de USER — à un rôle plateforme inconnu', () => {
    expect(platformRoleLevel('WIZARD')).toBe(0);
    expect(platformRoleLevel(null)).toBe(0);
    expect(platformRoleLevel(undefined)).toBe(0);
    expect(platformRoleLevel('WIZARD')).toBeLessThan(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.USER]);

    // Ce que `normalizeGlobalRole` en faisait, et que ce niveau ne fait plus.
    expect(GLOBAL_ROLE_HIERARCHY[normalizeGlobalRole('WIZARD')]).toBe(10);

    // Les rôles connus gardent leur niveau, casse comprise.
    expect(platformRoleLevel('USER')).toBe(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.USER]);
    expect(platformRoleLevel('moderator')).toBe(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.MODERATOR]);
    expect(platformRoleLevel('BIGBOSS')).toBe(GLOBAL_ROLE_HIERARCHY[GlobalUserRole.BIGBOSS]);
  });
});

// La règle produit se lit sur `presentMemberCount` : c'est le couple
// prédicat + présentation que les sites gateway composent, jamais l'un seul.
describe('effectif de 250 membres — la règle produit bout en bout', () => {
  const HUGE = 250;

  it('sert 199 + drapeau à un simple membre', () => {
    expect(
      presentMemberCount(HUGE, {
        viewerSeesExactCount: canViewExactMemberCount({ platformRole: 'USER', conversationRole: 'member' }),
      })
    ).toEqual({ memberCount: MEMBER_COUNT_DISPLAY_CAP, memberCountCapped: true });
  });

  it('sert 250 exact, sans drapeau, à l\'admin du groupe', () => {
    expect(
      presentMemberCount(HUGE, {
        viewerSeesExactCount: canViewExactMemberCount({ platformRole: 'USER', conversationRole: 'admin' }),
      })
    ).toEqual({ memberCount: HUGE });
  });

  it('sert 250 exact, sans drapeau, au modérateur plateforme', () => {
    expect(
      presentMemberCount(HUGE, {
        viewerSeesExactCount: canViewExactMemberCount({ platformRole: 'MODERATOR', conversationRole: 'member' }),
      })
    ).toEqual({ memberCount: HUGE });
  });

  it('ne plafonne AUCUNE valeur pour un lecteur autorisé, si grande soit-elle', () => {
    expect(
      presentMemberCount(1_000_000, {
        viewerSeesExactCount: canViewExactMemberCount({ platformRole: 'BIGBOSS' }),
      })
    ).toEqual({ memberCount: 1_000_000 });
  });
});
