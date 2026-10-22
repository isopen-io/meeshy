import * as z from 'zod/mini';

import * as packsEndpoints from '@meeshy/shared/api/endpoints/packs';
import * as stickerPacksEndpoints from '@meeshy/shared/api/endpoints/sticker-packs';
import { PACK_DOMAINS, type PackDomain, type PackLanguage, type PackNames } from '@meeshy/shared/types/content-pack';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { decodePackNames, loadCatalogueOf, setInstalledOf, type PackDeps, type PackPort } from './packs';

/**
 * **LA VITRINE UNIQUE** (#10632, spec §§ 4.3–4.4) — un seul port pour acheter
 * et lister les packs de TOUS les domaines (stickers, cadres, fonds, contours,
 * bannières). `GET /packs/shop` agrège les domaines et sert le solde de
 * Meeshes ; un ANCIEN serveur répond 404 et la vitrine retombe sur les
 * boutiques par domaine. Un domaine absent (404) est une vitrine VIDE, jamais
 * une erreur. Le client n'envoie jamais de prix et ne décide jamais de la
 * possession : il affiche `owned`.
 */

export type ShopPack = {
  readonly slug: string;
  readonly domain: PackDomain;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly coverUrl: string | null;
  readonly itemCount: number;
  readonly installed: boolean;
  /** En Meeshes ; `null` = gratuit. */
  readonly price: number | null;
  readonly owned: boolean;
  /** Nom et description par langue ; `name`/`description` restent le repli (français). */
  readonly names: PackNames;
  /** `false` = pack inclus (builtin) que le serveur refuse de retirer. */
  readonly removable: boolean;
  /** Pack de stickers intégré (Mee, Meo, Mee & Meo) : dessiné par le client, servi sans image. */
  readonly builtin?: true;
};

export type ShopResult = { readonly packs: readonly ShopPack[]; readonly balance: number | null };

export type PurchaseResult = { readonly pack: ShopPack; readonly balance: number | null };

const WirePack = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.optional(z.string()),
  author: z.optional(z.string()),
  coverUrl: z.optional(z.nullable(z.string())),
  itemCount: z.optional(z.number()),
  installed: z.boolean(),
  price: z.optional(z.nullable(z.number())),
  owned: z.optional(z.boolean()),
  removable: z.optional(z.boolean()),
  builtin: z.optional(z.boolean()),
  names: z.optional(z.record(z.string(), z.unknown())),
});

/** La langue du lecteur, puis le français, puis le nom servi à plat. */
export const shopPackText = (pack: ShopPack, language: PackLanguage): { readonly name: string; readonly description: string } =>
  pack.names[language] ?? pack.names.fr ?? { name: pack.name, description: pack.description };

const decodeFailure = { ok: false, status: 0, error: 'Invalid pack', code: 'DECODE' } as const;

export const isPackDomain = (value: unknown): value is PackDomain => typeof value === 'string' && (PACK_DOMAINS as readonly string[]).includes(value);

export const decodeShopPack = (domain: PackDomain) => (raw: unknown): ShopPack | null => {
  const parsed = WirePack.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const price = wire.price ?? null;
  return {
    slug: wire.slug,
    domain,
    name: wire.name,
    description: wire.description ?? '',
    author: wire.author ?? '',
    coverUrl: wire.coverUrl ?? null,
    itemCount: wire.itemCount ?? 0,
    installed: wire.installed,
    price,
    owned: price === null ? true : (wire.owned ?? false),
    names: decodePackNames(wire.names),
    removable: wire.removable ?? !(domain === 'sticker' && wire.builtin === true),
    ...(domain === 'sticker' && wire.builtin === true ? { builtin: true as const } : {}),
  };
};

type DomainRoutes = {
  readonly catalogue: string;
  readonly installed: string;
  readonly bySlug: (slug: string) => string;
  readonly install: (slug: string) => string;
  readonly purchase?: (slug: string) => string;
};

/**
 * Les routes de chaque domaine, lues dans le catalogue GÉNÉRÉ (#7716) : les
 * stickers gardent `/sticker-packs`, les autres domaines vivent sous
 * `/packs/<domaine>`. L'achat n'existe que là où la passerelle le monte.
 */
const CATALOGUED_ROUTES: Partial<Record<PackDomain, DomainRoutes>> = {
  sticker: {
    catalogue: stickerPacksEndpoints.root,
    installed: stickerPacksEndpoints.installed,
    bySlug: stickerPacksEndpoints.bySlug,
    install: stickerPacksEndpoints.bySlugInstall,
  },
  'glory-frame': {
    catalogue: packsEndpoints.gloryFrame,
    installed: packsEndpoints.gloryFrameInstalled,
    bySlug: packsEndpoints.gloryFrameBySlug,
    install: packsEndpoints.gloryFrameBySlugInstall,
  },
  wallpaper: {
    catalogue: packsEndpoints.wallpaper,
    installed: packsEndpoints.wallpaperInstalled,
    bySlug: packsEndpoints.wallpaperBySlug,
    install: packsEndpoints.wallpaperBySlugInstall,
    purchase: packsEndpoints.wallpaperBySlugPurchase,
  },
  'avatar-ring': {
    catalogue: packsEndpoints.avatarRing,
    installed: packsEndpoints.avatarRingInstalled,
    bySlug: packsEndpoints.avatarRingBySlug,
    install: packsEndpoints.avatarRingBySlugInstall,
    purchase: packsEndpoints.avatarRingBySlugPurchase,
  },
  banner: {
    catalogue: packsEndpoints.banner,
    installed: packsEndpoints.bannerInstalled,
    bySlug: packsEndpoints.bannerBySlug,
    install: packsEndpoints.bannerBySlugInstall,
    purchase: packsEndpoints.bannerBySlugPurchase,
  },
  'banner-frame': {
    catalogue: packsEndpoints.bannerFrame,
    installed: packsEndpoints.bannerFrameInstalled,
    bySlug: packsEndpoints.bannerFrameBySlug,
    install: packsEndpoints.bannerFrameBySlugInstall,
    purchase: packsEndpoints.bannerFrameBySlugPurchase,
  },
};

/**
 * Un domaine que la passerelle ne monte pas encore (`capture-frame`) garde la
 * forme `/packs/<domaine>` : il répond 404, que `absentMeansEmpty` lit comme
 * une vitrine vide. La racine se déduit du catalogue, jamais d'un littéral.
 */
const PACKS_ROOT = packsEndpoints.shop.slice(0, -'/shop'.length);

const routesOf = (domain: PackDomain): DomainRoutes => {
  const catalogued = CATALOGUED_ROUTES[domain];
  if (catalogued !== undefined) return catalogued;
  const base = `${PACKS_ROOT}/${encodeURIComponent(domain)}`;
  return {
    catalogue: base,
    installed: `${base}/installed`,
    bySlug: (slug) => `${base}/${encodeURIComponent(slug)}`,
    install: (slug) => `${base}/${encodeURIComponent(slug)}/install`,
  };
};

export const SHOP_PATH = packsEndpoints.shop;

export const purchasePath = (domain: PackDomain, slug: string): string => {
  const routes = routesOf(domain);
  return routes.purchase?.(slug) ?? `${routes.bySlug(slug)}/purchase`;
};

export const shopPackPort = (domain: PackDomain): PackPort<ShopPack, ShopPack, ShopPack> => {
  const decode = decodeShopPack(domain);
  const routes = routesOf(domain);
  return {
    catalogue: routes.catalogue,
    installed: routes.installed,
    bySlug: routes.bySlug,
    install: routes.install,
    decodeSummary: decode,
    decodeInstalled: decode,
    decodeDetail: decode,
    absentMeansEmpty: domain !== 'sticker',
  };
};

const WireShop = z.object({
  domains: z.array(z.object({ domain: z.string(), packs: z.array(z.unknown()) })),
  balance: z.optional(z.number()),
});

const decodeShop = (raw: unknown, only: readonly PackDomain[]): ShopResult | null => {
  const parsed = WireShop.safeParse(raw);
  if (!parsed.success) return null;
  const packs = parsed.data.domains.flatMap((entry) => {
    if (!isPackDomain(entry.domain) || (only.length > 0 && !only.includes(entry.domain))) return [];
    const decode = decodeShopPack(entry.domain);
    return entry.packs.flatMap((row) => {
      const pack = decode(row);
      return pack === null ? [] : [pack];
    });
  });
  return { packs, balance: parsed.data.balance ?? null };
};

const signalOf = (deps: PackDeps) => (deps.signal === undefined ? {} : { signal: deps.signal });

/**
 * La vitrine, filtrée par domaines (aucun = tous). 404 sur `/packs/shop` ⇒ retour
 * aux boutiques par domaine (solde inconnu) ; un domaine absent y est vide.
 */
export async function loadShop(deps: PackDeps, domains: readonly PackDomain[] = []): Promise<ApiResult<ShopResult>> {
  const query = domains.length === 0 ? '' : `?domains=${domains.map(encodeURIComponent).join(',')}`;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `${SHOP_PATH}${query}`, ...signalOf(deps) });
  if (result.ok) {
    const shop = decodeShop(result.data, domains);
    return shop === null ? decodeFailure : { ok: true, data: shop };
  }
  if (result.status !== 404) return result;
  const wanted = domains.length === 0 ? PACK_DOMAINS : domains;
  const lists = await Promise.all(wanted.map((domain) => loadCatalogueOf(shopPackPort(domain), deps)));
  const failed = lists.find((list) => !list.ok);
  if (failed !== undefined && !failed.ok) return failed;
  return { ok: true, data: { packs: lists.flatMap((list) => (list.ok ? list.data : [])), balance: null } };
}

export const setShopPackInstalled = (deps: ConversationsDeps, domain: PackDomain, slug: string, installed: boolean): Promise<ApiResult<ShopPack>> =>
  setInstalledOf(shopPackPort(domain), deps, slug, installed);

const WirePurchase = z.object({ pack: z.unknown(), balance: z.optional(z.number()) });

/** `requestId` généré AU GESTE par l'appelant et réutilisé pour tout nouvel essai : un rejeu n'achète qu'une fois. */
export async function purchasePack(deps: ConversationsDeps, domain: PackDomain, slug: string, requestId: string): Promise<ApiResult<PurchaseResult>> {
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: purchasePath(domain, slug),
    body: { requestId },
  });
  if (!result.ok) return result;
  const parsed = WirePurchase.safeParse(result.data);
  const pack = parsed.success ? decodeShopPack(domain)(parsed.data.pack) : null;
  return pack === null || !parsed.success ? decodeFailure : { ok: true, data: { pack, balance: parsed.data.balance ?? null } };
}

export { newPurchaseRequestId } from './packs';
