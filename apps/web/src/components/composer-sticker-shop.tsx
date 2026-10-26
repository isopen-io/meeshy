import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';

import { stickerPackText } from '@meeshy/shared/types/sticker-pack';
import type { StickerPackDetail, StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import type { PackShopAdapter } from './pack-shop';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import {
  INSTALLED_PACKS_QUERY_KEY,
  PACKS_STALE_TIME,
  PACK_CATALOGUE_QUERY_KEY,
  PACK_SUBMISSIONS_QUERY_KEY,
  builtinPackDetail,
  loadMySubmissions,
  loadPack,
  loadPackCatalogue,
  setPackInstalled,
} from '@/lib/api/sticker-packs';
import { purchasePack } from '@/lib/api/packs-shop';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { PlainStickerPacksKey } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { meeStickersOfPack } from '@/lib/mee/catalog';
import { renderMeeSticker } from '@/lib/mee/render';
import { isMeeBuiltinPack } from '@/lib/mee/types';
import { mediaImageCrossOrigin } from '@/lib/net/api-runtime-cache';
import { stickerPackCoverSrc } from '@/lib/sticker-packs/src';

/**
 * **LA BOUTIQUE DE STICKERS** (#9141) — le dernier onglet de la feuille.
 * L'utilisateur y DÉCIDE quels packs il voit : Mee, Meo, Mee & Meo et les
 * packs des tiers validés par la modération s'installent et se retirent d'un
 * geste. Le geste écrit les deux caches au toucher (catalogue et onglets), le
 * réseau confirme, un refus rétablit l'état d'avant et le DIT.
 *
 * La liste elle-même est la boutique GÉNÉRIQUE (`pack-shop.tsx`, #10149) :
 * ce module n'en garde que l'adaptateur des stickers (`stickerShopAdapter`).
 * Un pack d'un tiers installé reçoit son onglet AU GESTE, avec un contenu
 * vide que le détail remplit quand il arrive — et qu'il GARDE si le détail ne
 * se lit pas : l'installation a réussi, l'onglet ne disparaît pas.
 *
 * En bas, « Proposer un pack » ouvre l'éditeur (`sticker-pack-submit`) et
 * « Mes propositions » dit où en est chacune : en attente, publiée, refusée
 * avec le mot du modérateur.
 */

const PackShop = lazy(() => import('./pack-shop').then((m) => ({ default: m.PackShop })));
const PackSubmitEditor = lazy(() => import('./sticker-pack-submit').then((m) => ({ default: m.PackSubmitEditor })));

const KIND_KEYS: Readonly<Record<StickerPackSummary['kinds'][number], PlainStickerPacksKey>> = {
  static: 'stickerPacks.kind.static',
  cinematic: 'stickerPacks.kind.cinematic',
  instant: 'stickerPacks.kind.instant',
};

const STATUS_KEYS: Readonly<Record<StickerPackSummary['status'], PlainStickerPacksKey>> = {
  pending: 'stickerPacks.status.pending',
  approved: 'stickerPacks.status.approved',
  rejected: 'stickerPacks.status.rejected',
};

/** Le nombre de stickers d'un pack : celui du serveur, ou celui du catalogue local pour un pack intégré. */
const countOf = (pack: StickerPackSummary): number => (isMeeBuiltinPack(pack.slug) ? meeStickersOfPack(pack.slug).length : pack.itemCount);

const FALLBACK = <p className="py-6 text-center text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>…</p>;

/** Le contenu d'un pack d'un tiers tant que son détail n'est pas arrivé : son onglet existe, ses stickers suivent. */
const pendingDetail = (pack: StickerPackSummary): StickerPackDetail => ({ ...pack, installed: true, items: [] });

const installedEntryOf = (pack: StickerPackSummary): StickerPackDetail | null => (pack.builtin ? builtinPackDetail(pack.slug, true) : pendingDetail(pack));

const writeInstalled = (queryClient: QueryClient, slug: string, entry: StickerPackDetail | null) =>
  queryClient.setQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY, (list) => {
    const others = (list ?? []).filter((candidate) => candidate.slug !== slug);
    return entry === null ? others : [...others, entry];
  });

/** L'adaptateur des stickers pour la boutique générique — adresses `/sticker-packs`, clés de cache historiques. */
export const stickerShopAdapter = (language: InterfaceLanguage, deps: ConversationsDeps = apiDeps): PackShopAdapter<StickerPackSummary> => ({
  domain: 'sticker',
  catalogueKey: PACK_CATALOGUE_QUERY_KEY,
  installedKey: INSTALLED_PACKS_QUERY_KEY,
  loadCatalogue: (signal) => loadPackCatalogue({ ...deps, signal }),
  setInstalled: (pack, installed) => setPackInstalled(deps, pack.slug, installed),
  applyInstalled: (queryClient, pack, installed) => writeInstalled(queryClient, pack.slug, installed ? installedEntryOf(pack) : null),
  completeInstalled: async (pack, installed) => {
    if (!installed || pack.builtin) return null;
    const result = await loadPack(deps, pack.slug);
    if (!result.ok) return null;
    const detail: StickerPackDetail = { ...result.data, installed: true };
    return (queryClient) => writeInstalled(queryClient, pack.slug, detail);
  },
  price: (pack) => pack.price ?? null,
  owned: (pack) => pack.owned ?? true,
  purchase: async (pack, requestId) => {
    const result = await purchasePack(deps, 'sticker', pack.slug, requestId);
    return result.ok ? { ok: true, data: { balance: result.data.balance } } : result;
  },
  applyPurchased: (queryClient, pack, confirmed) => {
    queryClient.setQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY, (list) =>
      (list ?? []).map((candidate) => (candidate.slug === pack.slug ? { ...candidate, owned: true, installed: true } : candidate)),
    );
    if (confirmed === null) return;
    void queryClient.invalidateQueries({ queryKey: INSTALLED_PACKS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: PACK_CATALOGUE_QUERY_KEY });
  },
  title: (pack) => stickerPackText(pack, language).name,
  description: (pack) => stickerPackText(pack, language).description,
  meta: (pack) => [
    translateStickerPacks(language, 'stickerPacks.by', { author: pack.author }),
    translateStickerPacks(language, 'stickerPacks.count', { count: String(countOf(pack)) }),
    ...pack.kinds.map((kind) => translateStickerPacks(language, KIND_KEYS[kind])),
  ],
  cover: (pack) => <PackCover pack={pack} />,
});

export function StickerShop({ language, focusSlug }: { readonly language: InterfaceLanguage; readonly focusSlug?: string | undefined }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const submissions = useQuery({
    queryKey: PACK_SUBMISSIONS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadMySubmissions({ ...apiDeps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: PACKS_STALE_TIME,
  });

  if (submitting) {
    return (
      <Suspense fallback={FALLBACK}>
        <PackSubmitEditor
          language={language}
          onClose={() => setSubmitting(false)}
          onSubmitted={(pack) => {
            queryClient.setQueryData<readonly StickerPackDetail[]>(PACK_SUBMISSIONS_QUERY_KEY, (list) => [
              pack,
              ...(list ?? []).filter((candidate) => candidate.slug !== pack.slug),
            ]);
            setSubmitting(false);
          }}
        />
      </Suspense>
    );
  }

  const mine = submissions.data ?? [];

  return (
    <div data-sticker-shop>
      <Suspense fallback={FALLBACK}>
        <PackShop
          adapter={stickerShopAdapter(language)}
          language={language}
          focusSlug={focusSlug}
          hint={translateStickerPacks(language, 'stickerPacks.shop.hint')}
          footer={<SubmissionsFooter language={language} mine={mine} onSubmit={() => setSubmitting(true)} />}
        />
      </Suspense>
    </div>
  );
}

function SubmissionsFooter({
  language,
  mine,
  onSubmit,
}: {
  readonly language: InterfaceLanguage;
  readonly mine: readonly StickerPackDetail[];
  readonly onSubmit: () => void;
}) {
  return (
    <>
      <button
        type="button"
        data-shop-submit
        onClick={onSubmit}
        className="min-h-11 self-start rounded-full px-4 text-body font-semibold"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent, var(--color-ios-brand)) 14%, transparent)', color: 'var(--color-ios-ink)' }}
      >
        {translateStickerPacks(language, 'stickerPacks.submit.open')}
      </button>
      {mine.length > 0 ? (
        <section data-shop-submissions className="flex flex-col gap-2">
          <h3 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {translateStickerPacks(language, 'stickerPacks.mine.title')}
          </h3>
          <ul className="flex flex-col gap-2">
            {mine.map((pack) => (
              <li key={pack.slug} data-submission={pack.slug} data-status={pack.status} className="flex flex-col gap-0.5 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-body" style={{ color: 'var(--color-ios-ink)' }}>
                    {pack.name}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 text-caption"
                    style={{ color: pack.status === 'rejected' ? 'var(--ios-error)' : 'var(--color-ios-ink-2)', backgroundColor: 'var(--color-ios-fill)' }}
                  >
                    {translateStickerPacks(language, STATUS_KEYS[pack.status])}
                  </span>
                </div>
                {pack.reviewNote ? (
                  <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {pack.reviewNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** La vignette d'un pack : son premier Mee pour un pack intégré, l'image de couverture servie sinon. */
function PackCover({ pack }: { readonly pack: StickerPackSummary }) {
  const box = 'block h-14 w-14 shrink-0 rounded-xl';
  if (isMeeBuiltinPack(pack.slug)) {
    const first = meeStickersOfPack(pack.slug)[0];
    return first === undefined ? (
      <span aria-hidden className={box} />
    ) : (
      <span aria-hidden className={box} dangerouslySetInnerHTML={{ __html: renderMeeSticker(first, { uid: `shop-${pack.slug}`, animated: false }) }} />
    );
  }
  const cover = stickerPackCoverSrc(pack);
  return cover === null ? (
    <span aria-hidden className={box} style={{ backgroundColor: 'var(--color-ios-fill)' }} />
  ) : (
    <img src={cover} alt="" loading="lazy" decoding="async" crossOrigin={mediaImageCrossOrigin(cover)} className={`${box} object-contain`} />
  );
}
