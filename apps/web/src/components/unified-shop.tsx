import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useMemo, useState } from 'react';

import { PACK_DOMAINS, type PackDomain } from '@meeshy/shared/types/content-pack';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import { loadShop, purchasePack, setShopPackInstalled, shopPackText, type ShopPack } from '@/lib/api/packs-shop';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { PlainStickerPacksKey } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { meeStickersOfPack } from '@/lib/mee/catalog';
import { renderMeeSticker } from '@/lib/mee/render';
import { isMeeBuiltinPack, type MeeBuiltinPack } from '@/lib/mee/types';

import type { PackShopAdapter } from './pack-shop';

/** La vignette d'un pack Mee intégré : son premier Mee, dessiné par le client (le serveur ne sert aucune image). */
function MeePackCover({ slug }: { readonly slug: MeeBuiltinPack }) {
  const box = 'block h-14 w-14 shrink-0 rounded-xl';
  const first = meeStickersOfPack(slug)[0];
  return first === undefined ? (
    <span aria-hidden className={box} />
  ) : (
    <span aria-hidden className={box} dangerouslySetInnerHTML={{ __html: renderMeeSticker(first, { uid: `shop-${slug}`, animated: false }) }} />
  );
}

/** Chargée à la demande, comme dans `frame-pack-shop.tsx` : `pack_shop` est `dynamic_only` (budgets.json). */
const PackShop = lazy(() => import('./pack-shop').then((m) => ({ default: m.PackShop })));

/**
 * **LA VITRINE UNIQUE** (#10632, spec § 9) — stickers, cadres, fonds,
 * contours et bannières dans UNE boutique, filtrable par domaine. C'est la
 * boutique générique (`PackShop`) branchée sur `GET /packs/shop` : prix en
 * Meeshes, possession lue au serveur, achat optimiste. Les écrans qui
 * restituent ce que l'on possède (feuille de stickers, étagère de cadres)
 * gardent leur boutique ; celle-ci en est la porte d'entrée commune.
 *
 * Un pack se désigne par `domaine:slug` — deux domaines peuvent partager un
 * slug sans que l'un porte le geste de l'autre.
 */

export type UnifiedFilter = 'all' | PackDomain;

export const BALANCE_QUERY_KEY = ['me', 'packs', 'balance'] as const;
const SHOP_KEY_ROOT = ['me', 'packs', 'shop'] as const;
const shopKey = (filter: UnifiedFilter) => [...SHOP_KEY_ROOT, filter] as const;
const SHOP_INSTALLED_KEY = ['me', 'packs', 'shop', 'installed'] as const;

export type UnifiedPack = ShopPack & { readonly rawSlug: string };

const DOMAIN_KEYS: Readonly<Record<PackDomain, PlainStickerPacksKey>> = {
  sticker: 'packs.domain.sticker',
  'glory-frame': 'packs.domain.glory-frame',
  'capture-frame': 'packs.domain.capture-frame',
  wallpaper: 'packs.domain.wallpaper',
  'avatar-ring': 'packs.domain.avatar-ring',
  banner: 'packs.domain.banner',
  'banner-frame': 'packs.domain.banner-frame',
  lens: 'packs.domain.lens',
};


export const keyedPack = (pack: ShopPack): UnifiedPack => ({ ...pack, rawSlug: pack.slug, slug: `${pack.domain}:${pack.slug}` });

const ownedIn = (pack: UnifiedPack) => (list: unknown) =>
  Array.isArray(list)
    ? (list as readonly UnifiedPack[]).map((candidate) => (candidate.slug === pack.slug ? { ...candidate, owned: true, installed: true } : candidate))
    : list;

/**
 * Au geste, seule la liste affichée change (le retour arrière la rétablit) ; à la
 * confirmation, la possession vaut pour TOUS les filtres déjà en cache (le serveur
 * rend `owned: true, installed: true`) — revenu sur « Tout », un pack acheté n'est
 * plus à acheter ; les surfaces du domaine se revalident.
 */
const markOwned = (queryClient: QueryClient, filter: UnifiedFilter, pack: UnifiedPack, confirmed: boolean) => {
  if (!confirmed) {
    queryClient.setQueryData(shopKey(filter), ownedIn(pack));
    return;
  }
  queryClient.setQueriesData({ queryKey: SHOP_KEY_ROOT }, ownedIn(pack));
  void queryClient.invalidateQueries({ queryKey: packQueryKeys(pack.domain).installed });
  void queryClient.invalidateQueries({ queryKey: packQueryKeys(pack.domain).catalogue });
};

export const unifiedShopAdapter = (
  language: InterfaceLanguage,
  filter: UnifiedFilter,
  deps: ConversationsDeps,
  queryClient: QueryClient,
): PackShopAdapter<UnifiedPack> => ({
  domain: filter,
  catalogueKey: shopKey(filter),
  installedKey: SHOP_INSTALLED_KEY,
  loadCatalogue: async (signal) => {
    const result = await loadShop({ ...deps, signal }, filter === 'all' ? [] : [filter]);
    if (!result.ok) return result;
    if (result.data.balance !== null) queryClient.setQueryData(BALANCE_QUERY_KEY, result.data.balance);
    return { ok: true, data: result.data.packs.map(keyedPack) };
  },
  setInstalled: (pack, installed) => setShopPackInstalled(deps, pack.domain, pack.rawSlug, installed),
  applyInstalled: () => undefined,
  completeInstalled: async (pack) => (client) => {
    void client.invalidateQueries({ queryKey: packQueryKeys(pack.domain).installed });
    void client.invalidateQueries({ queryKey: packQueryKeys(pack.domain).catalogue });
  },
  title: (pack) => shopPackText(pack, language).name,
  description: (pack) => shopPackText(pack, language).description,
  meta: (pack) => [
    ...(pack.author === '' ? [] : [translateStickerPacks(language, 'stickerPacks.by', { author: pack.author })]),
    translateStickerPacks(language, DOMAIN_KEYS[pack.domain]),
  ],
  cover: (pack) =>
    pack.domain === 'sticker' && pack.builtin === true && isMeeBuiltinPack(pack.rawSlug) ? (
      <MeePackCover slug={pack.rawSlug} />
    ) : pack.coverUrl === null ? (
      <span aria-hidden className="block h-14 w-14 shrink-0 rounded-xl" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
    ) : (
      <img src={attachmentSrc(pack.coverUrl)} alt="" loading="lazy" decoding="async" className="block h-14 w-14 shrink-0 rounded-xl object-cover" />
    ),
  price: (pack) => pack.price,
  owned: (pack) => pack.owned,
  removable: (pack) => pack.removable,
  purchase: async (pack, requestId) => {
    const result = await purchasePack(deps, pack.domain, pack.rawSlug, requestId);
    return result.ok ? { ok: true, data: { balance: result.data.balance } } : result;
  },
  applyPurchased: (client, pack, confirmed) => {
    markOwned(client, filter, pack, confirmed !== null);
    if (confirmed === null || confirmed.balance === null) return;
    client.setQueryData(BALANCE_QUERY_KEY, confirmed.balance);
  },
});

export function UnifiedShop({
  language,
  initialDomain,
  deps = apiDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly initialDomain?: PackDomain | undefined;
  readonly deps?: ConversationsDeps;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<UnifiedFilter>(initialDomain ?? 'all');
  const adapter = useMemo(() => unifiedShopAdapter(language, filter, deps, queryClient), [language, filter, deps, queryClient]);
  const balance = useQuery<number | null>({ queryKey: BALANCE_QUERY_KEY, queryFn: () => null, enabled: false, staleTime: Infinity });
  const chips: readonly { readonly id: UnifiedFilter; readonly label: string }[] = [
    { id: 'all', label: translateStickerPacks(language, 'packs.shop.all') },
    ...PACK_DOMAINS.map((domain) => ({ id: domain, label: translateStickerPacks(language, DOMAIN_KEYS[domain]) })),
  ];

  return (
    <div data-unified-shop={filter} className="flex flex-col gap-3">
      {typeof balance.data === 'number' ? (
        <p data-shop-balance className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translateStickerPacks(language, 'packs.balance', { balance: String(balance.data) })}
        </p>
      ) : null}
      <div role="radiogroup" aria-label={translateStickerPacks(language, 'packs.shop.domains')} className="flex gap-2 overflow-x-auto pb-1">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="radio"
            aria-checked={chip.id === filter}
            data-shop-domain={chip.id}
            onClick={() => setFilter(chip.id)}
            className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold focus-visible:outline-2"
            style={{
              outlineColor: 'var(--color-ios-brand)',
              color: chip.id === filter ? 'var(--color-ios-on-brand)' : 'var(--color-ios-ink)',
              backgroundColor: chip.id === filter ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-ios-fill)',
            }}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <Suspense fallback={null}>
        <PackShop
          adapter={adapter}
          language={language}
          hint={translateStickerPacks(language, 'packs.shop.hint')}
          empty={translateStickerPacks(language, 'packs.shop.empty')}
        />
      </Suspense>
    </div>
  );
}
