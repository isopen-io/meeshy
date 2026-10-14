import * as z from 'zod/mini';

import { PACK_DOMAINS, type PackDomain } from '@meeshy/shared/types/content-pack';

import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';
import { loadCatalogueOf, setInstalledOf, type PackDeps, type PackPort } from './packs';

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
});

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
  };
};

/** Les stickers gardent `/sticker-packs` ; les autres domaines vivent sous `/packs/<domaine>`. */
export const domainBase = (domain: PackDomain): string =>
  domain === 'sticker' ? '/api/v1/sticker-packs' : `/api/v1/packs/${encodeURIComponent(domain)}`;

export const SHOP_PATH = '/api/v1/packs/shop';

export const shopPackPort = (domain: PackDomain): PackPort<ShopPack, ShopPack, ShopPack> => {
  const decode = decodeShopPack(domain);
  const base = domainBase(domain);
  return {
    catalogue: base,
    installed: `${base}/installed`,
    bySlug: (slug) => `${base}/${encodeURIComponent(slug)}`,
    install: (slug) => `${base}/${encodeURIComponent(slug)}/install`,
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
    path: `${domainBase(domain)}/${encodeURIComponent(slug)}/purchase`,
    body: { requestId },
  });
  if (!result.ok) return result;
  const parsed = WirePurchase.safeParse(result.data);
  const pack = parsed.success ? decodeShopPack(domain)(parsed.data.pack) : null;
  return pack === null || !parsed.success ? decodeFailure : { ok: true, data: { pack, balance: parsed.data.balance ?? null } };
}

export const newPurchaseRequestId = (): string => `buy-${crypto.randomUUID().replaceAll('-', '')}`;
