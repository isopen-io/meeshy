import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { ApiResult } from '@/lib/api/http';
import { createPackGestureGuard, newPurchaseRequestId } from '@/lib/api/packs';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { unlockText } from '@/lib/packs/unlock-texts';

/**
 * **LA BOUTIQUE DE PACKS, UNE POUR TOUS LES DOMAINES** (#10149, LP1) — la
 * Boutique des stickers (#9141) devenue générique : une liste de packs, chacun
 * avec sa couverture, son nom, ce qu'il pèse et « Installer » / « Retirer ».
 * Un domaine s'y branche par un ADAPTATEUR (`PackShopAdapter`) : où lire la
 * boutique, comment installer, comment écrire la liste des packs installés
 * (qui porte les ONGLETS de la feuille de stickers ou de l'étagère de cadres).
 *
 * Le geste est OPTIMISTE : la boutique et la liste des installés s'écrivent au
 * toucher, le réseau confirme, un refus rétablit l'état d'avant et le DIT.
 * Un geste en vol par pack : un double toucher ne part qu'une fois.
 *
 * Chargée à la demande seulement (budget `pack_shop`, `dynamic_only`).
 */

export type ShopPack = { readonly slug: string; readonly installed: boolean };

/** Méthodes en notation courte : un adaptateur d'un domaine précis se passe là où la boutique attend `ShopPack`. */
export type PackShopAdapter<P extends ShopPack> = {
  readonly domain: string;
  readonly catalogueKey: readonly unknown[];
  readonly installedKey: readonly unknown[];
  loadCatalogue(signal: AbortSignal): Promise<ApiResult<readonly P[]>>;
  setInstalled(pack: P, installed: boolean): Promise<ApiResult<unknown>>;
  /** Écrit la liste des installés AU GESTE — l'onglet du pack apparaît ou disparaît sans attendre le réseau. */
  applyInstalled(queryClient: QueryClient, pack: P, installed: boolean): void;
  /** Ce qui complète le geste une fois confirmé (le contenu d'un pack installé), lancé en même temps que lui. */
  completeInstalled?(pack: P, installed: boolean): Promise<((queryClient: QueryClient) => void) | null>;
  title(pack: P): string;
  description(pack: P): string;
  meta(pack: P): readonly string[];
  cover(pack: P): ReactNode;
  /** Ce qui MONTRE le pack sans l'installer, sous sa rangée (l'atlas des vignettes d'un pack de cadres, #10275) ; `null` ou absent : rien. */
  preview?(pack: P): ReactNode;
  /** En Meeshes ; `null` ou absent = gratuit. Affichage seulement. */
  price?(pack: P): number | null;
  /** La possession lue au serveur (`owned`) ; absent = possédé. Le client ne la décide jamais. */
  owned?(pack: P): boolean;
  /** `false` = pack inclus que le serveur refuse de retirer : aucun geste « Retirer » ne s'offre. Absent = retirable. */
  removable?(pack: P): boolean;
  /** L'achat d'un pack payant non possédé ; `requestId` est généré au geste et réutilisé au nouvel essai. */
  purchase?(pack: P, requestId: string): Promise<ApiResult<{ readonly balance: number | null }>>;
  /**
   * Écrit la possession : AU GESTE (`confirmed === null`, le pack passe possédé sans attendre le réseau),
   * puis à la confirmation du serveur (`{ balance }`, `null` si le serveur ne l'a pas dit).
   */
  applyPurchased?(queryClient: QueryClient, pack: P, confirmed: { readonly balance: number | null } | null): void;
  /** Ce qui reste à débloquer, en une ligne (W18) ; `null` ou absent = rien à dire. */
  unlock?(pack: P): string | null;
  /** `true` = le pack n'est pas encore débloqué : ni « Installer » ni « Acheter » ne s'offrent (le serveur refuserait). */
  locked?(pack: P): boolean;
  /**
   * Le geste qui REMPLACE « Retirer » sur un pack installé que le compte tient en place (l'atmosphère choisie, #10163 PP7) ;
   * `null` ou absent : le geste ordinaire.
   */
  swap?(pack: P): { readonly label: string; readonly run: () => void } | null;
  /** Ce que dit un retrait refusé (409) de ce pack ; absent : « ce pack reste installé ». */
  keptText?(pack: P): string;
};

type Notice = 'install' | 'insufficient' | 'purchase' | { readonly kept: string } | null;

/** Un retrait que le serveur refuse (409) n'est pas une panne : le pack reste, et cela se dit. */
const isKept = (failure: { readonly status: number }, installing: boolean): boolean => !installing && failure.status === 409;

/** Les rangées fantômes du premier chargement (cache vide) — jamais au-dessus d'un cache. */
const SKELETON_ROWS = [0, 1, 2] as const;

/** Un refus définitif oublie son `requestId` ; une panne réseau ou serveur le GARDE pour le nouvel essai. */
const isRetryable = (failure: { readonly status: number; readonly code?: string }): boolean =>
  failure.status === 0 || failure.status >= 500 || failure.code === 'TIMEOUT';

export function PackShop<P extends ShopPack>({
  adapter,
  language,
  hint,
  empty,
  footer,
  focusSlug,
}: {
  readonly adapter: PackShopAdapter<P>;
  readonly language: InterfaceLanguage;
  readonly hint: string;
  /** Ce que dit une boutique sans pack — un ancien serveur compris. */
  readonly empty?: string;
  readonly footer?: ReactNode;
  /** Le pack à mettre en avant (#10703) — lien profond depuis la fiche d'un sticker : la rangée se centre et se marque. */
  readonly focusSlug?: string | undefined;
}) {
  const queryClient = useQueryClient();
  const guard = useRef(createPackGestureGuard());
  const [failure, setFailure] = useState<Notice>(null);
  const requestIds = useRef(new Map<string, string>());
  const [flying, setFlying] = useState<ReadonlySet<string>>(new Set());

  const catalogue = useQuery({
    queryKey: adapter.catalogueKey,
    queryFn: async ({ signal }) => {
      const result = await adapter.loadCatalogue(signal);
      if (!result.ok) throw new ApiError(result);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const unlockOf = (pack: P): string | null => adapter.unlock?.(pack) ?? null;
  const needsPurchase = (pack: P): boolean =>
    adapter.purchase !== undefined && (adapter.price?.(pack) ?? null) !== null && adapter.owned?.(pack) === false;

  const buy = async (pack: P) => {
    const purchase = adapter.purchase;
    if (purchase === undefined || !guard.current.tryBegin(pack.slug)) return;
    setFlying((current) => new Set([...current, pack.slug]));
    const requestId = requestIds.current.get(pack.slug) ?? newPurchaseRequestId();
    requestIds.current.set(pack.slug, requestId);
    const beforeCatalogue = queryClient.getQueryData(adapter.catalogueKey);
    const beforeInstalled = queryClient.getQueryData(adapter.installedKey);
    setFailure(null);
    adapter.applyPurchased?.(queryClient, pack, null);
    const result = await purchase(pack, requestId);
    guard.current.end(pack.slug);
    setFlying((current) => new Set([...current].filter((slug) => slug !== pack.slug)));
    if (!result.ok && result.code === 'PACK_ALREADY_OWNED') {
      requestIds.current.delete(pack.slug);
      adapter.applyPurchased?.(queryClient, pack, { balance: null });
      return;
    }
    if (!result.ok) {
      if (!isRetryable(result)) requestIds.current.delete(pack.slug);
      queryClient.setQueryData(adapter.catalogueKey, beforeCatalogue);
      queryClient.setQueryData(adapter.installedKey, beforeInstalled);
      setFailure(result.code === 'INSUFFICIENT_MEESHES' ? 'insufficient' : 'purchase');
      return;
    }
    requestIds.current.delete(pack.slug);
    adapter.applyPurchased?.(queryClient, pack, { balance: result.data.balance });
  };

  const toggle = async (pack: P) => {
    if (needsPurchase(pack)) return buy(pack);
    if (!guard.current.tryBegin(pack.slug)) return;
    setFlying((current) => new Set([...current, pack.slug]));
    const next = !pack.installed;
    const beforeCatalogue = queryClient.getQueryData(adapter.catalogueKey);
    const beforeInstalled = queryClient.getQueryData(adapter.installedKey);
    setFailure(null);
    queryClient.setQueryData<readonly P[]>(adapter.catalogueKey, (list) =>
      (list ?? []).map((candidate) => (candidate.slug === pack.slug ? { ...candidate, installed: next } : candidate)),
    );
    adapter.applyInstalled(queryClient, pack, next);
    const [result, complete] = await Promise.all([
      adapter.setInstalled(pack, next),
      adapter.completeInstalled === undefined ? Promise.resolve(null) : adapter.completeInstalled(pack, next).catch(() => null),
    ]);
    guard.current.end(pack.slug);
    setFlying((current) => new Set([...current].filter((slug) => slug !== pack.slug)));
    if (!result.ok) {
      queryClient.setQueryData(adapter.catalogueKey, beforeCatalogue);
      queryClient.setQueryData(adapter.installedKey, beforeInstalled);
      setFailure(isKept(result, next) ? { kept: adapter.keptText?.(pack) ?? translateStickerPacks(language, 'packs.error.notRemovable') } : 'install');
      return;
    }
    complete?.(queryClient);
  };

  const packs = (catalogue.data ?? []) as readonly P[];
  const focusedRow = useRef<HTMLLIElement | null>(null);
  const focusPresent = focusSlug !== undefined && packs.some((pack) => pack.slug === focusSlug);
  useEffect(() => {
    if (focusPresent) focusedRow.current?.scrollIntoView?.({ block: 'center' });
  }, [focusPresent, focusSlug]);
  const kept = typeof failure === 'object' && failure !== null;
  const notice =
    kept
      ? failure.kept
      : failure === 'insufficient'
      ? translateStickerPacks(language, 'packs.error.insufficient')
      : failure === 'purchase'
        ? translateStickerPacks(language, 'packs.error.purchase')
        : failure === 'install'
          ? translateStickerPacks(language, 'stickerPacks.error.install')
          : catalogue.isError
      ? translateStickerPacks(language, 'stickerPacks.error.load')
      : '';

  return (
    <div data-pack-shop={adapter.domain} className="flex flex-col gap-4">
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {hint}
      </p>
      <p className="text-caption empty:hidden" role="status" aria-live="polite" style={{ color: kept ? 'var(--color-ios-ink-2)' : 'var(--ios-error)' }}>
        {notice}
      </p>

      {catalogue.isError && catalogue.data === undefined ? (
        <button
          type="button"
          data-pack-shop-retry
          onClick={() => void catalogue.refetch()}
          className="min-h-11 self-start rounded-full px-4 text-body font-semibold focus-visible:outline-2"
          style={{ outlineColor: 'var(--color-ios-brand)', backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
        >
          {translateStickerPacks(language, 'packs.retry')}
        </button>
      ) : null}

      {catalogue.isPending && catalogue.data === undefined ? (
        <ul className="flex flex-col gap-2" aria-busy>
          {SKELETON_ROWS.map((row) => (
            <li key={row} data-pack-shop-skeleton aria-hidden="true" className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
              <span className="block h-14 w-14 shrink-0 animate-pulse rounded-xl motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="block h-4 w-2/5 animate-pulse rounded motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
                <span className="block h-3 w-3/5 animate-pulse rounded motion-reduce:animate-none" style={{ backgroundColor: 'var(--color-ios-fill)' }} />
              </span>
            </li>
          ))}
        </ul>
      ) : catalogue.isSuccess && packs.length === 0 && empty !== undefined ? (
        <p data-pack-shop-empty className="py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-busy={catalogue.isPending}>
          {packs.map((pack) => {
            const title = adapter.title(pack);
            const price = adapter.price?.(pack) ?? null;
            const toBuy = needsPurchase(pack);
            const swap = pack.installed && !toBuy ? (adapter.swap?.(pack) ?? null) : null;
            const action = toBuy
              ? translateStickerPacks(language, 'packs.buy', { price: String(price) })
              : translateStickerPacks(language, pack.installed ? 'stickerPacks.uninstall' : 'stickerPacks.install');
            return (
              <li
                key={pack.slug}
                data-shop-pack={pack.slug}
                {...(pack.slug === focusSlug ? { 'data-shop-pack-focused': '', 'aria-current': 'true' as const, ref: focusedRow } : {})}
                className="flex flex-col gap-2 rounded-2xl p-3"
                style={{ backgroundColor: 'var(--color-ios-card)', ...(pack.slug === focusSlug ? { outline: '2px solid var(--accent, var(--color-ios-brand))' } : {}) }}
              >
                <div className="flex items-center gap-3">
                  {adapter.cover(pack)}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <h3 className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                      {title}
                    </h3>
                    <p className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                      {adapter.description(pack)}
                    </p>
                    {unlockOf(pack) === null ? null : (
                      <p data-shop-unlock className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                        {unlockOf(pack)}
                      </p>
                    )}
                    <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
                      {[...adapter.meta(pack), ...(price === null ? [] : [adapter.owned?.(pack) === false ? translateStickerPacks(language, 'packs.price', { price: String(price) }) : translateStickerPacks(language, 'packs.owned')])].join(' · ')}
                    </p>
                  </div>
                  {adapter.locked?.(pack) === true && !pack.installed ? (
                    <span data-shop-locked={pack.slug} className="shrink-0 px-4 text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                      {unlockText(language, 'locked')}
                    </span>
                  ) : swap !== null ? (
                    <button
                      type="button"
                      data-shop-swap={pack.slug}
                      aria-label={`${swap.label} — ${title}`}
                      onClick={swap.run}
                      className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold"
                      style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
                    >
                      {swap.label}
                    </button>
                  ) : pack.installed && !toBuy && adapter.removable?.(pack) === false ? (
                    <span data-shop-included={pack.slug} className="shrink-0 px-4 text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
                      {translateStickerPacks(language, 'packs.included')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-shop-toggle={pack.slug}
                      {...(toBuy ? {} : { 'aria-pressed': pack.installed })}
                      data-shop-buy={toBuy ? pack.slug : undefined}
                      aria-busy={flying.has(pack.slug)}
                      aria-label={`${action} ${title}`}
                      onClick={() => void toggle(pack)}
                      className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold"
                      style={
                        pack.installed && !toBuy
                          ? { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }
                          : { backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }
                      }
                    >
                      {action}
                    </button>
                  )}
                </div>
                {adapter.preview?.(pack) ?? null}
              </li>
            );
          })}
        </ul>
      )}
      {footer}
    </div>
  );
}
