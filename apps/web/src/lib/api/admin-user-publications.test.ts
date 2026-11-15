import { describe, expect, test } from 'bun:test';

import { pageServie } from './admin';
import { decodeAdminPublicationPage, loadAdminUserPublications, moderateAdminUserPublications } from './admin-user-publications';
import type { HttpRequest, HttpTransport } from './http';
import { resultatServi } from '@/test-support/served-pagination';

/**
 * LES PUBLICATIONS D'UN MEMBRE (#10315) — la liste se lit sous la pagination servie À CÔTÉ
 * de `data`, et un geste part avec son action, sa sélection et son motif.
 */
const USER = '64f1c2a9e8b7d6c5b4a39281';

const spy = (reply: unknown) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async (request: HttpRequest) => {
      calls.push(request);
      return { ok: true as const, data: reply };
    },
  } as unknown as HttpTransport;
  return { transport, calls };
};

const ROW = {
  id: 'p-1',
  type: 'REEL',
  visibility: 'PRIVATE',
  state: 'offline',
  contentPreview: 'Bonjour',
  createdAt: '2026-10-10T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
  moderationHiddenAt: '2026-10-11T10:00:00.000Z',
  moderationPriorVisibility: 'PUBLIC',
  mediaCount: 2,
  thumbnail: { url: '/f/v.jpg', mimeType: 'video/mp4' },
};

describe('décoder une page de publications', () => {
  test('lit chaque publication et la pagination servie à côté de data', () => {
    const page = decodeAdminPublicationPage(pageServie(resultatServi({ success: true, data: [ROW], pagination: { total: 30, limit: 24, offset: 0, hasMore: true } })), 0);
    expect(page.total).toBe(30);
    expect(page.hasMore).toBe(true);
    expect(page.publications).toEqual([
      {
        id: 'p-1',
        type: 'REEL',
        visibility: 'PRIVATE',
        state: 'offline',
        contentPreview: 'Bonjour',
        createdAt: '2026-10-10T10:00:00.000Z',
        expiresAt: null,
        moderationHiddenAt: '2026-10-11T10:00:00.000Z',
        priorVisibility: 'PUBLIC',
        mediaCount: 2,
        thumbnail: { url: '/f/v.jpg', mimeType: 'video/mp4' },
      },
    ]);
  });

  test('un état inconnu ne se dit jamais « en ligne » : il se lit « supprimée », sans geste offert', () => {
    const page = decodeAdminPublicationPage({ lignes: [{ ...ROW, state: 'weird' }], meta: {} }, 0);
    expect(page.publications[0]?.state).toBe('deleted');
  });

  test("écarte une ligne sans identifiant ou d'un type inconnu", () => {
    const page = decodeAdminPublicationPage({ lignes: [{ ...ROW, id: '' }, { ...ROW, type: 'MOOD' }], meta: {} }, 0);
    expect(page.publications).toEqual([]);
  });
});

describe('les appels', () => {
  test('la liste vise la fiche du membre, paginée', async () => {
    const { transport, calls } = spy([]);
    await loadAdminUserPublications({ source: 'gateway', transport, userId: USER, offset: 24 });
    expect(calls[0]?.method).toBe('GET');
    expect(calls[0]?.path).toBe(`/api/v1/admin/users/${USER}/publications?offset=24&limit=24`);
  });

  test('un geste porte son action, sa sélection et son motif', async () => {
    const { transport, calls } = spy({ updated: 2, unchanged: 1, skipped: 0 });
    const result = await moderateAdminUserPublications({ source: 'gateway', transport, userId: USER, gesture: 'take-offline', postIds: ['p-1', 'p-2', 'p-3'], reason: 'Contenu signalé' });
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: `/api/v1/admin/users/${USER}/publications/moderation`,
      body: { action: 'take-offline', postIds: ['p-1', 'p-2', 'p-3'], reason: 'Contenu signalé' },
    });
    expect(result).toEqual({ ok: true, data: { updated: 2, unchanged: 1, skipped: 0 } });
  });

  test('sans motif (rang souverain), la clé `reason` ne part pas', async () => {
    const { transport, calls } = spy({ updated: 1, unchanged: 0, skipped: 0 });
    await moderateAdminUserPublications({ source: 'gateway', transport, userId: USER, gesture: 'restore', postIds: ['p-1'], reason: null });
    expect(calls[0]?.body).toEqual({ action: 'restore', postIds: ['p-1'] });
  });
});
