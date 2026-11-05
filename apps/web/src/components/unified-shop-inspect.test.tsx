import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UnifiedShop } from './unified-shop';

/**
 * **LA VITRINE OUVRE CHAQUE DÉCORATION** (#16267) — la rangée d'un pack de
 * décor ouvre sa fiche (éléments en grille, éditeur, état, poids, geste), la
 * couverture ouvre directement le plein écran ; un pack de stickers garde sa
 * rangée d'avant.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 120 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const gateway = (answer: (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return (await answer(request)) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const shop = {
  ok: true as const,
  data: {
    domains: [
      { domain: 'avatar-ring', packs: [{ slug: 'contours-essentiels', name: 'Contours essentiels', installed: true }, { slug: 'officiel', name: 'Officiel', author: 'Studio Nova', installed: false }] },
      { domain: 'sticker', packs: [{ slug: 'mes-stickers', name: 'Stickers', installed: false }] },
    ],
    balance: 0,
  },
};

const mount = (deps: ConversationsDeps) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <UnifiedShop language="fr" deps={deps} />
    </QueryClientProvider>,
  );

const q = (selector: string) => document.querySelector<HTMLElement>(selector);

describe('UnifiedShop — fiche et plein écran', () => {
  test('la fiche d’un pack embarqué montre ses éléments, « Meeshy » pour éditeur, l’état « Embarqué » sans poids', async () => {
    const { deps } = gateway((request) => (request.path.startsWith('/api/v1/packs/shop') ? shop : { ok: false, status: 404, error: 'absent' }));
    await mount(deps);
    await until(() => q('[data-shop-open="avatar-ring:contours-essentiels"]') !== null);
    expect(q('[data-shop-open="sticker:mes-stickers"]')).toBeNull();
    await mounter.click(q('[data-shop-open="avatar-ring:contours-essentiels"]'));
    await until(() => q('[data-pack-sheet] [data-pack-sheet-item="filet"]') !== null);
    expect(q('[data-pack-sheet]')?.getAttribute('data-pack-sheet')).toBe('avatar-ring:contours-essentiels');
    expect(q('[data-pack-sheet-facts]')?.textContent).toBe('Éditeur : Meeshy · Embarqué dans Meeshy');
    expect(document.querySelectorAll('[data-pack-sheet-item]').length).toBe(6);
    expect(q('[data-pack-sheet-action]')?.textContent).toBe('Retirer');

    await mounter.click(q('[data-pack-sheet-item="perle"]'));
    await until(() => q('dialog[data-decor-preview]') !== null);
    expect(q('[data-decor-position]')?.textContent).toContain('3 / 6');
  });

  test('la fiche d’un pack servi dessine son chargement, puis ses éléments, son éditeur, « À télécharger » et son poids', async () => {
    const contract = { domain: 'avatar-ring', rings: [{ key: 'anneau', stroke: { style: 'solid', width: 0.05, colors: ['#112233'] } }] };
    const bytes = new TextEncoder().encode(JSON.stringify(contract));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
    const src = `${digest.slice(0, 16)}.json`;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(bytes)) as unknown as typeof fetch;
    try {
      let release: (value: ApiResult<unknown>) => void = () => undefined;
      const detail = new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
      const { deps } = gateway((request) =>
        request.path.startsWith('/api/v1/packs/shop') ? shop : request.path === '/api/v1/packs/avatar-ring/officiel' ? detail : { ok: false, status: 404, error: 'absent' },
      );
      await mount(deps);
      await until(() => q('[data-shop-open="avatar-ring:officiel"]') !== null);
      await mounter.click(q('[data-shop-open="avatar-ring:officiel"]'));
      await until(() => q('[data-pack-sheet-loading]') !== null);
      await act(async () => release({ ok: true, data: { slug: 'officiel', name: 'Officiel', description: '', installed: false, contract: { src, bytes: 2400, sha256: digest } } }));
      await until(() => q('[data-pack-sheet-item="anneau"]') !== null);
      expect(q('[data-pack-sheet-facts]')?.textContent?.replace(/[\u00a0\u202f]/g, ' ')).toBe('Éditeur : Studio Nova · À télécharger · Poids : 2,4 ko');
      expect(q('[data-pack-sheet-action]')?.textContent).toBe('Installer');
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('la couverture ouvre directement le plein écran ; ✕ rend la boutique', async () => {
    const { deps } = gateway((request) => (request.path.startsWith('/api/v1/packs/shop') ? shop : { ok: false, status: 404, error: 'absent' }));
    await mount(deps);
    await until(() => q('[data-shop-preview="avatar-ring:contours-essentiels"]') !== null);
    await mounter.click(q('[data-shop-preview="avatar-ring:contours-essentiels"]'));
    await until(() => q('dialog[data-decor-preview]') !== null);
    expect(q('[data-pack-sheet]')).toBeNull();
    expect(q('[data-decor-position]')?.textContent).toContain('1 / 6');
    await mounter.click(q('[data-decor-preview-close]'));
    expect(q('dialog[data-decor-preview]')).toBeNull();
    expect(q('[data-shop-pack="avatar-ring:contours-essentiels"]')).not.toBeNull();
  });
});
