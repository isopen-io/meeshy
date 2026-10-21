import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { AdminPostsPanel } from './admin-posts';

/**
 * **DEPUIS LA LISTE DES PUBLICATIONS, UN GESTE** (#10392) — hors ligne, remise en ligne
 * et audience, sans ouvrir la fiche : un appui, une confirmation, l'effet immédiat sur
 * la ligne, défait si la passerelle refuse.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ADMIN = adminIdentityFixture({ role: 'ADMIN' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-10-12T12:00:00.000Z');
const awa = { id: ID(9), username: 'awa', displayName: 'Awa Diop', avatar: null };

const post = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  type: 'POST',
  visibility: 'PUBLIC',
  content: `Texte ${n}`,
  deletedAt: null,
  expiresAt: null,
  moderationHiddenAt: null,
  moderationPriorVisibility: null,
  likeCount: 2,
  commentCount: 0,
  viewCount: 0,
  createdAt: '2026-10-12T09:00:00.000Z',
  author: awa,
  media: [],
  ...overrides,
});

const PAGE = [post(1), post(2, { visibility: 'PRIVATE', moderationHiddenAt: '2026-10-11T00:00:00.000Z', moderationPriorVisibility: 'FRIENDS' }), post(3, { deletedAt: '2026-10-11T00:00:00.000Z' })];

type Reply = (req: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const view = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  state: 'offline',
  visibility: 'PRIVATE',
  moderationHiddenAt: NOW.toISOString(),
  moderationPriorVisibility: 'PUBLIC',
  updatedAt: NOW.toISOString(),
  ...overrides,
});

const listOrStats = (req: HttpRequest, rows: readonly unknown[]): ApiResult<unknown> =>
  (req.path.split('?')[0] ?? '').endsWith('/stats')
    ? resultatServi({ success: true, data: { total: 3, deleted: 1, byType: {}, topAuthors: [], trending: [] } })
    : resultatServi({ success: true, data: rows, pagination: { total: 3, offset: 0, limit: 20, hasMore: false } });

/** Le serveur factice APPLIQUE ce qu'il répond : la relecture qui suit le geste sert la ligne changée. */
const served = (rows: readonly Record<string, unknown>[], answer: ApiResult<unknown>): readonly Record<string, unknown>[] => {
  if (!answer.ok) return rows;
  const changed = answer.data as Record<string, unknown>;
  return rows.map((row) => (row.id === changed.id ? { ...row, visibility: changed.visibility, moderationHiddenAt: changed.moderationHiddenAt, moderationPriorVisibility: changed.moderationPriorVisibility } : row));
};

async function ouvrir(gesture: Reply, identity = BIGBOSS, url = '/admin/posts') {
  const calls: HttpRequest[] = [];
  let rows: readonly Record<string, unknown>[] = PAGE;
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      if (req.method !== 'POST') return listOrStats(req, rows) as ApiResult<T>;
      const answer = await gesture(req);
      rows = served(rows, answer);
      return answer as ApiResult<T>;
    },
  });
  const deps = { source: 'gateway', transport } satisfies AdminDeps;
  const screen = async () => ({ default: () => <AdminPostsPanel language="fr" deps={deps} now={NOW} /> });
  const { Router } = createRouter({ adminPosts: { pattern: '/admin/posts', screen }, adminPost: { pattern: '/admin/posts/$post', screen } }, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, identity);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-list]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};
const gestures = (host: ParentNode, n: number) => host.querySelector(`[data-admin-post-gestures="${ID(n)}"]`);
const stateText = (host: ParentNode, n: number) => host.querySelector(`[data-admin-row="${ID(n)}"]`)?.textContent ?? '';
const confirmer = () => document.querySelector<HTMLButtonElement>('[data-admin-action="confirm"]');
const posts = (calls: readonly HttpRequest[]) => calls.filter((call) => call.method === 'POST');

describe('les gestes d’une publication, depuis la liste', () => {
  test('une publiée offre « Mettre hors ligne » et l’audience ; une hors ligne, « Remettre en ligne » ; une supprimée, rien', async () => {
    const { host } = await ouvrir(() => ({ ok: true, data: view(1) }));
    expect(gestures(host, 1)?.querySelector('[data-admin-post-gesture="take-offline"]')).not.toBeNull();
    expect(gestures(host, 1)?.querySelector('select[data-admin-post-gesture="set-visibility"]')).not.toBeNull();
    expect(gestures(host, 2)?.querySelector('[data-admin-post-gesture="restore"]')).not.toBeNull();
    expect(gestures(host, 2)?.querySelector('[data-admin-post-gesture="take-offline"]')).toBeNull();
    expect(gestures(host, 3)).toBeNull();
    expect(stateText(host, 2)).toContain('Hors ligne');
  });

  test('mettre hors ligne en deux gestes (rang souverain) : la ligne le dit tout de suite, la passerelle reçoit le geste', async () => {
    let release: (value: ApiResult<unknown>) => void = () => undefined;
    const answer = new Promise<ApiResult<unknown>>((resolve) => {
      release = resolve;
    });
    const { host, calls } = await ouvrir(() => answer);

    await click(gestures(host, 1)?.querySelector('[data-admin-post-gesture="take-offline"]') ?? null);
    expect(document.querySelector('[data-admin-motive]')).toBeNull();
    const confirm = confirmer();
    await act(async () => confirm?.click());
    await mounter.settle();

    expect(stateText(host, 1)).toContain('Hors ligne');
    expect(posts(calls)[0]?.path).toBe(`/api/v1/admin/posts/${ID(1)}/gestures`);
    expect(posts(calls)[0]?.body).toEqual({ gesture: 'take-offline' });
    await act(async () => release({ ok: true, data: view(1) }));
    await mounter.settle();
  });

  test('un refus défait l’effet : la ligne redevient « Publiée »', async () => {
    const { host } = await ouvrir(() => ({ ok: false, status: 403, error: 'nope', code: 'FORBIDDEN' }));
    await click(gestures(host, 1)?.querySelector('[data-admin-post-gesture="take-offline"]') ?? null);
    await click(confirmer());
    await mounter.settle();
    expect(stateText(host, 1)).toContain('Publiée');
    expect(document.querySelector('[data-admin-confirm-error]')?.textContent).not.toBe('');
  });

  test('hors du rang souverain, le motif est demandé et part avec le geste', async () => {
    const { host, calls } = await ouvrir(() => ({ ok: true, data: view(2, { state: 'published', visibility: 'FRIENDS', moderationHiddenAt: null, moderationPriorVisibility: null }) }), ADMIN);
    await click(gestures(host, 2)?.querySelector('[data-admin-post-gesture="restore"]') ?? null);
    /* L’ADMIN trouve le motif proposé déjà écrit (#10562) : la confirmation est offerte d’emblée. */
    expect(confirmer()?.disabled).toBe(false);
    mounter.type(document, '[data-admin-motive]', 'Erreur de modération');
    await click(confirmer());
    expect(posts(calls)[0]?.body).toEqual({ gesture: 'restore', reason: 'Erreur de modération' });
    expect(stateText(host, 2)).toContain('Publiée');
  });

  test('changer l’audience : choisir « Amis » sur une hors ligne réservée aux amis, confirmer, la remet en ligne pour ses amis', async () => {
    const { host, calls } = await ouvrir(() => ({ ok: true, data: view(2, { state: 'published', visibility: 'FRIENDS', moderationHiddenAt: null, moderationPriorVisibility: null }) }));
    const select = gestures(host, 2)?.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = 'FRIENDS';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.settle();
    await click(confirmer());
    expect(posts(calls)[0]?.body).toEqual({ gesture: 'set-visibility', visibility: 'FRIENDS' });
    expect(stateText(host, 2)).toContain('Publiée');
  });

  test('le sélecteur ne propose que les audiences que la passerelle accepte : jamais plus large que l’auteur (#10471)', async () => {
    const { host } = await ouvrir(() => ({ ok: true, data: view(1) }));
    const values = (n: number) => [...((gestures(host, n)?.querySelector('select') as HTMLSelectElement | null)?.options ?? [])].map((option) => option.value).filter((value) => value !== '');
    expect(values(1)).toEqual(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE']);
    expect(values(2)).toEqual(['FRIENDS', 'PRIVATE']);
  });

  test('un refus AUDIENCE_WIDENING se dit en mots : l’audience de l’auteur, pas « pas le droit » (#10471)', async () => {
    const { host } = await ouvrir(() => ({ ok: false, status: 403, error: 'refusé', code: 'AUDIENCE_WIDENING' }));
    const select = gestures(host, 1)?.querySelector('select') as HTMLSelectElement;
    act(() => {
      select.value = 'FRIENDS';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.settle();
    await click(confirmer());
    await mounter.settle();
    const error = document.querySelector('[data-admin-confirm-error]')?.textContent ?? '';
    expect(error).toContain('auteur');
    expect(error).not.toContain('pas le droit');
  });

  test('le filtre d’état part à la passerelle', async () => {
    const { host, calls } = await ouvrir(() => ({ ok: true, data: view(1) }));
    const filter = host.querySelector('[data-admin-filter="state"]') as HTMLSelectElement;
    expect([...filter.options].map((option) => option.textContent)).toEqual(['Tous', 'Publiée', 'Hors ligne', 'Privée', 'Expirée', 'Retirée']);
    act(() => {
      filter.value = 'offline';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await mounter.settle();
    const last = calls.filter((call) => call.method === 'GET' && !(call.path.split('?')[0] ?? '').endsWith('/stats')).at(-1);
    expect(new URL(`http://x${last?.path ?? ''}`).searchParams.get('state')).toBe('offline');
  });
});
