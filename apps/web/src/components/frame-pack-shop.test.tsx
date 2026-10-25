import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import { FRAME_MOMENT_FAMILIES, describeFrameUsage, type FrameUsage } from '@meeshy/shared/types/frame-usage';
import { ACHIEVEMENT_RARITIES } from '@meeshy/shared/utils/game/glory';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { appQueryClient } from '@/lib/api/query-client';
import { chooseAtmosphere, withAtmosphere, type AtmosphereJob, type AtmosphereOutcome, type AtmosphereTile } from '@/lib/game/atmosphere';
import { createOfflineQueue } from '@/lib/offline-queue';
import { frameUsageText } from '@/lib/i18n-frame-usage-catalog';
import { loadStickerPacksCatalog } from '@/lib/i18n-sticker-packs-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import { packAssetUrl, sha256Hex } from '@/lib/packs/pack-asset-store';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { FramePackShop, prepareFramePackShop, usageText, type FrameShopAtmosphere } from './frame-pack-shop';

/**
 * **LA BOUTIQUE DES CADRES** (#10149, demande porteur 2026-10-11) — installer
 * un pack fait apparaître son ONGLET, le retirer le fait disparaître, chaque
 * cadre dit OÙ il s'utilise, et un ancien serveur rend une boutique vide sans
 * erreur.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const ORIGIN = 'https://gate.test';
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;
const revoked: string[] = [];

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadStickerPacksCatalog('fr');
  await prepareFramePackShop('fr');
  let next = 0;
  URL.createObjectURL = () => {
    next += 1;
    return `blob:cadre-${next}`;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
  };
});

afterAll(async () => {
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
  revoked.length = 0;
});

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const until = async (ready: () => boolean) => {
  for (let i = 0; i < 80 && !ready(); i += 1) await act(settle);
  expect(ready()).toBe(true);
};

const encoder = new TextEncoder();
const asset = async (bytes: Uint8Array<ArrayBuffer>, ext: string): Promise<{ ref: PackAssetRef; bytes: Uint8Array<ArrayBuffer> }> => {
  const sha256 = await sha256Hex(bytes.buffer);
  return { ref: { src: `${sha256.slice(0, 16)}.${ext}`, bytes: bytes.byteLength, sha256 }, bytes };
};

type PackShape = { readonly slug?: string; readonly removable?: boolean };

const summary = (installed: boolean, shape: PackShape = {}) => ({
  slug: shape.slug ?? 'exemple-savane',
  name: 'Savane (exemple)',
  description: 'Quatre cadres Ambassadeur',
  author: 'Meeshy',
  builtin: false,
  status: 'approved',
  itemCount: 4,
  coverUrl: null,
  installed,
  installCount: 0,
  domain: 'glory-frame',
  origin: 'official',
  version: 1,
  downloadBytes: { story: 48_000, square: null },
  removable: shape.removable ?? true,
  names: { fr: { name: 'Savane', description: 'Quatre cadres du rang Ambassadeur' } },
  preview: null,
  usage: { kind: 'rank', rank: 'ambassadeur' },
});

type Fixture = { deps: ConversationsDeps; fetcher: typeof fetch; calls: HttpRequest[] };

/** Une passerelle en mémoire : la boutique, les installés, le détail, l'installation — et les fichiers du pack. */
const gateway = async (
  options: { readonly absent?: boolean; readonly schema?: number; readonly installed?: boolean; readonly pack?: PackShape; readonly refuseRemoval?: boolean } = {},
): Promise<Fixture> => {
  const slug = options.pack?.slug ?? 'exemple-savane';
  const row = (on: boolean) => summary(on, options.pack);
  let installed = options.installed ?? false;
  const thumbs = await Promise.all([4, 3, 2, 1].map((division) => asset(new Uint8Array([division, 7, 7, 7]), 'webp')));
  const frames = [4, 3, 2, 1].map((division, index) => ({
    id: `exemple-savane.ambassadeur-${division}`,
    usage: { kind: 'rank', rank: 'ambassadeur', division },
    thumb: thumbs[index]!.ref,
    i18n: { name: `frame.ambassadeur-${division}` },
  }));
  const contract = await asset(encoder.encode(JSON.stringify({ schema: options.schema ?? 1, frames })), 'json');
  const strings = await asset(encoder.encode(JSON.stringify({ 'frame.ambassadeur-4': 'Ambassadeur IV — Savane' })), 'json');
  const files = new Map<string, Uint8Array<ArrayBuffer>>([
    [packAssetUrl(contract.ref.src, ORIGIN), contract.bytes],
    [packAssetUrl(strings.ref.src, ORIGIN), strings.bytes],
    ...thumbs.map((thumb) => [packAssetUrl(thumb.ref.src, ORIGIN), thumb.bytes] as const),
  ]);
  const calls: HttpRequest[] = [];
  const answer = (request: HttpRequest): ApiResult<unknown> => {
    if (options.absent === true) return { ok: false, status: 404, error: 'Not Found' };
    if (request.path === '/api/v1/packs/glory-frame') return { ok: true, data: [row(installed)] };
    if (request.path === '/api/v1/packs/glory-frame/installed') return { ok: true, data: installed ? [row(true)] : [] };
    if (request.path === `/api/v1/packs/glory-frame/${slug}/install`) {
      if (request.method === 'DELETE' && options.refuseRemoval === true) return { ok: false, status: 409, error: 'This pack cannot be removed', code: 'PACK_NOT_REMOVABLE' };
      installed = request.method === 'PUT';
      return { ok: true, data: row(installed) };
    }
    if (request.path === `/api/v1/packs/glory-frame/${slug}`) {
      return { ok: true, data: { ...row(installed), contractSchema: 1, contract: contract.ref, strings: { fr: strings.ref }, collections: [] } };
    }
    return { ok: false, status: 404, error: 'Not Found' };
  };
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  const fetcher = (async (url: string) => {
    const body = files.get(url);
    return body === undefined ? new Response('', { status: 404 }) : new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
  return { deps: { source: 'gateway', transport }, fetcher, calls };
};

const mount = (fixture: Fixture, atmosphere: FrameShopAtmosphere | null = null) =>
  mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <FramePackShop language="fr" deps={fixture.deps} assets={{ origin: ORIGIN, fetcher: fixture.fetcher, cacheStorage: null }} atmosphere={atmosphere} />
    </QueryClientProvider>,
  );

const tileOf = (atmosphere: AtmosphereTile['atmosphere']): AtmosphereTile => ({ atmosphere, cover: null, installed: null, removable: atmosphere !== 'afrique', downloadBytes: null });

/** La porte d'atmosphère d'un compte qui a choisi `current` ; `chosen` relève chaque choix, `outcome` dit ce que la porte répond. */
const atmosphereGate = (current: FrameShopAtmosphere['current'], outcome: AtmosphereOutcome = { status: 'saved', packInstalled: true }) => {
  const chosen: string[] = [];
  const gate: FrameShopAtmosphere = {
    current,
    tiles: (['afrique', 'egypte', 'nord'] as const).map(tileOf),
    choose: async (atmosphere) => {
      chosen.push(atmosphere);
      return outcome;
    },
  };
  return { gate, chosen };
};

const tab = (host: HTMLElement, slug: string) => host.querySelector<HTMLElement>(`[data-frame-pack-tab="${slug}"]`);

describe('FramePackShop', () => {
  test('installer un pack fait apparaître son ONGLET ; le retirer le fait disparaître', async () => {
    const host = await mount(await gateway());
    await until(() => host.querySelector('[data-shop-toggle="exemple-savane"]') !== null);
    expect(tab(host, 'exemple-savane')).toBe(null);
    expect(host.querySelector('[data-shop-pack="exemple-savane"] h3')?.textContent).toBe('Savane');

    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]'));
    await until(() => tab(host, 'exemple-savane') !== null);
    expect(tab(host, 'exemple-savane')?.textContent).toBe('Savane');

    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]'));
    await until(() => tab(host, 'exemple-savane') === null);
  });

  test('hors d’une conversation (réglages, aucun --accent), « Installer » et l’onglet choisi restent peints : l’accent retombe sur la marque', async () => {
    const host = await mount(await gateway());
    await until(() => host.querySelector('[data-shop-toggle="exemple-savane"]') !== null);
    expect(host.querySelector<HTMLElement>('[data-shop-toggle="exemple-savane"]')?.style.backgroundColor).toContain('var(--color-ios-brand)');
    expect(host.querySelector<HTMLElement>('[data-frame-shop-tab]')?.style.backgroundColor).toContain('var(--color-ios-brand)');
  });

  test('l’onglet d’un pack montre ses cadres, chacun avec son nom et OÙ il s’utilise', async () => {
    const host = await mount(await gateway({ installed: true }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelectorAll('[data-frame]').length === 4);

    const first = host.querySelector('[data-frame="exemple-savane.ambassadeur-4"]');
    expect(first?.querySelector('[data-frame-name]')?.textContent).toBe('Ambassadeur IV — Savane');
    expect(first?.querySelector('[data-frame-usage]')?.textContent).toBe('Rang Ambassadeur IV uniquement');
    expect(host.querySelector('[data-frame="exemple-savane.ambassadeur-1"] [data-frame-usage]')?.textContent).toBe('Rang Ambassadeur I uniquement');
    await until(() => first?.querySelector('img')?.getAttribute('src')?.startsWith('blob:') === true);
  });

  test('l’URL d’objet d’une vignette est révoquée au démontage', async () => {
    const host = await mount(await gateway({ installed: true }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelectorAll('[data-frame] img[src^="blob:"]').length === 4);
    const shown = Array.from(host.querySelectorAll('[data-frame] img')).map((img) => img.getAttribute('src'));
    mounter.unmountAll();
    expect([...revoked].sort()).toEqual([...shown].sort());
  });

  test('un contrat d’une version inconnue dit « Mettre à jour Meeshy » et ne télécharge aucune vignette', async () => {
    const host = await mount(await gateway({ installed: true, schema: 2 }));
    await until(() => tab(host, 'exemple-savane') !== null);
    await mounter.click(tab(host, 'exemple-savane'));
    await until(() => host.querySelector('[data-frame-pack-update]') !== null);
    expect(host.querySelectorAll('[data-frame]').length).toBe(0);
  });

  test('un pack INCLUS (non retirable) dit « Inclus », jamais « Retirer »', async () => {
    const host = await mount(await gateway({ installed: true, pack: { slug: 'moments', removable: false } }));
    await until(() => host.querySelector('[data-shop-included="moments"]') !== null);
    expect(host.querySelector('[data-shop-toggle="moments"]')).toBe(null);
  });

  test('le pack de l’atmosphère CHOISIE offre « Changer d’atmosphère » au lieu de « Retirer », et le dit dans sa rangée', async () => {
    const { gate } = atmosphereGate('egypte');
    const host = await mount(await gateway({ installed: true, pack: { slug: 'egypte' } }), gate);
    await until(() => host.querySelector('[data-shop-swap="egypte"]') !== null);
    expect(host.querySelector('[data-shop-toggle="egypte"]')).toBe(null);
    expect(host.querySelector('[data-shop-swap="egypte"]')?.textContent).toBe('Changer d’atmosphère');
    expect(host.querySelector('[data-shop-pack="egypte"]')?.textContent).toContain('Votre atmosphère');
  });

  test('montée SANS porte (le chemin des réglages), la boutique lit l’atmosphère du COMPTE dans le cache de Progression et tient son pack en place', async () => {
    appQueryClient.setQueryData<EngagementWithGame>(
      ENGAGEMENT_PROGRESS_QUERY_KEY,
      withAtmosphere({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockWithExtrasFixture() }, 'egypte'),
    );
    const fixture = await gateway({ installed: true, pack: { slug: 'egypte' } });
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <FramePackShop language="fr" deps={fixture.deps} assets={{ origin: ORIGIN, fetcher: fixture.fetcher, cacheStorage: null }} />
      </QueryClientProvider>,
    );
    await until(() => host.querySelector('[data-shop-swap="egypte"]') !== null);
    expect(host.querySelector('[data-shop-toggle="egypte"]')).toBe(null);
    expect(host.querySelector('[data-shop-pack="egypte"]')?.textContent).toContain('Votre atmosphère');
    expect(host.querySelector('[data-shop-pack="egypte"]')?.textContent).not.toContain('Retirer');
  });

  test('« Changer d’atmosphère » ouvre le choix des atmosphères, et choisir passe par la porte du compte', async () => {
    const { gate, chosen } = atmosphereGate('egypte');
    const host = await mount(await gateway({ installed: true, pack: { slug: 'egypte' } }), gate);
    await until(() => host.querySelector('[data-shop-swap="egypte"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-swap="egypte"]'));
    await until(() => host.ownerDocument.querySelector('[data-atmosphere-choice]') !== null);
    await mounter.click(host.ownerDocument.querySelector<HTMLElement>('[data-atmosphere-option="nord"]'));
    await mounter.click(host.ownerDocument.querySelector<HTMLElement>('[data-atmosphere-continue]'));
    await until(() => host.ownerDocument.querySelector('[data-atmosphere-choice]') === null);
    expect(chosen).toEqual(['nord']);
  });

  test('choisir depuis la boutique une atmosphère dont le pack n’est pas installé : la rangée du nouveau pack devient « Votre atmosphère » et l’ancien pack redevient retirable', async () => {
    const server = { atmosphere: 'egypte' as GloryAtmosphere, installed: new Set<string>(['egypte']) };
    const row = (slug: string) => summary(server.installed.has(slug), { slug });
    const transport = {
      request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
        if (request.path === '/api/v1/packs/glory-frame') return { ok: true, data: ['egypte', 'nord'].map(row) as T };
        if (request.path === '/api/v1/packs/glory-frame/installed') return { ok: true, data: [...server.installed].map(row) as T };
        if (request.method === 'PUT' && request.path.endsWith('/frames/atmosphere')) {
          const { atmosphere } = request.body as { readonly atmosphere: GloryAtmosphere };
          server.atmosphere = atmosphere;
          server.installed.add(atmosphere);
          return { ok: true, data: { atmosphere, packInstalled: true } as T };
        }
        return { ok: false, status: 404, error: 'Not Found' };
      },
    } as unknown as HttpTransport;
    const account = (): EngagementWithGame => withAtmosphere({ ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockWithExtrasFixture() }, server.atmosphere);
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, account());
    const queue = createOfflineQueue<AtmosphereJob>();
    const tiles = (['egypte', 'nord'] as const).map(tileOf);
    const choose = (atmosphere: GloryAtmosphere) =>
      chooseAtmosphere(atmosphere, { transport, client: appQueryClient, queue, isOnline: () => true, requestId: () => 'req-boutique', onInstalled: () => undefined });
    function AccountShop() {
      const progress = useQuery({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY, queryFn: async () => account(), staleTime: 0 }, appQueryClient);
      const current = progress.data?.game?.photo?.atmosphere ?? null;
      return <FramePackShop language="fr" deps={{ source: 'gateway', transport }} assets={{ origin: ORIGIN, cacheStorage: null }} atmosphere={{ current, tiles, choose }} />;
    }
    const host = await mounter.mount(
      <QueryClientProvider client={appQueryClient}>
        <AccountShop />
      </QueryClientProvider>,
    );
    await until(() => host.querySelector('[data-shop-swap="egypte"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-swap="egypte"]'));
    await until(() => host.ownerDocument.querySelector('[data-atmosphere-option="nord"]') !== null);
    await mounter.click(host.ownerDocument.querySelector<HTMLElement>('[data-atmosphere-option="nord"]'));
    await mounter.click(host.ownerDocument.querySelector<HTMLElement>('[data-atmosphere-continue]'));
    await until(() => server.atmosphere === 'nord' && tab(host, 'nord') !== null);
    await until(() => host.querySelector('[data-shop-swap="nord"]') !== null);
    expect(host.querySelector('[data-shop-pack="nord"]')?.textContent).toContain('Votre atmosphère');
    expect(host.querySelector('[data-shop-toggle="nord"]')).toBe(null);
    expect(host.querySelector('[data-shop-toggle="egypte"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-shop-pack="egypte"]')?.textContent).not.toContain('Votre atmosphère');
  });

  test('un choix parti hors ligne le dit dans la boutique', async () => {
    const { gate } = atmosphereGate('egypte', { status: 'queued' });
    const host = await mount(await gateway({ installed: true, pack: { slug: 'egypte' } }), gate);
    await until(() => host.querySelector('[data-shop-swap="egypte"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-swap="egypte"]'));
    await until(() => host.ownerDocument.querySelector('[data-atmosphere-continue]') !== null);
    await mounter.click(host.ownerDocument.querySelector<HTMLElement>('[data-atmosphere-continue]'));
    await until(() => host.querySelector('[data-frame-atmosphere-notice]')?.textContent === 'Hors ligne : votre choix partira avec la connexion.');
  });

  test('un retrait refusé (409 : l’atmosphère a été choisie ailleurs) se dit en mots, garde le pack et relit le compte', async () => {
    appQueryClient.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, { stale: true });
    const host = await mount(await gateway({ installed: true, pack: { slug: 'nord' }, refuseRemoval: true }), atmosphereGate('egypte').gate);
    await until(() => host.querySelector('[data-shop-toggle="nord"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="nord"]'));
    const status = () => host.querySelector('[data-pack-shop] [role="status"]')?.textContent ?? '';
    await until(() => status() !== '');
    expect(status()).toBe('Ce pack porte votre atmosphère : il reste installé. Changez d’atmosphère pour le retirer.');
    expect(host.querySelector('[data-shop-toggle="nord"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(tab(host, 'nord')).not.toBe(null);
    expect(appQueryClient.getQueryState(ENGAGEMENT_PROGRESS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('un retrait refusé (409) d’un pack qui ne porte aucune atmosphère (inclus, cache périmé) dit qu’il reste installé, jamais qu’il porte l’atmosphère', async () => {
    const host = await mount(await gateway({ installed: true, pack: { slug: 'moments' }, refuseRemoval: true }), atmosphereGate('egypte').gate);
    await until(() => host.querySelector('[data-shop-toggle="moments"]') !== null);
    await mounter.click(host.querySelector<HTMLElement>('[data-shop-toggle="moments"]'));
    const status = () => host.querySelector('[data-pack-shop] [role="status"]')?.textContent ?? '';
    await until(() => status() !== '');
    expect(status()).toBe('Ce pack reste installé : il ne peut pas être retiré.');
  });

  test('un ANCIEN serveur (404 sur /packs/…) rend une boutique vide, sans erreur', async () => {
    const host = await mount(await gateway({ absent: true }));
    await until(() => host.querySelector('[data-pack-shop-empty]') !== null);
    expect(host.querySelector('[data-pack-shop] [role="status"]')?.textContent).toBe('');
    expect(host.querySelectorAll('[data-frame-pack-tab]').length).toBe(0);
  });
});

describe('le libellé d’usage nomme la rareté et la famille de moment dans la langue de l’interface (#10273)', () => {
  test('en français : les mots d’iOS, jamais la valeur brute de la loi', () => {
    expect(usageText('fr', { kind: 'achievement', rarity: 'legendary' })).toBe('Succès Légendaire uniquement');
    expect(usageText('fr', { kind: 'moment', family: 'level-100' })).toBe('Moment « Niveau 100 » uniquement');
    expect(usageText('fr', { kind: 'moment', family: 'meesh' })).toBe('Moment « Meesh frappée » uniquement');
  });

  test('dans les sept langues, chaque rareté et chaque famille reçoit son nom traduit', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await prepareFramePackShop(language);
      const usages: readonly FrameUsage[] = [
        ...ACHIEVEMENT_RARITIES.map((rarity) => ({ kind: 'achievement', rarity }) as const),
        ...FRAME_MOMENT_FAMILIES.map((family) => ({ kind: 'moment', family }) as const),
      ];
      for (const usage of usages) {
        const text = usageText(language, usage);
        expect(text).not.toContain('{');
        expect(text).not.toBe(frameUsageText(language, describeFrameUsage(usage)));
      }
    }
  });
});
