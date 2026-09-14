import { describe, expect, test } from 'bun:test';

import {
  ADMIN_SECTIONS,
  adminSectionTarget,
  visibleAdminSections,
  type AdminPermissions,
} from './sections';

/**
 * QUI VOIT L'ADMINISTRATION, ET CE QU'IL Y VOIT (#6432).
 *
 * Le témoin le plus important du fichier est le premier : `null` — pas encore
 * su, ou requête refusée — doit rendre une liste VIDE. Une garde qui s'ouvre
 * quand la réponse manque n'est pas une garde ; et c'est l'état par lequel
 * TOUT écran passe au montage, donc celui qu'on voit le plus.
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
};

describe('visibleAdminSections — fail-closed par construction', () => {
  test('rend une liste VIDE quand la matrice n’est pas connue', () => {
    expect(visibleAdminSections(null)).toEqual([]);
  });

  test('rend une liste VIDE sans canAccessAdmin, même si une permission fine est vraie', () => {
    // L'accès à l'espace précède l'accès à ses pièces : sans cette règle, un
    // rôle intermédiaire entrerait par une section isolée.
    const modérateurSansAccès: AdminPermissions = { ...AUCUNE, canModerateContent: true };

    expect(visibleAdminSections(modérateurSansAccès)).toEqual([]);
  });

  test('rend TOUTES les sections à une matrice complète', () => {
    expect(visibleAdminSections(TOUTES)).toHaveLength(ADMIN_SECTIONS.length);
  });

  test('ne rend que les sections dont la permission est vraie', () => {
    const analyste: AdminPermissions = { ...AUCUNE, canAccessAdmin: true, canViewAnalytics: true };
    const identifiants = visibleAdminSections(analyste).map((s) => s.id);

    expect(identifiants).toEqual(['dashboard', 'analytics', 'trackingLinks', 'ranking', 'agent', 'monitoring']);
    expect(identifiants).not.toContain('users');
  });

  test('conserve l’ORDRE du legacy — un admin retrouve ses sections où il les cherche', () => {
    expect(visibleAdminSections(TOUTES).map((s) => s.id)).toEqual(ADMIN_SECTIONS.map((s) => s.id));
  });
});

describe('la table des sections', () => {
  test('vise `/admin/audit-logs`, jamais `/admin/audit` — le legacy pointe vers un 404', () => {
    const audit = ADMIN_SECTIONS.find((s) => s.id === 'audit');

    expect(audit?.legacyPath).toBe('/admin/audit-logs');
  });

  test('n’a aucun identifiant en double — deux tuiles homonymes seraient indiscernables', () => {
    expect(new Set(ADMIN_SECTIONS.map((s) => s.id)).size).toBe(ADMIN_SECTIONS.length);
  });

  test('porte une clé de catalogue pour chaque section — jamais un libellé en dur', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.labelKey).toMatch(/^admin\.nav\./);
    }
  });
});

describe('adminSectionTarget — la v2 quand elle a la vue, le legacy sinon', () => {
  test('reste INTERNE quand la v2 sert la section', () => {
    const users = ADMIN_SECTIONS.find((s) => s.id === 'users')!;

    expect(adminSectionTarget(users, 'https://meeshy.me')).toEqual({ href: '/admin/users', external: false });
  });

  test('sort vers le legacy quand la v2 ne la sert pas encore', () => {
    const audit = ADMIN_SECTIONS.find((s) => s.id === 'audit')!;

    expect(adminSectionTarget(audit, 'https://meeshy.me')).toEqual({
      href: 'https://meeshy.me/admin/audit-logs',
      external: true,
    });
  });

  test('ne double jamais la barre oblique, quelle que soit la forme de l’origine', () => {
    const audit = ADMIN_SECTIONS.find((s) => s.id === 'audit')!;

    expect(adminSectionTarget(audit, 'https://meeshy.me/').href).toBe('https://meeshy.me/admin/audit-logs');
  });
});
