import { useState } from 'react';

import { CHROME_ACTION_HIT_CLASS, ChromeActionDisc } from '@/components/chrome-action';
import { StickerShop } from '@/components/composer-sticker-shop';
import { FramePackShop, prepareFramePackShop } from '@/components/frame-pack-shop';
import { Glyph } from '@/components/glyph';
import { SECTION_INK } from '@/components/grouped-section';
import { translate } from '@/lib/i18n-catalog';
import { loadStickerPacksCatalog, translateStickerPacks } from '@/lib/i18n-sticker-packs-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PackDomain } from '@meeshy/shared/types/content-pack';
import { UnifiedShop } from '@/components/unified-shop';
import { isPackDomain } from '@/lib/api/packs-shop';
import { Link } from '@/routes/route-table';
import { PACK_FOCUS_PARAM } from '@/routes/pack-focus-param';

/**
 * **PACKS ET TÉLÉCHARGEMENTS** (#10149, demande porteur 2026-10-11) — le
 * volet `?volet=packs` des réglages : deux segments, « Stickers » (la Boutique
 * des stickers, la même que le dernier onglet de la feuille de stickers) et
 * « Cadres du jeu » (la Boutique des cadres : chaque pack installé y devient
 * un onglet qui montre ses cadres et où chacun s'utilise). Chargé à la demande
 * avec ses libellés : rien n'en entre dans la première peinture.
 *
 * `?volet=packs&type=cadres` ouvre directement le segment des cadres.
 */

type Segment = 'shop' | 'stickers' | 'frames';

const DOMAIN_PARAM = 'domaine';

const SEGMENT_PARAM = 'type';
const FRAMES_SEGMENT_VALUE = 'cadres';

export const prepareSettingsPacks = (language: InterfaceLanguage): Promise<unknown> =>
  Promise.all([loadStickerPacksCatalog(language), prepareFramePackShop(language)]);

const searchParams = (): URLSearchParams => new URLSearchParams(typeof location === 'object' ? location.search : '');

/** `?domaine=<d>` (contrat #10632) ouvre la vitrine filtrée ; `type=cadres` reste lu, alias de `domaine=glory-frame`. */
export const initialDomain = (): PackDomain | undefined => {
  const asked = searchParams().get(DOMAIN_PARAM);
  return isPackDomain(asked) ? asked : undefined;
};

/** `?pack=<slug>` (#10703) met un pack de stickers en avant : la fiche d'un sticker reçu y mène. */
export const initialPack = (): string | undefined => searchParams().get(PACK_FOCUS_PARAM) ?? undefined;

const initialSegment = (): Segment => {
  const params = searchParams();
  if (isPackDomain(params.get(DOMAIN_PARAM))) return 'shop';
  if (params.get(PACK_FOCUS_PARAM) !== null) return 'stickers';
  return params.get(SEGMENT_PARAM) === FRAMES_SEGMENT_VALUE ? 'frames' : 'stickers';
};

export function SettingsPacksScreen({ language }: { readonly language: InterfaceLanguage }) {
  const [segment, setSegment] = useState<Segment>(initialSegment);
  const [askedDomain] = useState(initialDomain);
  const [askedPack] = useState(initialPack);
  const segments: readonly { readonly id: Segment; readonly label: string }[] = [
    { id: 'shop', label: translateStickerPacks(language, 'packs.segment.shop') },
    { id: 'stickers', label: translateStickerPacks(language, 'packs.segment.stickers') },
    { id: 'frames', label: translateStickerPacks(language, 'packs.segment.frames') },
  ];
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe" data-settings-packs-screen>
      <header className="flex shrink-0 items-center gap-1 px-2" style={{ height: 64 }}>
        <Link
          to="settings"
          aria-label={translate(language, 'pending.back')}
          className={`${CHROME_ACTION_HIT_CLASS} focus-visible:outline-2 focus-visible:outline-offset-2`}
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <ChromeActionDisc>
            <Glyph name="caretLeft" size={16} className="rtl:-scale-x-100" />
          </ChromeActionDisc>
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-body font-semibold" style={{ color: SECTION_INK }}>
          {translateStickerPacks(language, 'packs.title')}
        </h1>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto px-4 pb-safe">
        <div className="mx-auto flex max-w-xl flex-col gap-4 pb-24" style={{ paddingTop: 8 }}>
          <div
            role="radiogroup"
            aria-label={translateStickerPacks(language, 'packs.segments')}
            className="grid grid-cols-3 gap-1 rounded-chip p-1"
            style={{ backgroundColor: 'var(--color-ios-fill)' }}
          >
            {segments.map((candidate) => {
              const selected = candidate.id === segment;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-packs-segment={candidate.id}
                  onClick={() => setSegment(candidate.id)}
                  className="rounded-chip px-3 text-body font-semibold focus-visible:outline-2"
                  style={{
                    minHeight: 44,
                    outlineColor: 'var(--color-ios-brand)',
                    color: 'var(--color-ios-ink)',
                    backgroundColor: selected ? 'var(--color-ios-card)' : 'transparent',
                  }}
                >
                  {candidate.label}
                </button>
              );
            })}
          </div>
          {segment === 'shop' ? (
            <UnifiedShop language={language} {...(askedDomain === undefined ? {} : { initialDomain: askedDomain })} />
          ) : segment === 'stickers' ? (
            <StickerShop language={language} focusSlug={askedPack} />
          ) : (
            <FramePackShop language={language} />
          )}
        </div>
      </main>
    </div>
  );
}
