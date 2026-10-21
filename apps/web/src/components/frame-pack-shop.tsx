import { useQuery } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { describeFrameUsage, type FrameMomentFamily, type FrameUsage } from '@meeshy/shared/types/frame-usage';
import { parseGloryFramePackContract, parsePackStrings, type GloryFramePackFrame, type PackStrings } from '@meeshy/shared/types/glory-frame-pack';
import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { AchievementRarity, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';

import type { PackShopAdapter } from './pack-shop';
import { apiConfig } from '@/lib/api/config';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { packQueryKeys } from '@/lib/api/pack-query-keys';
import {
  loadFramePack,
  loadFramePackCatalogue,
  loadInstalledFramePacks,
  setFramePackInstalled,
  type FramePackDetail,
  type FramePackSummary,
} from '@/lib/api/packs-glory-frame';
import { frameUsageText, loadFrameUsageCatalog } from '@/lib/i18n-frame-usage-catalog';
import { loadGameCatalogParts, translateGame, type GameCatalogKey } from '@/lib/i18n-game-catalog';
import { translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PackAssetStoreDeps } from '@/lib/packs/pack-asset-store';

/**
 * **LA BOUTIQUE DES CADRES DU JEU** (#10149, LP1 — demande porteur
 * 2026-10-11 : « Pareil pour la boutique de frames ») — la jumelle de la
 * Boutique des stickers, sur la boutique GÉNÉRIQUE (`pack-shop.tsx`) :
 * `packs.gloryFrame` liste les packs (couverture, nom dans la langue
 * de l'interface, poids à télécharger), « Installer » / « Retirer » est
 * optimiste, et chaque pack INSTALLÉ devient un ONGLET qui montre ses cadres.
 *
 * Un cadre montre sa vignette (lue en CORS sur `packAssets.byFile`, SHA-256
 * vérifié, rangée dans le seau `meeshy-pack-assets`), son nom (les chaînes du
 * pack dans la langue du lecteur, sinon le français) et OÙ il s'utilise
 * (`describeFrameUsage`, loi d'usage #10146). Un contrat d'une version
 * inconnue ne télécharge rien et dit « Mettre à jour Meeshy ». Un ancien
 * serveur (404 sur `/packs/…`) rend une boutique vide, sans erreur.
 */

const PackShop = lazy(() => import('./pack-shop').then((m) => ({ default: m.PackShop })));

const FRAME_KEYS = packQueryKeys('glory-frame');
const STALE_TIME = 5 * 60 * 1000;
const SHOP_TAB = 'shop';

/** Les libellés que ce module lit : usage des cadres, noms des rangs, des raretés et des familles de moments, boutique. À attendre avant le premier rendu. */
export const prepareFramePackShop = (language: InterfaceLanguage): Promise<unknown> =>
  Promise.all([loadFrameUsageCatalog(language), loadGameCatalogParts(language, ['banner', 'core'])]);

const RANK_KEYS = {
  murmure: 'game.rank.murmure',
  echo: 'game.rank.echo',
  voix: 'game.rank.voix',
  conteur: 'game.rank.conteur',
  passeur: 'game.rank.passeur',
  polyglotte: 'game.rank.polyglotte',
  ambassadeur: 'game.rank.ambassadeur',
  orateur: 'game.rank.orateur',
  oracle: 'game.rank.oracle',
  legende: 'game.rank.legende',
  mythe: 'game.rank.mythe',
} as const satisfies Readonly<Record<GloryRankOrMythic, GameCatalogKey>>;

const RARITY_KEYS = {
  common: 'game.rarity.common',
  rare: 'game.rarity.rare',
  epic: 'game.rarity.epic',
  legendary: 'game.rarity.legendary',
  mythic: 'game.rarity.mythic',
} as const satisfies Readonly<Record<AchievementRarity, GameCatalogKey>>;

const FAMILY_KEYS = {
  tier: 'game.frame.family.tier',
  meesh: 'game.frame.family.meesh',
  treasury: 'game.frame.family.treasury',
  flame: 'game.frame.family.flame',
  day: 'game.frame.family.day',
  'level-100': 'game.frame.family.level-100',
} as const satisfies Readonly<Record<FrameMomentFamily, GameCatalogKey>>;

const usageNames = (language: InterfaceLanguage, usage: FrameUsage): Readonly<Record<string, string>> => {
  if (usage.kind === 'rank') return { rank: translateGame(language, RANK_KEYS[usage.rank]) };
  if (usage.kind === 'achievement' && usage.rarity !== undefined) return { rarity: translateGame(language, RARITY_KEYS[usage.rarity]) };
  if (usage.kind === 'moment') return { family: translateGame(language, FAMILY_KEYS[usage.family]) };
  return {};
};

/** « Rang Ambassadeur IV uniquement », « Succès Légendaire uniquement », « Moment « Niveau 100 » uniquement » — la loi choisit la clé, le rang, la rareté et la famille reçoivent leur nom traduit (les mots d'iOS, #10273). */
export const usageText = (language: InterfaceLanguage, usage: FrameUsage): string => frameUsageText(language, describeFrameUsage(usage), usageNames(language, usage));

/**
 * L'origine de la passerelle : celle de la base d'API résolue. Une base
 * malformée ne retombe JAMAIS sur l'origine de la PAGE — dans la coque
 * Capacitor elle vaudrait `https://localhost`, une origine qui composerait
 * une adresse d'actif FAUSSE plutôt qu'absente (#8385, même loi que
 * `webOriginOf`) ; `onOrigin`/`urlOf` dégradent déjà proprement sur une
 * origine vide.
 */
const apiOrigin = (): string => {
  try {
    return new URL(apiConfig.base === '' ? location.href : apiConfig.base, location.href).origin;
  } catch {
    return '';
  }
};

/** Une adresse relative de la passerelle (`coverUrl`), posée sur son origine ; telle quelle si l'origine ne se lit pas. */
const onOrigin = (path: string, origin: string): string => {
  try {
    return new URL(path, origin).href;
  } catch {
    return path;
  }
};

const nameOf = (pack: FramePackSummary, language: InterfaceLanguage) => pack.names[language] ?? pack.names.fr ?? { name: pack.name, description: pack.description };

const weightOf = (language: InterfaceLanguage, bytes: number): string => {
  const mega = bytes >= 1_000_000;
  return new Intl.NumberFormat(language, { style: 'unit', unit: mega ? 'megabyte' : 'kilobyte', maximumFractionDigits: 1 }).format(bytes / (mega ? 1_000_000 : 1_000));
};

/** La couverture d'un pack de cadres : une vignette 9:16, à la hauteur d'une rangée de boutique. */
const COVER_BOX = { width: 45, height: 80 } as const;
const THUMB_BOX = { aspectRatio: '9 / 16' } as const;

const writeInstalled = (queryClient: QueryClient, pack: FramePackSummary, installed: boolean) =>
  queryClient.setQueryData<readonly FramePackSummary[]>(FRAME_KEYS.installed, (list) => {
    const others = (list ?? []).filter((candidate) => candidate.slug !== pack.slug);
    return installed ? [...others, { ...pack, installed: true }] : others;
  });

export const frameShopAdapter = (language: InterfaceLanguage, deps: ConversationsDeps, origin: string): PackShopAdapter<FramePackSummary> => ({
  domain: 'glory-frame',
  catalogueKey: FRAME_KEYS.catalogue,
  installedKey: FRAME_KEYS.installed,
  loadCatalogue: (signal) => loadFramePackCatalogue({ ...deps, signal }),
  setInstalled: (pack, installed) => setFramePackInstalled(deps, pack.slug, installed),
  applyInstalled: writeInstalled,
  price: (pack) => pack.price ?? null,
  owned: (pack) => pack.owned ?? true,
  title: (pack) => nameOf(pack, language).name,
  description: (pack) => nameOf(pack, language).description,
  meta: (pack) => [
    translateStickerPacks(language, 'stickerPacks.by', { author: pack.author }),
    translateStickerPacks(language, 'packs.frames.count', { count: String(pack.itemCount) }),
    ...(pack.downloadBytes === null ? [] : [translateStickerPacks(language, 'packs.frames.weight', { size: weightOf(language, pack.downloadBytes.story) })]),
    ...(pack.usage === null ? [] : [usageText(language, pack.usage)]),
  ],
  cover: (pack) =>
    pack.coverUrl === null ? (
      <span aria-hidden className="block shrink-0 rounded-xl" style={{ ...COVER_BOX, backgroundColor: 'var(--color-ios-fill)' }} />
    ) : (
      <img
        src={onOrigin(pack.coverUrl, origin)}
        alt=""
        loading="lazy"
        decoding="async"
        crossOrigin="anonymous"
        className="block shrink-0 rounded-xl object-cover"
        style={COVER_BOX}
      />
    ),
});

export function FramePackShop({
  language,
  deps = apiDeps,
  assets,
}: {
  readonly language: InterfaceLanguage;
  readonly deps?: ConversationsDeps;
  /** Le magasin des fichiers — l'origine de la passerelle par défaut. */
  readonly assets?: PackAssetStoreDeps;
}) {
  const store: PackAssetStoreDeps = assets ?? { origin: apiOrigin() };
  const [chosen, setChosen] = useState<string>(SHOP_TAB);

  const installed = useQuery({
    queryKey: FRAME_KEYS.installed,
    queryFn: async ({ signal }) => {
      const result = await loadInstalledFramePacks({ ...deps, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: STALE_TIME,
  });
  const packs = installed.data ?? [];
  const tabs = [...packs.map((pack) => pack.slug), SHOP_TAB];
  const tab = tabs.includes(chosen) ? chosen : SHOP_TAB;
  const pack = packs.find((candidate) => candidate.slug === tab);

  return (
    <div data-frame-pack-shop className="flex flex-col gap-3">
      <FrameTabBar
        tabs={tabs}
        tab={tab}
        label={(slug) => {
          const found = packs.find((candidate) => candidate.slug === slug);
          return found === undefined ? translateStickerPacks(language, 'stickerPacks.tab.shop') : nameOf(found, language).name;
        }}
        onSelect={setChosen}
        ariaLabel={translateStickerPacks(language, 'packs.frames.tabs')}
      />
      {pack === undefined ? (
        <Suspense fallback={null}>
          <PackShop
            adapter={frameShopAdapter(language, deps, store.origin)}
            language={language}
            hint={translateStickerPacks(language, 'packs.frames.hint')}
            empty={translateStickerPacks(language, 'packs.frames.empty')}
          />
        </Suspense>
      ) : (
        <FramePackFrames key={pack.slug} slug={pack.slug} language={language} deps={deps} store={store} />
      )}
    </div>
  );
}

type FramesState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'update' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly frames: readonly GloryFramePackFrame[]; readonly strings: PackStrings };

const loadStore = () => import('@/lib/packs/pack-asset-store');

/** Le contrat et les chaînes d'un pack installé, lus et vérifiés par le magasin des fichiers. */
async function framesOf(detail: FramePackDetail, language: InterfaceLanguage, store: PackAssetStoreDeps): Promise<FramesState> {
  const { readPackAssetJson } = await loadStore();
  const raw = await readPackAssetJson(detail.contract, store);
  if (raw === null) return { kind: 'failed' };
  const parsed = parseGloryFramePackContract(raw);
  if (parsed === null) return { kind: 'update' };
  const stringsRef = detail.strings[language] ?? detail.strings.fr;
  const strings = stringsRef === undefined ? {} : parsePackStrings(await readPackAssetJson(stringsRef, store));
  return { kind: 'ready', frames: parsed.contract.frames, strings };
}

function FramePackFrames({
  slug,
  language,
  deps,
  store,
}: {
  readonly slug: string;
  readonly language: InterfaceLanguage;
  readonly deps: ConversationsDeps;
  readonly store: PackAssetStoreDeps;
}) {
  const detail = useQuery({
    queryKey: FRAME_KEYS.detail(slug),
    queryFn: async ({ signal }) => {
      const result = await loadFramePack({ ...deps, signal }, slug);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    staleTime: STALE_TIME,
  });
  const [state, setState] = useState<FramesState>({ kind: 'loading' });
  const data = detail.data;

  useEffect(() => {
    if (data === undefined) return undefined;
    let live = true;
    void framesOf(data, language, store).then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, [data?.contract.sha256, language]);

  const failed = detail.isError || state.kind === 'failed';
  if (state.kind === 'update') {
    return (
      <p data-frame-pack-update className="py-6 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translateStickerPacks(language, 'packs.frames.update')}
      </p>
    );
  }
  return (
    <div data-frame-pack-panel={slug} className="flex flex-col gap-3">
      <p className="text-caption empty:hidden" role="status" aria-live="polite" style={{ color: 'var(--ios-error)' }}>
        {failed ? translateStickerPacks(language, 'packs.frames.failed') : ''}
      </p>
      <ul className="grid grid-cols-3 gap-3" aria-busy={state.kind === 'loading' && !failed}>
        {state.kind === 'ready'
          ? state.frames.map((frame) => (
              <li key={frame.id} data-frame={frame.id} className="flex flex-col gap-1.5" style={{ contentVisibility: 'auto', containIntrinsicSize: '120px 240px' }}>
                <FrameThumb thumb={frame.thumb} store={store} />
                <span data-frame-name className="line-clamp-2 text-caption font-semibold empty:hidden" style={{ color: 'var(--color-ios-ink)' }}>
                  {state.strings[frame.i18n.name] ?? ''}
                </span>
                <span data-frame-usage className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {usageText(language, frame.usage)}
                </span>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

/** La vignette d'un cadre : octets vérifiés, URL d'objet révoquée au démontage. */
function FrameThumb({ thumb, store }: { readonly thumb: PackAssetRef; readonly store: PackAssetStoreDeps }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    void loadStore()
      .then(({ readPackAssetBlob }) => readPackAssetBlob(thumb, store))
      .then((blob) => {
        if (!live || blob === null) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      });
    return () => {
      live = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [thumb.sha256]);
  const box = 'block w-full rounded-xl';
  return src === null ? (
    <span aria-hidden className={box} style={{ ...THUMB_BOX, backgroundColor: 'var(--color-ios-fill)' }} />
  ) : (
    <img src={src} alt="" decoding="async" className={`${box} object-cover`} style={THUMB_BOX} />
  );
}

/** Les onglets — flèches, Début, Fin, un seul arrêt de tabulation, cibles de 44 px (même loi que la feuille de stickers). */
function FrameTabBar({
  tabs,
  tab,
  label,
  onSelect,
  ariaLabel,
}: {
  readonly tabs: readonly string[];
  readonly tab: string;
  readonly label: (tab: string) => string;
  readonly onSelect: (tab: string) => void;
  readonly ariaLabel: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const current = tabs.indexOf(tab);
    const rtl = document.documentElement.dir === 'rtl';
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -current, End: tabs.length - 1 - current }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (current + step + tabs.length) % tabs.length;
    const target = tabs[next];
    if (target === undefined) return;
    onSelect(target);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className="flex shrink-0 gap-2 overflow-x-auto pb-1">
      {tabs.map((candidate, index) => {
        const selected = candidate === tab;
        return (
          <button
            key={candidate}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            {...(candidate === SHOP_TAB ? { 'data-frame-shop-tab': '' } : { 'data-frame-pack-tab': candidate })}
            onClick={() => onSelect(candidate)}
            className="shrink-0 rounded-chip px-4 text-body font-semibold"
            style={{
              minHeight: 44,
              color: selected ? 'var(--color-ios-on-brand)' : 'var(--color-ios-ink)',
              backgroundColor: selected ? 'var(--accent, var(--color-ios-brand))' : 'var(--color-ios-card)',
            }}
          >
            {label(candidate)}
          </button>
        );
      })}
    </div>
  );
}
