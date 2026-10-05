import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import { ADMIN_FICHES } from './admin-routes';
import {
  ADMIN_GROUPS,
  ADMIN_SECTIONS,
  canEnterAdmin,
  hasAdministrationRank,
  visibleAdminSections,
  type AdminPermissions,
  type AdminSection,
} from './sections';

/**
 * QUI VOIT L'ADMINISTRATION, ET CE QU'IL Y VOIT (#6432, #8876).
 *
 * Deux familles de témoins, et elles ne se mélangent pas :
 *
 * 1. **Le REGISTRE est épinglé** (dix-neuf sections, sept groupes, leurs
 *    permissions, leurs routes, leur ordre) — c'est la décision de la
 *    spécification, elle ne bouge que par un lot qui la révise.
 * 2. **La VISIBILITÉ se teste sur des registres SYNTHÉTIQUES** — jamais sur
 *    `ADMIN_SECTIONS` : dix lots basculent leur drapeau `ready` à tour de rôle,
 *    et un témoin qui épinglerait « ce qu'un BIGBOSS voit aujourd'hui »
 *    changerait à chaque bascule, pour des raisons qui n'ont rien à voir avec
 *    la règle qu'il garde.
 *
 * Le témoin le plus important de la seconde famille reste le premier : `null` —
 * pas encore su, ou requête refusée — doit rendre une liste VIDE. Une garde qui
 * s'ouvre quand la réponse manque n'est pas une garde.
 */

const AUCUNE: AdminPermissions = {
  canAccessAdmin: false,
  canManageUsers: false,
  canManageGroups: false,
  canManageConversations: false,
  canViewAnalytics: false,
  canModerateContent: false,
  canViewAuditLogs: false,
  canManageNotifications: false,
  canManageTranslations: false,
  canManageAgent: false,
};

const TOUTES: AdminPermissions = {
  canAccessAdmin: true,
  canManageUsers: true,
  canManageGroups: true,
  canManageConversations: true,
  canViewAnalytics: true,
  canModerateContent: true,
  canViewAuditLogs: true,
  canManageNotifications: true,
  canManageTranslations: true,
  canManageAgent: true,
};

describe('le registre des dix-neuf sections (spécification § 1.2)', () => {
  const ligne = (section: AdminSection) => [section.id, section.group, section.permission, section.adminRankOnly === true, section.route];

  test('les ids, leur groupe, leur permission, leur rang et leur route, dans l’ordre du menu', () => {
    expect(ADMIN_SECTIONS.map(ligne)).toEqual([
      ['dashboard', 'overview', 'canAccessAdmin', false, 'admin'],
      ['users', 'people', 'canManageUsers', false, 'adminUsers'],
      ['anonymous', 'people', 'canManageUsers', false, 'adminAnonymous'],
      ['invitations', 'people', 'canManageUsers', false, 'adminInvitations'],
      ['conversations', 'exchanges', 'canManageConversations', true, 'adminConversations'],
      ['communities', 'exchanges', 'canManageGroups', false, 'adminCommunities'],
      ['shareLinks', 'exchanges', 'canManageConversations', false, 'adminShareLinks'],
      ['posts', 'content', 'canModerateContent', false, 'adminPosts'],
      ['reports', 'moderation', 'canModerateContent', false, 'adminReports'],
      ['audit', 'moderation', 'canViewAuditLogs', false, 'adminAudit'],
      ['analytics', 'growth', 'canViewAnalytics', false, 'adminAnalytics'],
      ['ranking', 'growth', 'canViewAnalytics', false, 'adminRanking'],
      ['trackingLinks', 'growth', 'canViewAnalytics', false, 'adminTrackingLinks'],
      ['broadcasts', 'growth', 'canManageNotifications', false, 'adminBroadcasts'],
      ['monitoring', 'platform', 'canViewAnalytics', true, 'adminMonitoring'],
      ['languages', 'platform', 'canViewAnalytics', false, 'adminLanguages'],
      ['agent', 'platform', 'canManageAgent', false, 'adminAgent'],
      ['engagementScale', 'platform', 'canAccessAdmin', true, 'adminEngagementScale'],
      ['settings', 'platform', 'canAccessAdmin', false, 'adminSettings'],
    ]);
  });

  test('les sept groupes, dans leur ordre, chacun avec sa clé de catalogue', () => {
    expect(ADMIN_GROUPS).toEqual([
      { id: 'overview', labelKey: 'admin.group.overview' },
      { id: 'people', labelKey: 'admin.group.people' },
      { id: 'exchanges', labelKey: 'admin.group.exchanges' },
      { id: 'content', labelKey: 'admin.group.content' },
      { id: 'moderation', labelKey: 'admin.group.moderation' },
      { id: 'growth', labelKey: 'admin.group.growth' },
      { id: 'platform', labelKey: 'admin.group.platform' },
    ]);
  });

  test('les sections sont RANGÉES par groupe : le menu n’a jamais à les réordonner', () => {
    const ordre = ADMIN_GROUPS.map((groupe) => groupe.id);
    const positions = ADMIN_SECTIONS.map((section) => ordre.indexOf(section.group));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('aucun identifiant en double — deux tuiles homonymes seraient indiscernables', () => {
    expect(new Set(ADMIN_SECTIONS.map((section) => section.id)).size).toBe(ADMIN_SECTIONS.length);
  });

  test('chaque section porte sa clé de libellé ET sa ligne d’aide, jamais un libellé en dur', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.labelKey).toBe(`admin.nav.${section.id}`);
    }
  });

  test('chaque route de section est une clé de la table des routes, sous `/admin`', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(ROUTES[section.route].pattern.startsWith('/admin')).toBe(true);
    }
  });

  test('chaque genre d’entité a sa fiche, dans les deux espaces, sous la route de sa section', () => {
    expect(ADMIN_FICHES.map((fiche) => fiche.entity)).toEqual([
      'user',
      'anonymous',
      'invitation',
      'conversation',
      'community',
      'shareLink',
      'post',
      'report',
      'trackingLink',
      'broadcast',
    ]);
  });

  test('les cinq sections déjà servies sont prêtes ; aucune section neuve n’est offerte sans son drapeau', () => {
    const prêtes = ADMIN_SECTIONS.filter((section) => section.ready).map((section) => section.id);
    for (const id of ['dashboard', 'users', 'anonymous', 'conversations', 'agent']) expect(prêtes).toContain(id);
  });
});

const section = (id: AdminSection['id'], extra: Partial<AdminSection> = {}): AdminSection => ({
  id,
  group: 'platform',
  labelKey: `admin.nav.${id}`,
  route: 'admin',
  permission: 'canAccessAdmin',
  ready: true,
  glyph: 'gear',
  ...extra,
});

describe('visibleAdminSections — fail-closed par construction (registres synthétiques)', () => {
  const registre: readonly AdminSection[] = [
    section('dashboard'),
    section('users', { permission: 'canManageUsers' }),
    section('conversations', { permission: 'canManageConversations', adminRankOnly: true }),
    section('agent', { permission: 'canManageAgent' }),
    section('audit', { permission: 'canViewAuditLogs', ready: false }),
  ];
  const ids = (permissions: AdminPermissions | null, role?: string | null) =>
    visibleAdminSections(permissions, role, registre).map((s) => s.id);

  test('rend une liste VIDE quand la matrice n’est pas connue', () => {
    expect(ids(null)).toEqual([]);
    expect(ids(null, 'BIGBOSS')).toEqual([]);
  });

  test('rend une liste VIDE sans canAccessAdmin, même si une permission fine est vraie', () => {
    expect(ids({ ...AUCUNE, canManageUsers: true })).toEqual([]);
  });

  test('une section PAS PRÊTE n’est offerte à personne, même BIGBOSS avec toutes les permissions', () => {
    expect(ids(TOUTES, 'BIGBOSS')).not.toContain('audit');
  });

  test('…et la même section, devenue prête, l’est aussitôt', () => {
    const prête = registre.map((s) => (s.id === 'audit' ? { ...s, ready: true } : s));
    expect(visibleAdminSections(TOUTES, 'BIGBOSS', prête).map((s) => s.id)).toContain('audit');
  });

  test('ne rend que les sections dont la permission est vraie, dans l’ordre du registre', () => {
    expect(ids({ ...AUCUNE, canAccessAdmin: true, canManageUsers: true })).toEqual(['dashboard', 'users']);
    expect(ids(TOUTES, 'BIGBOSS')).toEqual(['dashboard', 'users', 'conversations', 'agent']);
  });

  /**
   * LE RANG D'ADMINISTRATION (#6862) — `canManageConversations` est portée par
   * BIGBOSS, ADMIN **et MODERATOR**. Sans le filtre de rang, un MODERATOR verrait
   * la tuile et n'obtiendrait que des 403. **MODERATOR est le rang où les deux
   * lois divergent** : c'est là, et nulle part ailleurs, qu'un témoin peut tomber
   * (leçon 261).
   */
  test('la section réservée au rang reste masquée SANS rôle — l’absence est fermante', () => {
    expect(ids(TOUTES)).not.toContain('conversations');
    expect(ids(TOUTES, null)).not.toContain('conversations');
  });

  test('un MODERATOR ne la voit pas, bien qu’il PORTE la permission', () => {
    expect(ids(TOUTES, 'MODERATOR')).not.toContain('conversations');
  });

  test('un ADMIN et un BIGBOSS la voient', () => {
    expect(ids(TOUTES, 'ADMIN')).toContain('conversations');
    expect(ids(TOUTES, 'BIGBOSS')).toContain('conversations');
  });

  test('la tuile de l’agent se lit sur `canManageAgent`, jamais sur l’accès — et ne dépend pas du rang (#6733)', () => {
    const moderateur: AdminPermissions = { ...AUCUNE, canAccessAdmin: true, canManageConversations: true, canManageAgent: false };
    expect(ids(moderateur, 'MODERATOR')).not.toContain('agent');
    expect(ids({ ...AUCUNE, canAccessAdmin: true, canManageAgent: true })).toContain('agent');
  });
});

describe('canEnterAdmin et hasAdministrationRank', () => {
  test('canEnterAdmin : faux sur null et sur toute matrice sans canAccessAdmin', () => {
    expect(canEnterAdmin(null)).toBe(false);
    expect(canEnterAdmin(AUCUNE)).toBe(false);
    expect(canEnterAdmin({ ...AUCUNE, canAccessAdmin: true })).toBe(true);
  });

  test('hasAdministrationRank : BIGBOSS et ADMIN seulement', () => {
    expect(hasAdministrationRank('BIGBOSS')).toBe(true);
    expect(hasAdministrationRank('ADMIN')).toBe(true);
    for (const role of ['MODERATOR', 'AUDIT', 'ANALYST', 'USER', '', null, undefined]) {
      expect(hasAdministrationRank(role)).toBe(false);
    }
  });
});
