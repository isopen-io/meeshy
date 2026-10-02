import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useState } from 'react';

import type { StickerPackDetail, StickerPackSummary } from '@meeshy/shared/types/sticker-pack';

import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
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
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { PlainStickerPacksKey } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { meeStickersOfPack } from '@/lib/mee/catalog';
import { renderMeeSticker } from '@/lib/mee/render';
import { isMeeBuiltinPack } from '@/lib/mee/types';

/**
 * **LA BOUTIQUE DE STICKERS** (#9141) — le dernier onglet de la feuille.
 * L'utilisateur y DÉCIDE quels packs il voit : Mee, Meo, Mee & Meo et les
 * packs des tiers validés par la modération s'installent et se retirent d'un
 * geste. Le geste écrit les deux caches au toucher (catalogue et onglets), le
 * réseau confirme, un refus rétablit l'état d'avant et le DIT.
 *
 * En bas, « Proposer un pack » ouvre l'éditeur (`sticker-pack-submit`) et
 * « Mes propositions » dit où en est chacune : en attente, publiée, refusée
 * avec le mot du modérateur.
 */

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

export function StickerShop({ language }: { readonly language: InterfaceLanguage }) {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const catalogue = useQuery({
    queryKey: PACK_CATALOGUE_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadPackCatalogue({ ...apiDeps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: PACKS_STALE_TIME,
  });

  const submissions = useQuery({
    queryKey: PACK_SUBMISSIONS_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await loadMySubmissions({ ...apiDeps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: PACKS_STALE_TIME,
  });

  const detailOf = async (pack: StickerPackSummary): Promise<StickerPackDetail | null> => {
    if (pack.builtin) return builtinPackDetail(pack.slug, true);
    const result = await loadPack(apiDeps, pack.slug);
    return result.ok ? { ...result.data, installed: true } : null;
  };

  const toggle = async (pack: StickerPackSummary) => {
    const next = !pack.installed;
    const beforeCatalogue = queryClient.getQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY);
    const beforeInstalled = queryClient.getQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY);
    setFailed(false);
    queryClient.setQueryData<readonly StickerPackSummary[]>(PACK_CATALOGUE_QUERY_KEY, (list) =>
      (list ?? []).map((candidate) => (candidate.slug === pack.slug ? { ...candidate, installed: next } : candidate)),
    );
    const detail = next ? (pack.builtin ? builtinPackDetail(pack.slug, true) : null) : null;
    queryClient.setQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY, (list) => {
      const others = (list ?? []).filter((candidate) => candidate.slug !== pack.slug);
      return detail === null ? others : [...others, detail];
    });
    const [result, loaded] = await Promise.all([setPackInstalled(apiDeps, pack.slug, next), next && !pack.builtin ? detailOf(pack) : Promise.resolve(null)]);
    if (!result.ok) {
      queryClient.setQueryData(PACK_CATALOGUE_QUERY_KEY, beforeCatalogue);
      queryClient.setQueryData(INSTALLED_PACKS_QUERY_KEY, beforeInstalled);
      setFailed(true);
      return;
    }
    if (loaded !== null) {
      queryClient.setQueryData<readonly StickerPackDetail[]>(INSTALLED_PACKS_QUERY_KEY, (list) => [
        ...(list ?? []).filter((candidate) => candidate.slug !== pack.slug),
        loaded,
      ]);
    }
  };

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

  const packs = catalogue.data ?? [];
  const mine = submissions.data ?? [];

  return (
    <div data-sticker-shop className="flex flex-col gap-4">
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateStickerPacks(language, 'stickerPacks.shop.hint')}
      </p>
      <p className="text-caption" role="status" aria-live="polite" style={{ color: 'var(--ios-error)' }}>
        {failed ? translateStickerPacks(language, 'stickerPacks.error.install') : catalogue.isError ? translateStickerPacks(language, 'stickerPacks.error.load') : ''}
      </p>

      <ul className="flex flex-col gap-2" aria-busy={catalogue.isPending}>
        {packs.map((pack) => (
          <li
            key={pack.slug}
            data-shop-pack={pack.slug}
            className="flex items-center gap-3 rounded-2xl p-3"
            style={{ backgroundColor: 'var(--color-ios-card)' }}
          >
            <PackCover pack={pack} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h3 className="truncate text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                {pack.name}
              </h3>
              <p className="line-clamp-2 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {pack.description}
              </p>
              <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
                {[
                  translateStickerPacks(language, 'stickerPacks.by', { author: pack.author }),
                  translateStickerPacks(language, 'stickerPacks.count', { count: String(countOf(pack)) }),
                  ...pack.kinds.map((kind) => translateStickerPacks(language, KIND_KEYS[kind])),
                ].join(' · ')}
              </p>
            </div>
            <button
              type="button"
              data-shop-toggle={pack.slug}
              aria-pressed={pack.installed}
              aria-label={`${translateStickerPacks(language, pack.installed ? 'stickerPacks.uninstall' : 'stickerPacks.install')} ${pack.name}`}
              onClick={() => void toggle(pack)}
              className="min-h-11 shrink-0 rounded-full px-4 text-body font-semibold"
              style={
                pack.installed
                  ? { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }
                  : { backgroundColor: 'var(--accent)', color: 'var(--color-ios-on-brand)' }
              }
            >
              {translateStickerPacks(language, pack.installed ? 'stickerPacks.uninstall' : 'stickerPacks.install')}
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-shop-submit
        onClick={() => setSubmitting(true)}
        className="min-h-11 self-start rounded-full px-4 text-body font-semibold"
        style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--color-ios-ink)' }}
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
    </div>
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
  return pack.coverUrl === null ? (
    <span aria-hidden className={box} style={{ backgroundColor: 'var(--color-ios-fill)' }} />
  ) : (
    <img src={attachmentSrc(pack.coverUrl)} alt="" loading="lazy" decoding="async" className={`${box} object-contain`} />
  );
}
