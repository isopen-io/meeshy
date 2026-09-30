import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { resultatServi } from '@/test-support/served-pagination';

import { adminPostsQueryKey, adminPostsStatsQueryKey, decodeAdminPostRow, decodeAdminPostsStats } from '@/lib/api/admin-posts';
import { appQueryClient } from '@/lib/api/query-client';
import { mountAdminAt } from '@/test-support/admin-router';

import AdminPostsScreen, { AdminPostsPanel } from './admin-posts';

/**
 * LES PUBLICATIONS (#8876) — la liste du lot « contenus » : bandeau de chiffres,
 * onglets de type, de vrais noms, une audience restreinte jamais lue, des
 * filtres et une pagination dans l'adresse, et chaque ligne ouvre sa fiche.
 */
const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const NOW = new Date('2026-09-30T12:00:00.000Z');
const awa = { id: ID(1), username: 'awa', displayName: 'Awa Diop', avatar: null };
const jean = { id: ID(2), username: 'jean', displayName: 'Jean Mbarga', avatar: null };

const post = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: ID(n),
  type: 'POST',
  visibility: 'PUBLIC',
  content: `Texte de la publication ${n}`,
  originalLanguage: 'fr',
  communityId: null,
  moodEmoji: null,
  isPinned: false,
  isEdited: false,
  deletedAt: null,
  expiresAt: null,
  likeCount: 12,
  commentCount: 3,
  repostCount: 0,
  viewCount: 240,
  bookmarkCount: 0,
  shareCount: 0,
  createdAt: '2026-09-30T09:00:00.000Z',
  updatedAt: '2026-09-30T09:00:00.000Z',
  author: awa,
  media: [],
  ...overrides,
});

const PAGE = [
  post(3, { isPinned: true }),
  post(4, { visibility: 'PRIVATE', content: 'Mon secret de famille', author: jean }),
  post(5, { type: 'STORY', content: null, media: [{ id: 'm1' }, { id: 'm2' }], expiresAt: '2026-09-29T20:00:00.000Z', createdAt: '2026-09-29T08:00:00.000Z' }),
  post(6, { type: 'STATUS', content: null, moodEmoji: '🎉', visibility: 'FRIENDS' }),
  post(7, { type: 'REEL', deletedAt: '2026-09-30T10:00:00.000Z', content: 'Un reel retiré' }),
];

const STATS = {
  total: 120,
  deleted: 8,
  byType: { POST: 70, STORY: 35, REEL: 10, STATUS: 5 },
  topAuthors: [
    { author: awa, postCount: 14 },
    { author: jean, postCount: 9 },
  ],
  trending: [{ id: ID(3), type: 'REEL', content: 'Un texte de tendance', likeCount: 50, commentCount: 9, repostCount: 2, viewCount: 900, createdAt: '2026-09-28T09:00:00.000Z', author: awa }],
};

type Reply = (req: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const served = (rows: readonly unknown[], total = rows.length) => resultatServi({ success: true, data: rows, pagination: { total, offset: 0, limit: 20, hasMore: false } });

const defaultReply: Reply = (req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : served(PAGE, 57));

function gatewayOf(reply: Reply) {
  const calls: HttpRequest[] = [];
  const transport: AdminDeps['transport'] = Object.assign(async () => ({ ok: false as const, status: 0, error: 'jamais appelé' }), {
    request: async <T,>(req: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(req);
      return (await reply(req)) as ApiResult<T>;
    },
  });
  return { deps: { source: 'gateway', transport } satisfies AdminDeps, calls };
}

async function ouvrir(reply: Reply = defaultReply, url = '/admin/posts', space: 'admin' | 'adm' = 'admin') {
  const { deps, calls } = gatewayOf(reply);
  const screen = async () => ({ default: () => <AdminPostsPanel language="fr" deps={deps} now={NOW} /> });
  const fiche = async () => ({ default: () => <p>fiche</p> });
  const { Router } = createRouter(
    space === 'admin'
      ? { adminPosts: { pattern: '/admin/posts', screen }, adminPost: { pattern: '/admin/posts/$post', screen: fiche } }
      : { admPosts: { pattern: '/adm/posts', screen }, admPost: { pattern: '/adm/posts/$post', screen: fiche } },
    () => <p>absent</p>,
  );
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-list]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls };
}

const click = async (element: Element | null) => {
  await act(async () => (element as HTMLElement | null)?.click());
  await mounter.settle();
};
const listCalls = (calls: readonly HttpRequest[]) => calls.filter((call) => !(call.path.split('?')[0] ?? '').endsWith('/stats'));
const statsCalls = (calls: readonly HttpRequest[]) => calls.filter((call) => (call.path.split('?')[0] ?? '').endsWith('/stats'));
const queryOf = (call: HttpRequest | undefined) => Object.fromEntries(new URL(`http://x${call?.path ?? ''}`).searchParams);
const row = (host: ParentNode, n: number) => host.querySelector(`[data-admin-row="${ID(n)}"]`);
const select = (host: ParentNode, id: string) => host.querySelector(`[data-admin-filter="${id}"]`) as HTMLSelectElement;
const choose = async (element: HTMLSelectElement, value: string) => {
  act(() => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await mounter.settle();
};

describe('AdminPostsPanel — la liste : de vrais noms, des métadonnées interprétées', () => {
  test('chaque publication a son auteur NOMMÉ (avec @pseudo), son extrait, son type et sa visibilité en mots', async () => {
    const { host } = await ouvrir();
    const first = row(host, 3)?.textContent ?? '';
    expect(first).toContain('Awa Diop');
    expect(first).toContain('@awa');
    expect(first).toContain('Texte de la publication 3');
    expect(first).toContain('Publication');
    expect(first).toContain('Publique');
    expect(first).toContain('Épinglée');
  });

  test('une audience restreinte ne se lit JAMAIS dans la liste', async () => {
    const { host } = await ouvrir();
    const restricted = row(host, 4)?.textContent ?? '';
    expect(restricted).toContain('Contenu à audience restreinte');
    expect(restricted).toContain('Jean Mbarga');
    expect(restricted).toContain('Moi seul');
    expect(host.textContent).not.toContain('secret de famille');
  });

  test('une story sans texte dit ses médias ; un statut sans texte montre son humeur', async () => {
    const { host } = await ouvrir();
    expect(row(host, 5)?.textContent).toContain('Story · 2 médias');
    expect(row(host, 6)?.textContent).toContain('🎉');
  });

  test('l’état se dit : publiée, expirée (une story qui a fini sa vie), retirée', async () => {
    const { host } = await ouvrir();
    expect(row(host, 3)?.textContent).toContain('Publiée');
    expect(row(host, 5)?.textContent).toContain('Expirée');
    expect(row(host, 7)?.textContent).toContain('Retirée');
  });

  test('les réactions, les commentaires et les vues sont formatés ; la date est relative', async () => {
    const { host } = await ouvrir();
    const cells = [...(row(host, 3)?.querySelectorAll('td') ?? [])].map((cell) => cell.textContent?.trim());
    expect(cells).toContain('12');
    expect(cells).toContain('3');
    expect(cells.some((cell) => /240/.test(cell ?? ''))).toBe(true);
    expect(row(host, 3)?.textContent).toContain('il y a 3 heures');
  });

  test('aucun identifiant, horodatage ni énumération brute n’est lisible', async () => {
    const { host } = await ouvrir();
    expectNoRawIdentifiers(host);
  });

  test('aucune colonne n’est triable : la passerelle n’en sert aucun tri', async () => {
    const { host } = await ouvrir();
    expect(host.querySelectorAll('[data-admin-sort]')).toHaveLength(0);
    expect(host.querySelectorAll('thead th[aria-sort]')).toHaveLength(0);
  });

  test('l’en-tête : titre, phrase d’aide, fil d’Ariane « Contenus › Publications »', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Publications');
    expect([...host.querySelectorAll('nav[aria-label] li')].map((item) => item.textContent?.trim())).toEqual(['Contenus', 'Publications']);
  });

  test('le compteur de résultats dit le total servi', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-toolbar-count]')?.textContent).toBe('Résultats : 57');
  });
});

describe('AdminPostsPanel — chaque ligne ouvre sa fiche', () => {
  test('l’auteur est le lien de 44 px vers la fiche de la PUBLICATION, dans l’espace courant', async () => {
    const { host } = await ouvrir();
    const link = row(host, 3)?.querySelector('a');
    expect(link?.getAttribute('href')).toBe(`/admin/posts/${ID(3)}`);
    expect((link as HTMLElement | null)?.style.minHeight).toBe('44px');
  });

  test('dans l’espace /adm, le lien reste dans /adm', async () => {
    const { host } = await ouvrir(defaultReply, '/adm/posts', 'adm');
    expect(row(host, 3)?.querySelector('a')?.getAttribute('href')).toBe(`/adm/posts/${ID(3)}`);
  });
});

describe('AdminPostsPanel — le bandeau de chiffres', () => {
  test('le total, les retirées et leur part de tout ce qui a été publié', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-stat="posts-total"]')?.textContent).toContain('120');
    const deleted = host.querySelector('[data-admin-stat="posts-deleted"]')?.textContent ?? '';
    expect(deleted).toContain('8');
    expect(deleted).toContain('6,3');
  });

  test('la répartition par type est NOMMÉE, avec une phrase de synthèse', async () => {
    const { host } = await ouvrir();
    const chart = host.querySelector('[data-admin-chart="posts-by-type"]');
    expect(chart?.textContent).toContain('Le plus fréquent : Publication, 70');
    expect(chart?.textContent).toContain('Story');
    expect(chart?.textContent).toContain('Reel');
    expect(chart?.textContent).toContain('Statut');
  });

  test('les auteurs les plus actifs sont des puces nommées, avec leur nombre de publications', async () => {
    const { host } = await ouvrir();
    const top = host.querySelector(`[data-admin-top-author="${ID(1)}"]`);
    expect(top?.textContent).toContain('Awa Diop');
    expect(top?.textContent).toContain('@awa · Publications : 14');
    expect(top?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${ID(1)}`);
  });

  test('les tendances sont des puces de publication, avec leur engagement — jamais leur texte', async () => {
    const { host } = await ouvrir();
    const trend = host.querySelector(`[data-admin-trending="${ID(3)}"]`);
    expect(trend?.textContent).toContain('Reel de Awa Diop');
    expect(trend?.textContent).toContain('J’aime : 50 · Commentaires : 9');
    expect(trend?.querySelector('a')?.getAttribute('href')).toBe(`/admin/posts/${ID(3)}`);
    expect(host.textContent).not.toContain('Un texte de tendance');
  });

  test('« Retirées » est un lien vers la liste filtrée sur les retirées', async () => {
    const { host } = await ouvrir();
    expect(host.querySelector('[data-admin-stat="posts-deleted"] a')?.getAttribute('href')).toBe('/admin/posts?isDeleted=true');
  });

  test('sans période, les chiffres partent sans `period` ; avec, la période suit le filtre de la liste', async () => {
    const { calls } = await ouvrir();
    expect(statsCalls(calls)[0]?.path).toBe('/api/v1/admin/posts/stats');
    mounter.unmountAll();
    const week = await ouvrir(defaultReply, '/admin/posts?period=week');
    expect(statsCalls(week.calls)[0]?.path).toBe('/api/v1/admin/posts/stats?period=week');
    expect(week.host.querySelector('[data-admin-posts-stats] h2')?.textContent).toContain('7 derniers jours');
    expect(week.host.querySelector('[data-admin-stat="posts-deleted"] a')?.getAttribute('href')).toBe('/admin/posts?isDeleted=true&period=week');
  });

  test('l’échec des chiffres ne bloque pas la liste : erreur + « Réessayer » dans le bandeau seulement', async () => {
    const { host } = await ouvrir((req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? { ok: false, status: 500, error: 'boom' } : served(PAGE, 57)));
    expect(host.querySelector('[data-admin-posts-stats] [data-admin-error]')).not.toBeNull();
    expect(row(host, 3)).not.toBeNull();
  });

  test('sans publication sur la période : « Rien à signaler » plutôt que des blocs vides', async () => {
    const { host } = await ouvrir((req) =>
      (req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: { total: 0, deleted: 0, byType: {}, topAuthors: [], trending: [] } }) : served(PAGE, 57),
    );
    expect(host.querySelector('[data-admin-fiche-section="posts-authors"]')?.textContent).toContain('Rien à signaler');
    expect(host.querySelector('[data-admin-fiche-section="posts-trending"]')?.textContent).toContain('Rien à signaler');
  });
});

describe('AdminPostsPanel — onglets de type, filtres, recherche, pagination dans l’adresse', () => {
  test('les onglets : Toutes, Publications, Stories, Reels, Statuts ; « Toutes » est actif par défaut', async () => {
    const { host } = await ouvrir();
    const labels = [...host.querySelectorAll('[data-admin-tabs] [role="tab"]')].map((tab) => tab.textContent?.trim());
    expect(labels).toEqual(['Toutes', 'Publications', 'Stories', 'Reels', 'Statuts']);
    expect(host.querySelector('[data-admin-tab="all"]')?.getAttribute('aria-selected')).toBe('true');
  });

  test('un onglet pose le filtre de type dans l’adresse et à la passerelle ; « Toutes » le retire', async () => {
    const { host, calls } = await ouvrir();
    await click(host.querySelector('[data-admin-tab="STORY"]'));
    expect(window.location.search).toBe('?type=STORY');
    expect(queryOf(listCalls(calls).at(-1))).toMatchObject({ type: 'STORY' });
    expect(host.querySelector('[data-admin-tab="STORY"]')?.getAttribute('aria-selected')).toBe('true');
    await click(host.querySelector('[data-admin-tab="all"]'));
    expect(window.location.search).toBe('');
  });

  test('l’onglet actif se lit de l’adresse', async () => {
    const { host } = await ouvrir(defaultReply, '/admin/posts?type=REEL');
    expect(host.querySelector('[data-admin-tab="REEL"]')?.getAttribute('aria-selected')).toBe('true');
  });

  test('sans filtre : la première page, rien d’autre que la page et sa taille', async () => {
    const { calls } = await ouvrir();
    expect(queryOf(listCalls(calls)[0])).toEqual({ offset: '0', limit: '20' });
  });

  test('l’état de l’adresse part à la passerelle, auteur compris', async () => {
    const { calls } = await ouvrir(defaultReply, `/admin/posts?type=STORY&visibility=FRIENDS&isDeleted=true&isPinned=true&period=month&authorId=${ID(1)}&q=fête`);
    expect(queryOf(listCalls(calls)[0])).toEqual({
      offset: '0',
      limit: '20',
      search: 'fête',
      type: 'STORY',
      visibility: 'FRIENDS',
      isDeleted: 'true',
      isPinned: 'true',
      period: 'month',
      authorId: ID(1),
    });
  });

  test('le filtre de visibilité nomme les six audiences', async () => {
    const { host } = await ouvrir();
    expect([...select(host, 'visibility').options].map((option) => option.textContent)).toEqual(['Tous', 'Publique', 'Amis', 'Communauté', 'Moi seul', 'Amis sauf certains', 'Certains amis']);
  });

  test('le filtre de retrait : « Non retirées » par défaut, « Retirées » sur demande', async () => {
    const { host, calls } = await ouvrir();
    expect([...select(host, 'isDeleted').options].map((option) => option.textContent)).toEqual(['Non retirées', 'Retirées']);
    await choose(select(host, 'isDeleted'), 'true');
    expect(window.location.search).toBe('?isDeleted=true');
    expect(queryOf(listCalls(calls).at(-1))).toMatchObject({ isDeleted: 'true' });
  });

  test('le filtre d’épinglage et celui de période se nomment en mots', async () => {
    const { host } = await ouvrir();
    expect([...select(host, 'isPinned').options].map((option) => option.textContent)).toEqual(['Tous', 'Épinglées', 'Non épinglées']);
    expect([...select(host, 'period').options].map((option) => option.textContent)).toEqual(['Depuis le début', 'Aujourd’hui', '7 derniers jours', '30 derniers jours']);
  });

  test('choisir une période réécrit l’adresse, relit la liste ET le bandeau', async () => {
    const { host, calls } = await ouvrir();
    await choose(select(host, 'period'), 'week');
    expect(window.location.search).toBe('?period=week');
    expect(queryOf(listCalls(calls).at(-1))).toMatchObject({ period: 'week' });
    expect(statsCalls(calls).at(-1)?.path).toBe('/api/v1/admin/posts/stats?period=week');
  });

  test('la recherche s’écrit dans l’adresse après une courte pause et part à la passerelle', async () => {
    const { host, calls } = await ouvrir();
    mounter.type(host, '[data-admin-search]', 'jazz');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await mounter.settle();
    expect(window.location.search).toBe('?q=jazz');
    expect(queryOf(listCalls(calls).at(-1))).toMatchObject({ search: 'jazz' });
  });

  test('« Suivants » avance l’offset dans l’adresse et à la passerelle (resultatServi)', async () => {
    const { host, calls } = await ouvrir((req) =>
      (req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : resultatServi({ data: PAGE, pagination: { total: 57, offset: 0, limit: 20, hasMore: true } }),
    );
    await click(host.querySelector('[data-admin-list-next]'));
    expect(window.location.search).toBe('?offset=20');
    expect(queryOf(listCalls(calls).at(-1))).toMatchObject({ offset: '20' });
  });

  test('un filtre par auteur : l’écran le dit par le NOM de l’auteur et propose de le retirer', async () => {
    const { host } = await ouvrir(defaultReply, `/admin/posts?authorId=${ID(1)}`);
    const notice = host.querySelector('[data-admin-notice="info"]');
    expect(notice?.textContent).toContain('Publications de Awa Diop');
    await click(host.querySelector('[data-admin-author-clear]'));
    expect(window.location.search).toBe('');
    expect(host.querySelector('[data-admin-notice="info"]')).toBeNull();
  });

  test('un auteur sans ligne visible est dit sans être nommé de travers', async () => {
    const { host } = await ouvrir((req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : served([])), `/admin/posts?authorId=${ID(9)}`);
    expect(host.querySelector('[data-admin-notice="info"]')?.textContent).toContain('Publications d’un seul auteur');
  });
});

describe('AdminPostsPanel — les états dessinés', () => {
  test('squelette tant que rien n’est arrivé', async () => {
    const { host } = await ouvrir((req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : new Promise(() => undefined)));
    expect(host.querySelector('[data-admin-list-skeleton]')).not.toBeNull();
  });

  test('erreur : « Réessayer » relit et la liste apparaît', async () => {
    let calls = 0;
    const { host } = await ouvrir((req) => {
      if ((req.path.split('?')[0] ?? '').endsWith('/stats')) return resultatServi({ success: true, data: STATS });
      return ++calls === 1 ? { ok: false, status: 500, error: 'boom' } : served(PAGE, 57);
    });
    expect(host.querySelector('[data-admin-list] [data-admin-error]')).not.toBeNull();
    await click(host.querySelector('[data-admin-list] [data-admin-retry]'));
    expect(row(host, 3)).not.toBeNull();
  });

  test('un refus 403 se dit comme un refus, pas comme une panne', async () => {
    const { host } = await ouvrir((req) =>
      (req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : { ok: false, status: 403, error: 'Permission insuffisante' },
    );
    expect(host.querySelector('[data-admin-list] [data-admin-denied-inline]')).not.toBeNull();
  });

  test('vide absolu : un titre et une indication', async () => {
    const { host } = await ouvrir((req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : served([])));
    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucune publication');
    expect(host.querySelector('[data-admin-list] [data-admin-list-reset]')).toBeNull();
  });

  test('vide FILTRÉ : « Aucune publication pour ces filtres » et « Réinitialiser » vide l’adresse', async () => {
    const { host } = await ouvrir((req) => ((req.path.split('?')[0] ?? '').endsWith('/stats') ? resultatServi({ success: true, data: STATS }) : served([])), '/admin/posts?visibility=PRIVATE');
    expect(host.querySelector('[data-admin-list] [data-admin-empty]')?.textContent).toContain('Aucune publication pour ces filtres');
    await click(host.querySelector('[data-admin-list] [data-admin-empty] [data-admin-list-reset]'));
    expect(window.location.search).toBe('');
  });

  test('l’écran est fermé à qui n’a pas la capacité de modérer', async () => {
    const { Router } = createRouter({ adminPosts: { pattern: '/admin/posts', screen: async () => ({ default: AdminPostsScreen }) } }, () => <p>absent</p>);
    navigate('/admin/posts', true);
    const host = await mount(<Router wrap={(children) => children} skeleton={null} />, adminIdentityFixture({ role: 'ANALYST' }));
    for (let attempt = 0; attempt < 30 && !(host.textContent ?? '').includes('Espace réservé'); attempt += 1) await mounter.settle();
    expect(host.textContent).toContain('Espace réservé');
    expect(host.querySelector('[data-admin-screen="posts"]')).toBeNull();
  });
});

describe('AdminPostsScreen — servi par la table des routes, dans les deux espaces', () => {
  const seed = () => {
    appQueryClient.setQueryData(adminPostsQueryKey(''), { rows: [decodeAdminPostRow(PAGE[0])], total: 1, hasMore: false });
    appQueryClient.setQueryData(adminPostsStatsQueryKey(undefined), decodeAdminPostsStats(STATS));
  };

  test('/admin/posts rend la VRAIE liste (pas l’écran d’attente), surlignée au menu, et sa ligne ouvre la fiche', async () => {
    seed();
    const host = await mountAdminAt(mounter, '/admin/posts', BIGBOSS, '[data-admin-screen="posts"]');
    expect(host.querySelector('[data-admin-stub]') === null).toBe(true);
    expect(host.querySelector('[data-admin-nav="posts"]')?.getAttribute('aria-current')).toBe('page');
    expect(row(host, 3)?.querySelector('a')?.getAttribute('href')).toBe(`/admin/posts/${ID(3)}`);
  });

  test('/adm/posts rend la même liste, et ses liens — bandeau compris — restent dans /adm', async () => {
    seed();
    const host = await mountAdminAt(mounter, '/adm/posts', BIGBOSS, '[data-admin-screen="posts"]');
    expect(row(host, 3)?.querySelector('a')?.getAttribute('href')).toBe(`/adm/posts/${ID(3)}`);
    expect(host.querySelector('[data-admin-stat="posts-deleted"] a')?.getAttribute('href')).toBe('/adm/posts?isDeleted=true');
  });
});
