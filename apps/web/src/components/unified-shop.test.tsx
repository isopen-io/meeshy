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
 * **LA VITRINE UNIQUE** (#10632) — filtre par domaine, prix et solde, achat
 * optimiste avec `requestId` stable, pack gratuit installé directement.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
  await loadStickerPacksCatalog('en');
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
  for (let i = 0; i < 80 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

type Answer = (request: HttpRequest) => ApiResult<unknown> | Promise<ApiResult<unknown>>;

const gatewayDeps = (answer: Answer): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return (await answer(request)) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const pack = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: `Pack ${slug}`, installed: false, ...extra });
const shopOf = (packs: readonly unknown[], balance = 50) => ({ ok: true as const, data: { domains: [{ domain: 'wallpaper', packs }], balance } });

const mountShop = (deps: ConversationsDeps, initialDomain?: 'wallpaper' | 'sticker', language: 'fr' | 'en' = 'fr') =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <UnifiedShop language={language} deps={deps} initialDomain={initialDomain} />
    </QueryClientProvider>,
  );

const buyButton = (host: HTMLElement, slug = 'wallpaper:w1') => host.querySelector<HTMLElement>(`[data-shop-toggle="${slug}"]`);
const posts = (calls: readonly HttpRequest[]) => calls.filter((call) => call.method === 'POST');

describe('UnifiedShop', () => {
  test('la vitrine s’ouvre filtrée sur le domaine demandé, affiche le prix et le solde', async () => {
    const { deps, calls } = gatewayDeps(() => shopOf([pack('w1', { price: 30 })]));
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(calls[0]?.path).toBe('/api/v1/packs/shop?domains=wallpaper');
    expect(host.querySelector('[data-shop-domain="wallpaper"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).toContain('30 Meeshes');
    expect(buyButton(host)?.textContent).toContain('Acheter');
    await until(() => host.querySelector('[data-shop-balance]')?.textContent === 'Solde : 50 Meeshes');
  });

  test('la puce « Cadres de bannière » est montrée : ses packs se listent et un gratuit s’installe par sa route (#10936)', async () => {
    const { deps, calls } = gatewayDeps((request) =>
      request.method === 'PUT' ? { ok: true, data: pack('cadres-celte', { installed: true }) } : { ok: true, data: { domains: [{ domain: 'banner-frame', packs: [pack('cadres-celte', { price: null })] }], balance: 0 } },
    );
    const host = await mountShop(deps);
    await until(() => host.querySelector('[data-shop-domain="banner-frame"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-domain="banner-frame"]'));
    await until(() => host.querySelector('[data-unified-shop="banner-frame"]') !== null && buyButton(host, 'banner-frame:cadres-celte') !== null);
    await mounter.click(buyButton(host, 'banner-frame:cadres-celte'));
    await until(() => calls.some((call) => call.method === 'PUT'));
    expect(calls.find((call) => call.method === 'PUT')?.path).toBe('/api/v1/packs/banner-frame/cadres-celte/install');
  });

  test('un domaine absent (404 partout) est une vitrine vide, sans erreur', async () => {
    const { deps } = gatewayDeps(() => ({ ok: false, status: 404, error: 'nf' }));
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-pack-shop-empty]') !== null);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('');
  });

  test('acheter est optimiste : possédé au geste, requestId généré, un double toucher ne part qu’une fois', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, calls } = gatewayDeps(async (request) => {
      if (request.method === 'GET') return shopOf([pack('w1', { price: 30 })]);
      await gate;
      return { ok: true, data: { pack: pack('w1', { price: 30, owned: true, installed: true }), balance: 20 } };
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await mounter.click(buyButton(host));
    expect(posts(calls).length).toBe(1);
    expect(posts(calls)[0]?.path).toBe('/api/v1/packs/wallpaper/w1/purchase');
    expect(JSON.stringify(posts(calls)[0]?.body)).toMatch(/"requestId":"buy-[A-Za-z0-9_-]{8,}"/);
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).toContain('Possédé');
    release();
    await until(() => host.querySelector('[data-shop-balance]')?.textContent === 'Solde : 20 Meeshes');
  });

  test('409 INSUFFICIENT_MEESHES : retour arrière et message', async () => {
    const { deps } = gatewayDeps((request) =>
      request.method === 'GET' ? shopOf([pack('w1', { price: 30 })]) : { ok: false, status: 409, error: 'x', code: 'INSUFFICIENT_MEESHES' },
    );
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => (host.querySelector('[role="status"]')?.textContent ?? '').includes('pas assez de Meeshes'));
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).not.toContain('Possédé');
    expect(buyButton(host)?.textContent).toContain('Acheter');
  });

  test('un nouvel essai après une panne réseau réutilise le MÊME requestId', async () => {
    let attempt = 0;
    const { deps, calls } = gatewayDeps((request) => {
      if (request.method === 'GET') return shopOf([pack('w1', { price: 30 })]);
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 0, error: 'offline' }
        : { ok: true, data: { pack: pack('w1', { price: 30, owned: true, installed: true }), balance: 1 } };
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => (host.querySelector('[role="status"]')?.textContent ?? '') !== '');
    await mounter.click(buyButton(host));
    await until(() => posts(calls).length === 2);
    expect(JSON.stringify(posts(calls)[1]?.body)).toBe(JSON.stringify(posts(calls)[0]?.body));
  });

  test('un pack gratuit s’installe directement, sans achat', async () => {
    const { deps, calls } = gatewayDeps((request) =>
      request.method === 'GET' ? shopOf([pack('w1')]) : { ok: true, data: pack('w1', { installed: true }) },
    );
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => calls.some((call) => call.method === 'PUT'));
    expect(calls.find((call) => call.method === 'PUT')?.path).toBe('/api/v1/packs/wallpaper/w1/install');
    expect(posts(calls).length).toBe(0);
  });

  test('le nom et la description d’un pack suivent la langue de l’interface (names), jamais le seul nom français', async () => {
    const names = { fr: { name: 'Aurore', description: 'Lueurs' }, en: { name: 'Dawn', description: 'Glows' } };
    const { deps } = gatewayDeps(() => shopOf([pack('w1', { name: 'Aurore', description: 'Lueurs', names })]));
    const host = await mountShop(deps, 'wallpaper', 'en');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"] h3') !== null);
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"] h3')?.textContent).toBe('Dawn');
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).toContain('Glows');
  });

  test('un pack inclus non retirable ne propose pas de désinstaller : aucun geste voué au refus', async () => {
    const { deps, calls } = gatewayDeps(() => shopOf([pack('w1', { installed: true, removable: false })]));
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(buyButton(host)).toBe(null);
    expect(host.querySelector('[data-shop-included="wallpaper:w1"]')?.textContent).toBe('Inclus');
    expect(calls.filter((call) => call.method === 'DELETE').length).toBe(0);
  });

  test('un pack de stickers intégré (Mee) est Inclus même d’un ancien serveur, et sa vignette est dessinée (#10738)', async () => {
    const mee = { slug: 'mee', name: 'Mee', description: 'Le colibri', builtin: true, installed: true, coverUrl: null };
    const { deps, calls } = gatewayDeps(() => ({ ok: true as const, data: { domains: [{ domain: 'sticker', packs: [mee] }], balance: 0 } }));
    const host = await mountShop(deps, 'sticker');
    await until(() => host.querySelector('[data-shop-pack="sticker:mee"]') !== null);
    expect(host.querySelector('[data-shop-included="sticker:mee"]')?.textContent).toBe('Inclus');
    expect(host.querySelector('[data-shop-pack="sticker:mee"] svg')).not.toBeNull();
    expect(calls.filter((call) => call.method === 'DELETE').length).toBe(0);
  });

  test('un achat confirmé sous un filtre vaut pour la vitrine entière : revenu sur « Tout », le pack est possédé', async () => {
    let bought = false;
    const row = () => pack('w1', { price: 30, owned: bought, installed: bought });
    const { deps } = gatewayDeps((request) => {
      if (request.method === 'GET') return shopOf([row()]);
      bought = true;
      return { ok: true, data: { pack: row(), balance: 20 } };
    });
    const host = await mountShop(deps);
    await until(() => buyButton(host) !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-domain="wallpaper"]'));
    await until(() => host.querySelector('[data-unified-shop="wallpaper"]') !== null && buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => host.querySelector('[data-shop-balance]')?.textContent === 'Solde : 20 Meeshes');
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-domain="all"]'));
    await until(() => host.querySelector('[data-unified-shop="all"]') !== null);
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).toContain('Possédé');
    expect(host.querySelector('[data-shop-buy]')).toBe(null);
  });

  test('un nouvel essai sous un AUTRE filtre réutilise le MÊME requestId : changer de puce n’oublie pas l’achat en suspens', async () => {
    let attempt = 0;
    const { deps, calls } = gatewayDeps((request) => {
      if (request.method === 'GET') return shopOf([pack('w1', { price: 30 })]);
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 0, error: 'offline' }
        : { ok: true, data: { pack: pack('w1', { price: 30, owned: true, installed: true }), balance: 1 } };
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => (host.querySelector('[role="status"]')?.textContent ?? '') !== '');
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-domain="all"]'));
    await until(() => host.querySelector('[data-unified-shop="all"]') !== null && buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await until(() => posts(calls).length === 2);
    expect(JSON.stringify(posts(calls)[1]?.body)).toBe(JSON.stringify(posts(calls)[0]?.body));
  });

  test('un double toucher à cheval sur un changement de filtre ne part qu’une fois', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps, calls } = gatewayDeps(async (request) => {
      if (request.method === 'GET') return shopOf([pack('w1', { price: 30 })]);
      await gate;
      return { ok: true, data: { pack: pack('w1', { price: 30, owned: true, installed: true }), balance: 20 } };
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-domain="all"]'));
    await until(() => host.querySelector('[data-unified-shop="all"]') !== null && buyButton(host) !== null);
    await mounter.click(buyButton(host));
    expect(posts(calls).length).toBe(1);
    release();
    await until(() => host.querySelector('[data-shop-balance]')?.textContent === 'Solde : 20 Meeshes');
  });

  test('une vitrine qui n’a pas pu se charger offre « Réessayer », qui la recharge', async () => {
    let gets = 0;
    const { deps } = gatewayDeps(() => {
      gets += 1;
      return gets === 1 ? { ok: false, status: 403, error: 'denied' } : shopOf([pack('w1', { price: 30 })]);
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelector('[data-pack-shop-retry]') !== null);
    expect(host.querySelector('[role="status"]')?.textContent).toContain('pas pu être chargés');
    expect(host.querySelector('[data-pack-shop-retry]')?.textContent).toBe('Réessayer');
    await mounter.click(host.querySelector<HTMLElement>('[data-pack-shop-retry]'));
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(host.querySelector('[data-pack-shop-retry]')).toBe(null);
  });

  test('au premier chargement, des rangées fantômes tiennent la place — muettes pour le lecteur d’écran, immobiles sous « Réduire les animations »', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps } = gatewayDeps(async () => {
      await gate;
      return shopOf([pack('w1', { price: 30 })]);
    });
    const host = await mountShop(deps, 'wallpaper');
    await until(() => host.querySelectorAll('[data-pack-shop-skeleton]').length > 0);
    const ghost = host.querySelector('[data-pack-shop-skeleton]');
    expect(ghost?.getAttribute('aria-hidden')).toBe('true');
    expect(ghost?.innerHTML ?? '').toContain('motion-reduce:animate-none');
    release();
    await until(() => host.querySelector('[data-shop-pack="wallpaper:w1"]') !== null);
    expect(host.querySelector('[data-pack-shop-skeleton]')).toBe(null);
  });

  test('409 PACK_ALREADY_OWNED (acheté depuis un autre appareil) : le pack reste possédé, sans message d’échec', async () => {
    const { deps } = gatewayDeps((request) =>
      request.method === 'GET' ? shopOf([pack('w1', { price: 30 })]) : { ok: false, status: 409, error: 'x', code: 'PACK_ALREADY_OWNED' },
    );
    const host = await mountShop(deps, 'wallpaper');
    await until(() => buyButton(host) !== null);
    await mounter.click(buyButton(host));
    await act(settle);
    await act(settle);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('');
    expect(host.querySelector('[data-shop-pack="wallpaper:w1"]')?.textContent).toContain('Possédé');
  });
});
