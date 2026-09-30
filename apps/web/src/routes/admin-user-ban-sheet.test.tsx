import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { AdminDeps } from '@/lib/api/admin';
import type { HttpRequest } from '@/lib/api/http';
import { expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport, type RoutedReply } from '@/test-support/routed-transport';

import { AdminUserBanSheet } from './admin-user-ban-sheet';

/**
 * **L'HISTORIQUE DES BANNISSEMENTS, NOMMÉ** (#6819, #8876) — qui a banni, qui a levé (ou
 * « le système » quand l'échéance l'a fait), jusqu'à quand, pourquoi : un administrateur
 * se reconnaît à son nom, jamais à un identifiant. Seul un ban en vigueur offre « Lever ».
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const USER = '64f1c2a9e8b7d6c5b4a39281';
const ADMIN_ONE = { id: '64f1c2a9e8b7d6c5b4a39282', username: 'jcnm', displayName: 'Jean-Claude', avatar: null };
const ADMIN_TWO = { id: '64f1c2a9e8b7d6c5b4a39283', username: 'awa', displayName: '', avatar: null };

const BANS = [
  { id: 'b-active', reason: 'Spam répété', active: true, createdAt: '2026-09-29T12:00:00.000Z', expiresAt: null, liftedAt: null, liftReason: null, bannedBy: ADMIN_ONE, liftedBy: null, liftedBySystem: false },
  {
    id: 'b-lifted',
    reason: 'Insultes',
    active: false,
    createdAt: '2026-08-01T12:00:00.000Z',
    expiresAt: '2026-12-01T12:00:00.000Z',
    liftedAt: '2026-08-15T12:00:00.000Z',
    liftReason: 'Excuses présentées',
    bannedBy: ADMIN_ONE,
    liftedBy: ADMIN_TWO,
    liftedBySystem: false,
  },
  { id: 'b-system', reason: 'Fraude', active: false, createdAt: '2026-06-01T12:00:00.000Z', expiresAt: '2026-06-08T12:00:00.000Z', liftedAt: '2026-06-08T12:00:00.000Z', liftReason: null, bannedBy: null, liftedBy: null, liftedBySystem: true },
];

const bans: RoutedReply = (request: HttpRequest) => (request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}/bans` ? { ok: true, data: BANS } : undefined);

async function open() {
  const gateway = routedTransport(bans);
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  await mount(<AdminUserBanSheet userId={USER} language="fr" onClose={() => undefined} onAnnounce={() => undefined} deps={deps} />);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await mounter.settle();
  return document.body;
}

const row = (id: string) => document.querySelector(`[data-admin-ban="${id}"]`);
const textOf = (element: Element | null) => (element?.textContent ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

describe('l’historique des bannissements', () => {
  test('qui a banni se dit par son nom, l’échéance ou « permanent » aussi', async () => {
    await open();
    const active = textOf(row('b-active'));
    expect(active).toContain('Spam répété');
    expect(active).toContain('En vigueur');
    expect(active).toContain('Banni par Jean-Claude le');
    expect(active).toContain('Bannissement permanent');
    expect(textOf(row('b-lifted'))).toContain('Jusqu’au');
  });

  test('qui a levé se dit par son nom (le pseudo à défaut de nom affiché), avec le motif de la levée', async () => {
    await open();
    const lifted = textOf(row('b-lifted'));
    expect(lifted).toContain('Levé par @awa le');
    expect(lifted).toContain('motif de la levée : Excuses présentées');
    expect(lifted).toContain('Levé');
  });

  test('une levée sans administrateur est celle du SYSTÈME ; un ban expiré n’est pas un ban levé', async () => {
    await open();
    const system = textOf(row('b-system'));
    expect(system).toContain('Levé automatiquement par le système le');
    expect(system).toContain('Fraude');
    expect(system).not.toContain('Banni par');
  });

  test('seul un ban en vigueur offre « Lever »', async () => {
    await open();
    expect(row('b-active')?.querySelector('button')).not.toBeNull();
    expect(row('b-lifted')?.querySelector('button')).toBeNull();
    expect(row('b-system')?.querySelector('button')).toBeNull();
  });

  test('aucun identifiant ni ISO brut dans l’historique', async () => {
    await open();
    expectNoRawIdentifiers(document.body);
  });
});
