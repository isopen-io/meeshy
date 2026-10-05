import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { ReactElement } from 'react';

import { decodeAdminPermissions } from '@/lib/api/admin';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { adminIdentityFixture, expectNoRawIdentifiers } from './admin-assertions';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
const ID = '64f1c2a9e8b7d6c5b4a39281';

describe('expectNoRawIdentifiers — la garde des règles R1 et R2', () => {
  test('passe sur un écran qui dit tout en mots', async () => {
    const host = await mounter.mount(
      <div>
        <p>Awa Diop · @awa</p>
        <p>Créateur</p>
        <time>il y a 3 minutes</time>
        <p>Oui</p>
      </div>,
    );
    expectNoRawIdentifiers(host);
    mounter.unmountAll();
  });

  test('tolère un identifiant DANS la ligne « Identifiant technique » — et nulle part ailleurs', async () => {
    const host = await mounter.mount(
      <dl>
        <code data-admin-technical-id>{ID}</code>
      </dl>,
    );
    expectNoRawIdentifiers(host);
    mounter.unmountAll();
  });

  const refuse = async (node: ReactElement) => {
    const host = await mounter.mount(node);
    expect(() => expectNoRawIdentifiers(host)).toThrow();
    mounter.unmountAll();
  };

  test('refuse un ObjectId comme libellé', async () => {
    await refuse(<p>Conversation {ID}</p>);
  });

  test('refuse un horodatage ISO brut', async () => {
    await refuse(<p>Créé le 2026-09-30T14:03:00.000Z</p>);
  });

  test('refuse true et false isolés', async () => {
    await refuse(<span>true</span>);
    await refuse(<span>false</span>);
  });

  test('refuse une énumération brute, en capitales ou en minuscules avec tiret bas', async () => {
    await refuse(<span>BIGBOSS</span>);
    await refuse(<p>Statut : DRAFT</p>);
    await refuse(<p>under_review</p>);
  });

  test('ne lit pas les attributs : data-admin-raw et href portent des codes par construction', async () => {
    const host = await mounter.mount(
      <a href={`/admin/users/${ID}`} data-admin-raw="BIGBOSS">
        Créateur
      </a>,
    );
    expectNoRawIdentifiers(host);
    mounter.unmountAll();
  });
});

describe('adminIdentityFixture — la matrice des dix clés', () => {
  test('BIGBOSS les porte toutes', () => {
    const { role, permissions } = adminIdentityFixture({ role: 'BIGBOSS' });
    expect(role).toBe('BIGBOSS');
    expect(Object.keys(permissions)).toHaveLength(10);
    expect(Object.values(permissions).every((value) => value)).toBe(true);
  });

  test('les clés sont exactement celles que le décodeur du port lit', () => {
    const { permissions } = adminIdentityFixture({ role: 'BIGBOSS' });
    expect(Object.keys(permissions).sort()).toEqual(Object.keys(decodeAdminPermissions({})).sort());
  });

  test('MODERATOR : entre, modère, PORTE canManageConversations — sans le reste', () => {
    const { permissions } = adminIdentityFixture({ role: 'MODERATOR' });
    expect(permissions.canAccessAdmin).toBe(true);
    expect(permissions.canModerateContent).toBe(true);
    expect(permissions.canManageConversations).toBe(true);
    expect(permissions.canManageUsers).toBe(false);
    expect(permissions.canManageAgent).toBe(false);
  });

  test('ADMIN n’a pas le journal d’audit ; AUDIT l’a', () => {
    expect(adminIdentityFixture({ role: 'ADMIN' }).permissions.canViewAuditLogs).toBe(false);
    expect(adminIdentityFixture({ role: 'AUDIT' }).permissions.canViewAuditLogs).toBe(true);
  });

  test('USER et un rôle inconnu n’ont rien', () => {
    expect(Object.values(adminIdentityFixture({ role: 'USER' }).permissions).some((value) => value)).toBe(false);
    expect(adminIdentityFixture({ role: 'VISITOR' }).permissions.canAccessAdmin).toBe(false);
  });

  test('`permissions` surcharge clé par clé', () => {
    const { permissions } = adminIdentityFixture({ role: 'BIGBOSS', permissions: { canManageAgent: false } });
    expect(permissions.canManageAgent).toBe(false);
    expect(permissions.canManageUsers).toBe(true);
  });
});
