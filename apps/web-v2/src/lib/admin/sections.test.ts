import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import { ADMIN_SECTIONS, visibleAdminSections, type AdminPermissions } from './sections';

/**
 * QUI VOIT L'ADMINISTRATION, ET CE QU'IL Y VOIT (#6432).
 *
 * Le témoin le plus important du fichier est le premier : `null` — pas encore
 * su, ou requête refusée — doit rendre une liste VIDE. Une garde qui s'ouvre
 * quand la réponse manque n'est pas une garde ; et c'est l'état par lequel
 * TOUT écran passe au montage, donc celui qu'on voit le plus.
 *
 * Le legacy est DÉCOMMISSIONNÉ (directive porteur 2026-09-15, #6702) : une
 * section que la v2 ne sert pas n'a plus aucune adresse où mener. Elle est
 * MASQUÉE — jamais offerte vers un ailleurs qui n'existe plus (loi 4).
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

  test('une matrice complète ne voit que les sections que la v2 SERT (#6702)', () => {
    expect(visibleAdminSections(TOUTES).map((s) => s.id)).toEqual(['dashboard', 'users']);
  });

  test('ne rend que les sections dont la permission est vraie', () => {
    const analyste: AdminPermissions = { ...AUCUNE, canAccessAdmin: true, canViewAnalytics: true };

    expect(visibleAdminSections(analyste).map((s) => s.id)).toEqual(['dashboard']);
  });

  test('conserve l’ORDRE de la table — un admin retrouve ses sections où il les cherche', () => {
    expect(visibleAdminSections(TOUTES).map((s) => s.id)).toEqual(
      ADMIN_SECTIONS.filter((s) => s.route !== null).map((s) => s.id),
    );
  });
});

describe('aucune section visible ne mène hors de la v2 (#6702)', () => {
  test('chaque section visible vise une route de la table des routes, sous `/admin`', () => {
    const sections = visibleAdminSections(TOUTES);

    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(ROUTES[section.route].pattern.startsWith('/admin')).toBe(true);
    }
  });
});

describe('la table des sections', () => {
  test('n’a aucun identifiant en double — deux tuiles homonymes seraient indiscernables', () => {
    expect(new Set(ADMIN_SECTIONS.map((s) => s.id)).size).toBe(ADMIN_SECTIONS.length);
  });

  test('porte une clé de catalogue pour chaque section — jamais un libellé en dur', () => {
    for (const section of ADMIN_SECTIONS) {
      expect(section.labelKey).toMatch(/^admin\.nav\./);
    }
  });
});
