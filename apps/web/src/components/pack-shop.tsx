import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import type { ApiResult } from '@/lib/api/http';
import { createPackGestureGuard } from '@/lib/api/packs';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

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
};

export function PackShop<P extends ShopPack>({
  adapter,
  language,
  hint,
  empty,
  footer,
}: {
  readonly adapter: PackShopAdapter<P>;
  readonly language: InterfaceLanguage;
  readonly hint: string;
  /** Ce que dit une boutique sans pack — un ancien serveur compris. */
  readonly empty?: string;
  readonly footer?: ReactNode;
}) {
  const queryClient = useQueryClient();
  const guard = useRef(createPackGestureGuard());
  const [failed, setFailed] = useState(false);
  const [flying, setFlying] = useState<ReadonlySet<string>>(new Set());

  const catalogue = useQuery({
    queryKey: adapter.catalogueKey,
    queryFn: async ({ signal }) => {
      const result = await adapter.loadCatalogue(signal);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggle = async (pack: P) => {
    if (!guard.current.tryBegin(pack.slug)) return;
    setFlying((current) => new Set([...current, pack.slug]));
    const next = !pack.installed;
    const beforeCatalogue = queryClient.getQueryData(adapter.catalogueKey);
    const beforeInstalled = queryClient.getQueryData(adapter.installedKey);
    setFailed(false);
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
      setFailed(true);
      return;
    }
    complete?.(queryClient);
  };

  const packs = (catalogue.data ?? []) as readonly P[];
  const notice = failed
    ? translateStickerPacks(language, 'stickerPacks.error.install')
    : catalogue.isError
      ? translateStickerPacks(language, 'stickerPacks.error.load')
      : '';

  return (
    <div data-pack-shop={adapter.domain} className="flex flex-col gap-4">
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {hint}
      </p>
      <p className="text-caption empty:hidden" role="status" aria-live="polite" style={{ color: 'var(--ios-error)' }}>
        {notice}
      </p>

      {catalogue.isSuccess && packs.length === 0 && empty !== undefined ? (
        <p data-pack-shop-empty className="py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-busy={catalogue.isPending}>
          {packs.map((pack) => {
            const title = adapter.title(pack);
            const action = translateStickerPacks(language, pack.installed ? 'stickerPacks.uninstall' : 'stickerPacks.install');
            return (
              <li key={pack.slug} data-shop-pack={pack.slug} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                {adapter.cover(pack)}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h3 className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                    {title}
                  </h3>
                  <p className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {adapter.description(pack)}
                  </p>
                  <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
                    {adapter.meta(pack).join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  data-shop-toggle={pack.slug}
                  aria-pressed={pack.installed}
                  aria-busy={flying.has(pack.slug)}
                  aria-label={`${action} ${title}`}
                  onClick={() => void toggle(pack)}
                  className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold"
                  style={
                    pack.installed
                      ? { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }
                      : { backgroundColor: 'var(--accent, var(--color-ios-brand))', color: 'var(--color-ios-on-brand)' }
                  }
                >
                  {action}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {footer}
    </div>
  );
}
