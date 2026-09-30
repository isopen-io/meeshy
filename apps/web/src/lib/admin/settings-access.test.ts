import { beforeAll, describe, expect, test } from 'bun:test';

import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { adminIdentityFixture } from '@/test-support/admin-assertions';

import type { AdminSectionId } from './admin-routes';
import { ADMIN_SECTIONS, visibleAdminSections, type AdminPermissionKey, type AdminSection } from './sections';
import { CAPABILITY_KEYS, SOVEREIGN_GESTURES, capabilityOpensText, capabilityRows } from './settings-access';

/**
 * **VOTRE ACCÈS, DIT EN MOTS** (#8876, #6732) — les dix capacités servies, accordées ou
 * non, et ce que chacune OUVRE. Ce que chacune ouvre se LIT dans le registre des sections
 * (`ADMIN_SECTIONS`) : jamais une seconde matrice à tenir d'accord avec la première.
 */
beforeAll(async () => {
  await Promise.all(ADMIN_LANGUAGES.map((language) => loadAdminInterfaceCatalog(language)));
});

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ids = (sections: readonly AdminSectionId[]): readonly string[] => sections;

const synthetic = (id: AdminSectionId, permission: AdminPermissionKey, ready: boolean): AdminSection => {
  const real = ADMIN_SECTIONS.find((section) => section.id === id);
  if (real === undefined) throw new Error(`section inconnue : ${id}`);
  return { ...real, permission, ready };
};

describe('les dix capacités', () => {
  test('la liste couvre exactement les clés de la matrice servie — aucune oubliée, aucune en trop', () => {
    expect([...CAPABILITY_KEYS].sort()).toEqual(Object.keys(BIGBOSS.permissions).sort());
    expect(new Set(CAPABILITY_KEYS).size).toBe(10);
  });

  test('chacune est dite dans les quatre langues de l’administration : libellé et explication', async () => {
    const { translateAdmin } = await import('@/lib/i18n-admin-catalog');
    for (const language of ADMIN_LANGUAGES) {
      for (const key of CAPABILITY_KEYS) {
        expect(translateAdmin(language, `admin.settings.cap.${key}.label`).trim()).not.toBe('');
        expect(translateAdmin(language, `admin.settings.cap.${key}.explain`).trim()).not.toBe('');
      }
    }
  });
});

describe('capabilityRows — accordée ou non, et ce que ça ouvre', () => {
  test('BIGBOSS : tout est accordé, et chaque capacité ouvre les sections du registre qui la demandent', () => {
    const reached = visibleAdminSections(BIGBOSS.permissions, BIGBOSS.role);
    const rows = capabilityRows({ granted: (key) => BIGBOSS.permissions[key], reached });

    expect(rows.map((row) => row.key)).toEqual([...CAPABILITY_KEYS]);
    expect(rows.every((row) => row.granted)).toBe(true);
    const users = rows.find((row) => row.key === 'canManageUsers');
    expect(ids(users?.opens ?? [])).toEqual(reached.filter((section) => section.permission === 'canManageUsers').map((section) => section.id));
    expect(ids(users?.opens ?? [])).toContain('users');
  });

  test('ce que ça ouvre est LU dans le registre fourni : un registre synthétique change la réponse', () => {
    const registry = [synthetic('users', 'canManageUsers', true), synthetic('agent', 'canManageUsers', true)];
    const rows = capabilityRows({ granted: () => true, reached: registry, registry });

    expect(ids(rows.find((row) => row.key === 'canManageUsers')?.opens ?? [])).toEqual(['users', 'agent']);
  });

  test('une capacité non accordée dit ce qu’elle OUVRIRAIT : les sections prêtes qui la demandent', () => {
    const registry = [synthetic('audit', 'canViewAuditLogs', true), synthetic('ranking', 'canViewAuditLogs', false)];
    const rows = capabilityRows({ granted: (key) => key !== 'canViewAuditLogs', reached: [], registry });

    const audit = rows.find((row) => row.key === 'canViewAuditLogs');
    expect(audit?.granted).toBe(false);
    expect(ids(audit?.opens ?? [])).toEqual(['audit']);
  });

  test('une capacité accordée ne liste que ce que le lecteur atteint vraiment (le rang compte)', () => {
    const moderator = adminIdentityFixture({ role: 'MODERATOR' });
    const reached = visibleAdminSections(moderator.permissions, moderator.role);
    const rows = capabilityRows({ granted: (key) => moderator.permissions[key], reached });

    expect(ids(rows.find((row) => row.key === 'canManageConversations')?.opens ?? [])).not.toContain('conversations');
  });

  test('une capacité qu’aucune section ne demande n’ouvre rien : canManageTranslations', () => {
    const reached = visibleAdminSections(BIGBOSS.permissions, BIGBOSS.role);
    const rows = capabilityRows({ granted: () => true, reached });

    expect(rows.find((row) => row.key === 'canManageTranslations')?.opens).toEqual([]);
  });

  test('ADMIN : le journal d’audit est non accordé, et dit qu’il ouvrirait le journal', () => {
    const admin = adminIdentityFixture({ role: 'ADMIN' });
    const reached = visibleAdminSections(admin.permissions, admin.role);
    const rows = capabilityRows({ granted: (key) => admin.permissions[key], reached });

    const audit = rows.find((row) => row.key === 'canViewAuditLogs');
    expect(audit?.granted).toBe(false);
    expect(ids(audit?.opens ?? [])).toContain('audit');
  });
});

describe('capabilityOpensText — une phrase', () => {
  const rowOf = (granted: boolean, opens: readonly AdminSectionId[]) => ({ key: 'canManageUsers' as const, granted, opens });

  test('accordée : « Ouvre : Comptes, Anonymes et Demandes de contact »', () => {
    expect(capabilityOpensText(rowOf(true, ['users', 'anonymous', 'invitations']), 'fr')).toBe('Ouvre : Comptes, Anonymes et Demandes de contact');
  });

  test('non accordée : le conditionnel, « Ouvrirait : … »', () => {
    expect(capabilityOpensText(rowOf(false, ['users']), 'fr')).toBe('Ouvrirait : Comptes');
  });

  test('sans section : « N’ouvre aucune section à elle seule. », accordée ou non', () => {
    expect(capabilityOpensText(rowOf(true, []), 'fr')).toBe('N’ouvre aucune section à elle seule.');
    expect(capabilityOpensText(rowOf(false, []), 'fr')).toBe('N’ouvre aucune section à elle seule.');
  });

  test('le libellé de chaque section vient du catalogue, dans la langue demandée', () => {
    expect(capabilityOpensText(rowOf(true, ['users']), 'en')).toBe('Opens: Accounts');
  });
});

describe('les gestes du créateur', () => {
  test('six gestes, chacun dit dans les quatre langues de l’administration', async () => {
    const { translateAdmin } = await import('@/lib/i18n-admin-catalog');
    expect([...SOVEREIGN_GESTURES]).toEqual(['readMessages', 'listConversations', 'revealLink', 'consents', 'agentModel', 'agentReset']);
    for (const language of ADMIN_LANGUAGES) {
      for (const gesture of SOVEREIGN_GESTURES) expect(translateAdmin(language, `admin.settings.sovereign.${gesture}`).trim()).not.toBe('');
    }
  });
});
