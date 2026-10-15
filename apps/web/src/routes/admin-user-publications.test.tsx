import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { AdminUserPublicationsSection } from './admin-user-publications';

/**
 * **DEPUIS LA FICHE D'UN MEMBRE, VOIR SES PUBLICATIONS ET EN RETIRER PLUSIEURS EN UN GESTE**
 * (#10315) — le porteur a dû passer par la base de production faute d'outil.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });

const USER = '64f1c2a9e8b7d6c5b4a39281';
const NOW = () => new Date('2026-10-12T10:00:00.000Z');
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  type: 'POST',
  visibility: 'PUBLIC',
  state: 'online',
  contentPreview: `Texte ${id}`,
  createdAt: '2026-10-10T10:00:00.000Z',
  expiresAt: null,
  deletedAt: null,
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  mediaCount: 0,
  thumbnail: null,
  ...over,
});

const ROWS = [
  row('p-1', { type: 'REEL', mediaCount: 1, thumbnail: { url: '/uploads/t.jpg', mimeType: 'video/mp4' } }),
  row('p-2', { type: 'STORY', visibility: 'FRIENDS' }),
  row('p-3', { state: 'deleted', deletedAt: '2026-10-11T00:00:00.000Z' }),
];

function gatewayOf(moderation: () => ApiResult<unknown> = () => ({ ok: true, data: { updated: 2, unchanged: 0, skipped: 0 } })) {
  const list = (request: HttpRequest) =>
    request.method === 'GET' && pathOf(request) === `/api/v1/admin/users/${USER}/publications`
      ? ({ ok: true, data: ROWS, pagination: { total: ROWS.length, offset: 0, limit: 24, hasMore: false } } as ApiResult<unknown>)
      : undefined;
  const moderate = (request: HttpRequest) =>
    request.method === 'POST' && pathOf(request) === `/api/v1/admin/users/${USER}/publications/moderation` ? moderation() : undefined;
  const gateway = routedTransport(list, moderate);
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  return { gateway, deps };
}

async function open(identity = ADMIN, moderation?: () => ApiResult<unknown>) {
  const { gateway, deps } = gatewayOf(moderation);
  const host = await mount(<AdminUserPublicationsSection userId={USER} language="fr" onAnnounce={() => undefined} deps={deps} now={NOW} />, identity);
  await mounter.settle();
  await mounter.settle();
  return { host, gateway };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};
const posts = (gateway: ReturnType<typeof gatewayOf>['gateway']) => gateway.calls().filter((call) => call.method === 'POST');
const stateOf = (host: ParentNode, id: string) => host.querySelector(`[data-admin-publication="${id}"] [data-admin-publication-state]`)?.getAttribute('data-admin-publication-state');
const confirmer = () => document.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]');

describe('les publications d’un membre', () => {
  test('chaque publication dit son texte, son type, sa date, son audience et son état ; une vignette quand elle en a une', async () => {
    const { host } = await open();
    const first = host.querySelector('[data-admin-publication="p-1"]');
    expect(first?.textContent).toContain('Texte p-1');
    expect(first?.textContent).toContain('En ligne');
    expect(first?.querySelector('img')?.getAttribute('src')).toContain('/uploads/t.jpg');
    expect(stateOf(host, 'p-3')).toBe('deleted');
  });

  test('une publication supprimée n’offre aucune case : aucun geste ne la ressuscite', async () => {
    const { host } = await open();
    expect(host.querySelector('[data-admin-publication="p-3"] [data-admin-publication-select]')).toBeNull();
    expect(host.querySelector('[data-admin-publication="p-1"] [data-admin-publication-select]')).not.toBeNull();
  });

  test('les gestes restent éteints tant que rien n’est choisi', async () => {
    const { host } = await open();
    expect(host.querySelector<HTMLButtonElement>('[data-admin-action="take-offline"]')?.disabled).toBe(true);
    await click(host.querySelector('[data-admin-publication="p-2"] [data-admin-publication-select]'));
    expect(host.querySelector<HTMLButtonElement>('[data-admin-action="take-offline"]')?.disabled).toBe(false);
  });

  test('« Tout sélectionner » prend chaque publication encore modérable de la page', async () => {
    const { host } = await open();
    await click(host.querySelector('[data-admin-publications-all]'));
    expect(host.querySelector('[data-admin-publications-count]')?.textContent).toContain('2');
  });

  test('mettre hors ligne : la feuille dit l’effet, exige un motif et envoie la sélection avec lui', async () => {
    const { host, gateway } = await open();
    await click(host.querySelector('[data-admin-publications-all]'));
    await click(host.querySelector('[data-admin-action="take-offline"]'));
    expect(document.querySelector('[data-admin-confirm]')?.textContent).toContain('sauf leur auteur et l’administration');
    /* L’ADMIN trouve le motif proposé déjà écrit (#10562) : la confirmation est offerte d’emblée. */
    expect(confirmer()?.disabled).toBe(false);
    mounter.type(document, '[data-admin-motive]', 'Contenu signalé');
    await click(confirmer());
    await mounter.settle();

    expect(posts(gateway)[0]).toMatchObject({ body: { action: 'take-offline', postIds: ['p-1', 'p-2'], reason: 'Contenu signalé' } });
    expect(document.querySelector('dialog')).toBeNull();
  });

  test('l’effet est immédiat, avant la réponse de la passerelle', async () => {
    let release: () => void = () => undefined;
    const pendingReply = () =>
      new Promise<ApiResult<unknown>>((resolve) => {
        release = () => resolve({ ok: true, data: { updated: 1, unchanged: 0, skipped: 0 } });
      }) as unknown as ApiResult<unknown>;
    const { host } = await open(ADMIN, pendingReply);
    await click(host.querySelector('[data-admin-publication="p-2"] [data-admin-publication-select]'));
    await click(host.querySelector('[data-admin-action="take-offline"]'));
    mounter.type(document, '[data-admin-motive]', 'Contenu signalé');
    await click(confirmer());
    expect(stateOf(host, 'p-2')).toBe('offline');
    expect(stateOf(host, 'p-1')).toBe('online');
    release();
    await mounter.settle();
  });

  test('un refus défait l’effet immédiat et le dit, la feuille restant ouverte', async () => {
    const { host } = await open(ADMIN, () => ({ ok: false, status: 403, error: 'Hiérarchie insuffisante' }));
    await click(host.querySelector('[data-admin-publication="p-2"] [data-admin-publication-select]'));
    await click(host.querySelector('[data-admin-action="make-private"]'));
    mounter.type(document, '[data-admin-motive]', 'Contenu signalé');
    await click(confirmer());
    await mounter.settle();
    expect(stateOf(host, 'p-2')).toBe('online');
    expect(document.querySelector('[data-admin-confirm-error]')?.textContent).not.toBe('');
  });

  test('le rang souverain agit sans motif', async () => {
    const { host, gateway } = await open(BIGBOSS);
    await click(host.querySelector('[data-admin-publication="p-1"] [data-admin-publication-select]'));
    await click(host.querySelector('[data-admin-action="restore"]'));
    expect(document.querySelector('[data-admin-motive]')).toBeNull();
    await click(confirmer());
    await mounter.settle();
    expect(posts(gateway)[0]?.body).toEqual({ action: 'restore', postIds: ['p-1'] });
  });

  test('ce que le geste a laissé tel quel se dit — un retrait posé plus haut ne se lève pas en silence', async () => {
    const announced: string[] = [];
    const { deps } = gatewayOf(() => ({ ok: true, data: { updated: 0, unchanged: 0, skipped: 1 } }));
    const host = await mount(<AdminUserPublicationsSection userId={USER} language="fr" onAnnounce={(message) => announced.push(message)} deps={deps} now={NOW} />, ADMIN);
    await mounter.settle();
    await mounter.settle();
    await click(host.querySelector('[data-admin-publication="p-1"] [data-admin-publication-select]'));
    await click(host.querySelector('[data-admin-action="restore"]'));
    mounter.type(document, '[data-admin-motive]', 'Erreur de modération');
    await click(confirmer());
    await mounter.settle();
    expect(announced.some((message) => message.includes('laissées telles quelles : 1'))).toBe(true);
  });
});

