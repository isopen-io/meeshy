import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

import {
  ADMIN_FICHES,
  ADMIN_ROUTE_KEYS,
  ADMIN_SECTION_TABLE,
  adminBackOf,
  adminFicheRoute,
  adminGroupOf,
  adminListRoute,
  adminRouteOf,
  adminSectionOfRouteKey,
  sectionOfEntity,
} from './admin-routes';

/**
 * LA TABLE DES SECTIONS ET DES ENTITÉS (#8876) — l'unique source des paires
 * liste/fiche et des deux espaces. Ce que ces témoins gardent : la table ne
 * déclare jamais une clé que `ROUTES` ignore, les deux espaces sont jumeaux
 * (même motif, préfixe près), et chaque résolveur rend la clé que la table dit.
 */
const patternOf = (key: string): string => {
  const route = Object.entries(ROUTES).find(([candidate]) => candidate === key);
  if (route === undefined) throw new Error(`route absente : ${key}`);
  return route[1].pattern;
};

describe('la table des dix-huit sections', () => {
  test('dix-huit sections, dix fiches', () => {
    expect(ADMIN_SECTION_TABLE).toHaveLength(18);
    expect(ADMIN_FICHES).toHaveLength(10);
  });

  test('chaque clé de la table est une route déclarée', () => {
    for (const key of ADMIN_ROUTE_KEYS) expect(patternOf(key).length).toBeGreaterThan(0);
  });

  test('les deux espaces sont JUMEAUX : même motif, seul le préfixe change', () => {
    for (const row of ADMIN_SECTION_TABLE) {
      expect(patternOf(row.list.adm)).toBe(patternOf(row.list.admin).replace('/admin', '/adm'));
    }
    for (const fiche of ADMIN_FICHES) {
      expect(patternOf(fiche.adm)).toBe(patternOf(fiche.admin).replace('/admin', '/adm'));
    }
  });

  test('une liste a deux segments, une fiche en a trois — aucune ambiguïté d’ordre dans le routeur', () => {
    const profondeur = (key: string) => patternOf(key).split('/').filter(Boolean).length;
    for (const row of ADMIN_SECTION_TABLE) {
      if (row.id !== 'dashboard') expect(profondeur(row.list.admin)).toBe(2);
    }
    for (const fiche of ADMIN_FICHES) expect(profondeur(fiche.admin)).toBe(3);
  });

  test('le paramètre de la fiche est celui que son motif déclare', () => {
    for (const fiche of ADMIN_FICHES) expect(patternOf(fiche.admin)).toContain(`$${fiche.param}`);
  });
});

describe('les résolveurs', () => {
  test('adminListRoute / adminRouteOf / adminBackOf', () => {
    expect(adminListRoute('users', 'admin')).toBe('adminUsers');
    expect(adminListRoute('users', 'adm')).toBe('admUsers');
    expect(adminListRoute('dashboard', 'adm')).toBe('adm');
    expect(adminRouteOf('shareLinks')).toBe('adminShareLinks');
    expect(adminBackOf('communities', 'adm')).toBe('admCommunities');
  });

  test('adminFicheRoute et sectionOfEntity : chaque genre retrouve sa fiche et sa section', () => {
    expect(adminFicheRoute('user', 'adm')).toBe('admUser');
    expect(adminFicheRoute('shareLink', 'admin')).toBe('adminShareLink');
    expect(sectionOfEntity('trackingLink')).toBe('trackingLinks');
    expect(sectionOfEntity('anonymous')).toBe('anonymous');
    expect(sectionOfEntity('invitation')).toBe('invitations');
  });

  test('adminGroupOf range chaque section dans son groupe', () => {
    expect(adminGroupOf('dashboard')).toBe('overview');
    expect(adminGroupOf('reports')).toBe('moderation');
    expect(adminGroupOf('languages')).toBe('platform');
  });

  test('adminSectionOfRouteKey : liste ou fiche, dans l’un ou l’autre espace — sinon null', () => {
    expect(adminSectionOfRouteKey('admReport')).toBe('reports');
    expect(adminSectionOfRouteKey('adminReports')).toBe('reports');
    expect(adminSectionOfRouteKey('list')).toBeNull();
  });
});
