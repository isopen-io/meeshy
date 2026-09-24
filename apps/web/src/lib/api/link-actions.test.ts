import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { createHttpTransport } from './http';
import { performCreateShareLink, performDeleteShareLink, performSetShareLinkActive, performUpdateShareLink, type LinkActionDeps } from './link-actions';
import { defaultShareLinkDraft, SHARE_LINKS_QUERY_KEY, type MyShareLink, type ShareLinksData } from './links';

/**
 * LES GESTES SUR SES LIENS (#6361) — CLAUDE.md § Optimistic Updates : le cache
 * que la liste, le détail et le résumé lisent change AU GESTE, et revient à
 * l'instantané si la passerelle refuse. Hors ligne, rien ne part et rien ne
 * change : le web n'a pas de file d'écriture (#6325).
 */

const link = (overrides: Partial<MyShareLink> = {}): MyShareLink => ({
  id: 'l1',
  linkId: 'mshy_l1',
  identifier: null,
  name: 'Invitation',
  isActive: true,
  currentUses: 3,
  maxUses: null,
  expiresAt: null,
  createdAt: '2026-09-10T09:00:00.000Z',
  conversationTitle: 'Équipe',
  inactiveReason: null,
  description: null,
  policy: {
    maxConcurrentUsers: null,
    requireAccount: false,
    requireNickname: true,
    requireEmail: false,
    requireBirthday: false,
    allowAnonymousMessages: true,
    allowAnonymousImages: true,
    allowAnonymousFiles: false,
    allowViewHistory: false,
    allowedLanguages: [],
  },
  ...overrides,
});

const seeded = (links: readonly MyShareLink[]): ShareLinksData => ({
  pages: [{ links, summary: { totalLinks: links.length, activeLinks: links.filter((row) => row.isActive).length, totalUses: 3 }, nextOffset: null }],
  pageParams: [0],
});

type Reply = { readonly status: number; readonly body: unknown };

const depsReplying = (reply: Reply, { online = true, onRequest }: { readonly online?: boolean; readonly onRequest?: (queryClient: QueryClient) => void } = {}) => {
  const calls: { readonly url: string; readonly method: string; readonly body: string | null }[] = [];
  const queryClient = new QueryClient();
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), method: init?.method ?? 'GET', body: typeof init?.body === 'string' ? init.body : null });
    onRequest?.(queryClient);
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const deps: LinkActionDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    queryClient,
    isOnline: () => online,
  };
  return { calls, deps, queryClient };
};

const cached = (queryClient: QueryClient) => queryClient.getQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY);

describe('performSetShareLinkActive', () => {
  test('le cache change AVANT la réponse : la ligne et le compte des actifs se lisent au geste', async () => {
    const seen: (boolean | undefined)[] = [];
    const { deps, queryClient, calls } = depsReplying(
      { status: 200, body: { success: true, data: { isActive: false } } },
      { onRequest: (client) => seen.push(cached(client)?.pages[0]?.links[0]?.isActive) },
    );
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link()]));
    const outcome = await performSetShareLinkActive({ link: link(), isActive: false, deps });
    expect(outcome).toBe('done');
    expect(seen).toEqual([false]);
    expect(calls.map(({ url, method, body }) => [url, method, body])).toEqual([['https://gate.test/api/v1/links/mshy_l1', 'PATCH', '{"isActive":false}']]);
    expect(cached(queryClient)?.pages[0]?.summary?.activeLinks).toBe(0);
  });

  test('un refus de la passerelle RESTAURE la ligne et le résumé', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'Permissions insuffisantes' } });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    const outcome = await performSetShareLinkActive({ link: link(), isActive: false, deps });
    expect(outcome).toBe('failed');
    expect(cached(queryClient)).toEqual(before);
  });

  test('hors ligne : aucune requête, et le cache ne bouge pas', async () => {
    const { deps, queryClient, calls } = depsReplying({ status: 200, body: { success: true, data: { isActive: false } } }, { online: false });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    expect(await performSetShareLinkActive({ link: link(), isActive: false, deps })).toBe('offline');
    expect(calls).toHaveLength(0);
    expect(cached(queryClient)).toEqual(before);
  });

  test('un double tap sur le même lien émet UNE requête', async () => {
    const { deps, queryClient, calls } = depsReplying({ status: 200, body: { success: true, data: { isActive: false } } });
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link()]));
    const [first, second] = await Promise.all([
      performSetShareLinkActive({ link: link(), isActive: false, deps }),
      performSetShareLinkActive({ link: link(), isActive: false, deps }),
    ]);
    expect([first, second]).toEqual(['done', 'done']);
    expect(calls).toHaveLength(1);
  });

  test('une bascule CONTRAIRE à celle en vol ne part pas, et ne se dit pas faite (#6418)', async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const queryClient = new QueryClient();
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
      await held;
      return new Response(JSON.stringify({ success: true, data: { isActive: false } }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const deps: LinkActionDeps = {
      source: 'gateway',
      transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
      queryClient,
      isOnline: () => true,
    };
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link()]));

    const disabling = performSetShareLinkActive({ link: link(), isActive: false, deps });
    const activating = performSetShareLinkActive({ link: link({ isActive: false, inactiveReason: 'REVOKED' }), isActive: true, deps });
    release();
    const [first, second] = await Promise.all([disabling, activating]);

    expect(first).toBe('done');
    expect(second).not.toBe('done');
    expect(calls).toEqual(['PATCH https://gate.test/api/v1/links/mshy_l1']);
    expect(cached(queryClient)?.pages[0]?.links[0]?.isActive).toBe(false);
  });
});

const created = {
  success: true,
  data: {
    linkId: 'mshy_new',
    conversationId: 'c-annonces',
    shareLink: { id: 'l-new', linkId: 'mshy_new', name: 'Pour la newsletter', description: null, expiresAt: null, isActive: true },
  },
};

const NOW = new Date('2026-09-14T08:00:00.000Z');

describe('performCreateShareLink', () => {
  test('créé : le lien se lit EN TÊTE de la liste, avec sa conversation et zéro utilisation', async () => {
    const { deps, queryClient } = depsReplying({ status: 201, body: created });
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link()]));
    const outcome = await performCreateShareLink({
      draft: { ...defaultShareLinkDraft('c-annonces'), name: 'Pour la newsletter' },
      conversationTitle: 'Annonces produit',
      deps,
      now: NOW,
    });
    expect(outcome.status).toBe('created');
    const head = cached(queryClient)?.pages[0]?.links[0];
    expect([head?.linkId, head?.name, head?.conversationTitle, head?.currentUses, head?.isActive]).toEqual(['mshy_new', 'Pour la newsletter', 'Annonces produit', 0, true]);
    expect(cached(queryClient)?.pages[0]?.summary?.totalLinks).toBe(2);
  });

  test('sans conversation choisie, rien ne part', async () => {
    const { deps, calls } = depsReplying({ status: 201, body: created });
    const outcome = await performCreateShareLink({ draft: defaultShareLinkDraft(null), conversationTitle: null, deps, now: NOW });
    expect(outcome).toEqual({ status: 'invalid', field: 'conversationId' });
    expect(calls).toHaveLength(0);
  });

  test('un refus 403 se nomme, et la liste reste intacte', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'Rang insuffisant' } });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    const outcome = await performCreateShareLink({ draft: defaultShareLinkDraft('c-groupe'), conversationTitle: 'Groupe', deps, now: NOW });
    expect(outcome).toEqual({ status: 'refused' });
    expect(cached(queryClient)).toEqual(before);
  });

  test('hors ligne : aucune requête', async () => {
    const { deps, calls } = depsReplying({ status: 201, body: created }, { online: false });
    const outcome = await performCreateShareLink({ draft: defaultShareLinkDraft('c-annonces'), conversationTitle: 'Annonces', deps, now: NOW });
    expect(outcome).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
  });
});

describe('performUpdateShareLink (#7797) — Enregistrer, optimiste', () => {
  test('le cache change AVANT la réponse, et seul le corps changé part', async () => {
    const seen: (string | null | undefined)[] = [];
    const { deps, queryClient, calls } = depsReplying(
      { status: 200, body: { success: true, data: { id: 'l1', linkId: 'mshy_l1' } } },
      { onRequest: (client) => seen.push(cached(client)?.pages[0]?.links[0]?.name) },
    );
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link()]));
    const outcome = await performUpdateShareLink({ link: link(), patch: { name: 'Nova — Discord', allowAnonymousFiles: true }, deps });
    expect(outcome).toBe('done');
    expect(seen).toEqual(['Nova — Discord']);
    expect(calls.map(({ url, method, body }) => [url, method, body])).toEqual([
      ['https://gate.test/api/v1/links/mshy_l1', 'PATCH', '{"name":"Nova — Discord","allowAnonymousFiles":true}'],
    ]);
    expect(cached(queryClient)?.pages[0]?.links[0]?.policy?.allowAnonymousFiles).toBe(true);
  });

  test('un refus RESTAURE le lien tel qu’il était (retour arrière)', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'Permissions insuffisantes' } });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    const outcome = await performUpdateShareLink({ link: link(), patch: { name: 'Autre' }, deps });
    expect(outcome).toBe('failed');
    expect(cached(queryClient)).toEqual(before);
  });

  test('hors ligne : rien ne part, rien ne change', async () => {
    const { deps, queryClient, calls } = depsReplying({ status: 200, body: { success: true, data: {} } }, { online: false });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    expect(await performUpdateShareLink({ link: link(), patch: { name: 'Autre' }, deps })).toBe('offline');
    expect(calls).toHaveLength(0);
    expect(cached(queryClient)).toEqual(before);
  });

  test('un corps vide ne part pas', async () => {
    const { deps, calls } = depsReplying({ status: 200, body: { success: true, data: {} } });
    expect(await performUpdateShareLink({ link: link(), patch: {}, deps })).toBe('unchanged');
    expect(calls).toHaveLength(0);
  });
});

describe('performDeleteShareLink (#7797) — Supprimer', () => {
  test('le lien quitte la liste et le résumé au geste, puis DELETE part', async () => {
    const seen: number[] = [];
    const { deps, queryClient, calls } = depsReplying(
      { status: 200, body: { success: true, data: { message: 'Lien fermé avec succès' } } },
      { onRequest: (client) => seen.push(cached(client)?.pages[0]?.links.length ?? -1) },
    );
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, seeded([link(), link({ id: 'l2', linkId: 'mshy_l2' })]));
    expect(await performDeleteShareLink({ link: link(), deps })).toBe('done');
    expect(seen).toEqual([1]);
    expect(calls.map(({ url, method }) => [url, method])).toEqual([['https://gate.test/api/v1/links/mshy_l1', 'DELETE']]);
    expect(cached(queryClient)?.pages[0]?.summary?.totalLinks).toBe(1);
  });

  test('un refus remet le lien à sa place', async () => {
    const { deps, queryClient } = depsReplying({ status: 403, body: { success: false, error: 'non' } });
    const before = seeded([link()]);
    queryClient.setQueryData(SHARE_LINKS_QUERY_KEY, before);
    expect(await performDeleteShareLink({ link: link(), deps })).toBe('failed');
    expect(cached(queryClient)).toEqual(before);
  });
});
