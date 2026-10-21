import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from '@/lib/api/conversations';
import { createHttpTransport } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import { appearanceOf } from '@/lib/appearance/read';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationAppearanceSheet } from './conversation-appearance-sheet';

/**
 * **LE SÉLECTEUR « FOND ET COULEUR »** (#10631) — chaque toucher s'applique au
 * cache avant la réponse, part en PUT, un refus rétablit et le dit.
 */
const base = (): Conversation =>
  ({ id: 'c1', type: 'group', title: 'Équipe', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: new Date(), updatedAt: new Date() }) as Conversation;

type Sent = { readonly method: string; readonly url: string; readonly body: unknown };

function harness(putStatus: number, galleryStatus = 200, gallery: readonly unknown[] = []) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    sent.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
    if (method === 'PUT') {
      return new Response(JSON.stringify(putStatus < 400 ? { success: true, data: {} } : { success: false, error: 'no', code: putStatus === 403 ? 'PACK_NOT_OWNED' : 'X' }), { status: putStatus });
    }
    if (url.includes('/packs/wallpaper/installed')) return new Response(JSON.stringify({ success: true, data: [{ slug: 'heritages' }] }), { status: 200 });
    if (galleryStatus >= 400) return new Response(JSON.stringify({ success: false, error: 'down' }), { status: galleryStatus });
    return new Response(JSON.stringify({ success: true, data: gallery, pagination: { total: gallery.length, offset: 0, limit: 30, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }), { status: 200 });
  }) as unknown as typeof fetch;
  const transport = createHttpTransport({ base: '', fetchImpl });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [base()], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey('c1'), base());
  return { sent, transport, queryClient };
}

let host: HTMLElement;
let root: Root;

beforeAll(() => {
  ensureHappyDomRegistered();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => releaseHappyDomIfRegistered());
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const settle = async (ms = 80): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};

function Host({ queryClient, deps, onClose }: { readonly queryClient: QueryClient; readonly deps: React.ComponentProps<typeof ConversationAppearanceSheet>['deps']; readonly onClose: () => void }) {
  const [, tick] = useState(0);
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        const isConversation = JSON.stringify(event.query.queryKey) === JSON.stringify(conversationQueryKey('c1')) || event.query.queryKey === CONVERSATIONS_QUERY_KEY;
        if (isConversation && event.type === 'updated') tick((n) => n + 1);
      }),
    [queryClient],
  );
  return <ConversationAppearanceSheet conversation={findCachedConversation(queryClient, 'c1') ?? base()} accent="#6366F1" deps={deps} onClose={onClose} />;
}

async function open(h: ReturnType<typeof harness>, onClose = () => undefined): Promise<void> {
  const deps = { source: 'gateway', transport: h.transport } as const;
  await act(async () =>
    root.render(
      <QueryClientProvider client={h.queryClient}>
        <Host queryClient={h.queryClient} deps={deps} onClose={onClose} />
      </QueryClientProvider>,
    ),
  );
  await settle();
}

const radio = (name: string, group = ''): HTMLElement => {
  const scope = group === '' ? host : host.querySelector<HTMLElement>(`[${group}]`) ?? host;
  const found = [...scope.querySelectorAll<HTMLElement>('[role="radio"]')].find((el) => el.getAttribute('aria-label') === name);
  if (found === undefined) throw new Error(`pas de choix « ${name} »`);
  return found;
};

const chosen = (h: ReturnType<typeof harness>) => appearanceOf(findCachedConversation(h.queryClient, 'c1')!);

describe('le sélecteur de fond', () => {
  test('les choix sont des radiogroups dont les cibles font 44 pt au moins, un seul tabulable par groupe', async () => {
    const h = harness(200);
    await open(h);
    const groups = [...host.querySelectorAll('[role="radiogroup"]')];
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const group of groups) {
      const radios = [...group.querySelectorAll<HTMLElement>('[role="radio"]')];
      expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
      for (const r of radios) expect(Number.parseInt(r.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  test('Signature est cochée par défaut ; seuls les packs installés se montrent', async () => {
    const h = harness(200);
    await open(h);
    expect(radio('Signature').getAttribute('aria-checked')).toBe('true');
    expect(radio('Monogramme')).toBeDefined();
    expect(radio('Zellige')).toBeDefined();
    expect(() => radio('Horizon')).toThrow();
  });

  test('toucher un modèle change le fond dans le cache AVANT la réponse, et part en PUT', async () => {
    const h = harness(200);
    await open(h);
    await act(async () => radio('Chevrons').click());
    expect(chosen(h).background).toEqual({ kind: 'design', pack: 'essentiels', design: 'chevrons' });
    await settle(30);
    expect(h.sent.find((s) => s.method === 'PUT')).toMatchObject({ url: '/api/v1/user-preferences/conversations/c1', body: { appearance: { background: { kind: 'design', pack: 'essentiels', design: 'chevrons' } } } });
  });

  test('une couleur unie, puis un accent, se cumulent', async () => {
    const h = harness(200);
    await open(h);
    await act(async () => radio('Azur', 'data-appearance-solid-group').click());
    await act(async () => radio('Framboise', 'data-appearance-accent-group').click());
    const now = chosen(h);
    expect(now.background).toEqual({ kind: 'solid', color: 'azur' });
    expect(now.accent).toBe('framboise');
  });

  test('un refus rétablit l’état d’avant et le dit', async () => {
    const h = harness(403);
    await open(h);
    await act(async () => radio('Chevrons').click());
    await settle(60);
    expect(chosen(h).background).toEqual({ kind: 'signature' });
    expect(host.querySelector('[data-appearance-error]')?.textContent ?? '').not.toBe('');
  });

  test('une galerie qui ne répond pas ne se dit pas vide : elle dit que les photos ne se chargent pas', async () => {
    const h = harness(200, 503);
    await open(h);
    await settle(120);
    const section = host.querySelector('[data-appearance-photo]')?.textContent ?? '';
    expect(section).not.toContain('Aucune photo envoyée');
    expect(host.querySelector('[data-appearance-photo-unavailable]')).not.toBeNull();
  });

  /** #10665 — une pièce CHIFFRÉE ne se peint jamais sur le web (aucune clé de pièce) : elle ne se propose donc pas, sa vignette serait un chiffré. */
  test('une photo chiffrée ne se propose pas comme fond', async () => {
    const message = (id: string, attachment: Readonly<Record<string, unknown>>) => ({
      id,
      conversationId: 'c1',
      content: '',
      messageType: 'image',
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-10-15T10:00:00.000Z',
      attachments: [{ messageId: id, fileName: `${id}.jpg`, originalName: `${id}.jpg`, mimeType: 'image/jpeg', fileSize: 10, createdAt: '2026-10-15T10:00:00.000Z', ...attachment }],
    });
    const h = harness(200, 200, [
      message('m-clair', { id: 'a-clair', fileUrl: 'https://cdn.x/clair.jpg' }),
      message('m-chiffre', { id: 'a-chiffre', fileUrl: 'https://cdn.x/chiffre.enc', isEncrypted: true }),
    ]);
    await open(h);
    await settle(120);
    const offered = [...host.querySelectorAll<HTMLImageElement>('[data-appearance-photo-group] img')].map((img) => img.getAttribute('src') ?? '');
    expect(offered.some((src) => src.includes('clair.jpg'))).toBe(true);
    expect(offered.some((src) => src.includes('chiffre.enc'))).toBe(false);
  });

  test('une galerie vide le dit', async () => {
    const h = harness(200);
    await open(h);
    await settle(120);
    expect(host.querySelector('[data-appearance-photo]')?.textContent ?? '').toContain('Aucune photo envoyée');
  });

  test('« Automatique » rend l’accent calculé', async () => {
    const h = harness(200);
    await open(h);
    await act(async () => radio('Framboise', 'data-appearance-accent-group').click());
    await act(async () => radio('Automatique').click());
    expect(chosen(h).accent).toBeNull();
  });

  test('les flèches déplacent et choisissent', async () => {
    const h = harness(200);
    await open(h);
    const azur = radio('Azur', 'data-appearance-solid-group');
    await act(async () => azur.click());
    await act(async () => {
      radio('Azur', 'data-appearance-solid-group').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(chosen(h).background.kind).toBe('solid');
    expect(chosen(h).background).not.toEqual({ kind: 'solid', color: 'azur' });
  });

  test('« Plus dans la boutique » ferme la feuille et mène à la vitrine des fonds', async () => {
    const h = harness(200);
    const pushed: string[] = [];
    const original = window.history.pushState.bind(window.history);
    window.history.pushState = ((data: unknown, unused: string, url?: string | URL | null) => {
      pushed.push(String(url));
      original(data, unused, url);
    }) as typeof window.history.pushState;
    let closed = false;
    await open(h, () => {
      closed = true;
    });
    await act(async () => (host.querySelector('[data-appearance-shop]') as HTMLElement).click());
    expect(closed).toBe(true);
    expect(pushed.at(-1)).toContain('volet=packs');
    expect(pushed.at(-1)).toContain('domaine=wallpaper');
  });
});
