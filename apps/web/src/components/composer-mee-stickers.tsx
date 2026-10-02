import { useState } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { findMeeSticker, meeSlotsFor, meeStickersOfPack, meeTemplateId } from '@/lib/mee/catalog';
import { MEE_INTENT_KEYS } from '@/lib/mee/intents';
import { meeStickerFile, rasterizeSvg } from '@/lib/mee/png';
import type { RasterizeSvg } from '@/lib/mee/png';
import { renderMeeSticker } from '@/lib/mee/render';
import { MEE_INTENTS } from '@/lib/mee/types';
import type { MeeBuiltinPack, MeeSection, MeeSlot, MeeSlots, MeeSticker } from '@/lib/mee/types';
import { isFavorite } from '@/lib/stickers/favorites';
import type { StickerFavorite } from '@/lib/stickers/favorites';

import { FavoriteStar } from './sticker-favorite-star';

/**
 * LES STICKERS DE MEE ET MEO (#9034, #9058, #9068, #9069, #9141) — trois
 * PACKS intégrés, un onglet chacun dans la feuille de stickers, que
 * l'utilisateur installe ou retire comme les packs des tiers :
 * - `mee` et `meo` : le personnage, rangé par INTENTION (un titre, la phrase
 *   qui dit quand l'employer, puis la grille), puis ses Instants — les
 *   stickers dynamiques, qui écrivent ce que l'utilisateur saisit juste
 *   au-dessus (message, lieu, météo, heure — l'heure est celle de l'instant,
 *   modifiable) ;
 * - `mee-et-meo` : les duos, par intention ;
 * - `favorites` : les Mee épinglés, dans l'ordre où ils l'ont été (#9070).
 * Une section vide ne s'affiche pas.
 *
 * Toucher un sticker rend son image fixe (le repli des clients qui ne le
 * redessinent pas) et rend à l'hôte l'image et le descripteur
 * `{ templateId: 'mee.<id>', slots, emoji }` : le web le redessine, animé.
 */

export type MeePicked = { readonly file: File; readonly sticker: MessageSticker };

type Heading = { readonly title: InterfaceCatalogKey; readonly hint?: InterfaceCatalogKey };
type Section = readonly [MeeSection, Heading];

const INTENT_SECTIONS: readonly Section[] = MEE_INTENTS.map((intent) => [intent, MEE_INTENT_KEYS[intent]]);

const INSTANT_SECTIONS: readonly Section[] = [
  ['message', { title: 'composer.sticker.instants.message' }],
  ['moment', { title: 'composer.sticker.instants.moment' }],
  ['lieu', { title: 'composer.sticker.instants.lieu' }],
  ['meteo', { title: 'composer.sticker.instants.meteo' }],
];

export type MeePanelMode = MeeBuiltinPack | 'favorites';

/** Les Mee d'une liste de favoris, dans son ordre ; un identifiant sorti du catalogue est ignoré, jamais purgé. */
const favoriteMees = (favorites: readonly StickerFavorite[]): readonly MeeSticker[] =>
  favorites.flatMap((entry) => {
    const found = entry.kind === 'mee' ? findMeeSticker(entry.value) : undefined;
    return found === undefined ? [] : [found];
  });

const FIELDS = [
  { slot: 'message', label: 'composer.sticker.instants.field.message' },
  { slot: 'place', label: 'composer.sticker.instants.field.place' },
  { slot: 'weather', label: 'composer.sticker.instants.field.weather' },
  { slot: 'time', label: 'composer.sticker.instants.field.time' },
] as const satisfies readonly { readonly slot: MeeSlot; readonly label: InterfaceCatalogKey }[];

const clockOf = (language: InterfaceLanguage, now: Date): string =>
  new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(now);

export function MeeStickerPanel({
  mode,
  language,
  onPick,
  rasterize = rasterizeSvg,
  now = () => new Date(),
  favorites = [],
  onToggleFavorite,
}: {
  readonly mode: MeePanelMode;
  /** Les favoris de la feuille : la case épinglée porte son étoile, et `favorites` les liste. */
  readonly favorites?: readonly StickerFavorite[];
  /** L'appui long (ou clic droit) épingle ou retire — jamais un Instant, qui dépend du texte saisi. */
  readonly onToggleFavorite?: (entry: StickerFavorite) => void;
  readonly language: InterfaceLanguage;
  readonly onPick: (picked: MeePicked) => void;
  readonly rasterize?: RasterizeSvg;
  readonly now?: () => Date;
}) {
  const [values, setValues] = useState<MeeSlots>(() => ({ time: clockOf(language, now()) }));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const stickers = mode === 'favorites' ? favoriteMees(favorites) : meeStickersOfPack(mode);
  const characters = stickers.filter((sticker) => sticker.tab !== 'instants');
  const instants = stickers.filter((sticker) => sticker.tab === 'instants');
  const typed = values;

  const pick = async (sticker: MeeSticker) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const slots = meeSlotsFor(sticker, typed);
    const file = await meeStickerFile(sticker, slots, rasterize).catch(() => null);
    setBusy(false);
    if (file === null) {
      setFailed(true);
      return;
    }
    onPick({
      file,
      sticker: { templateId: meeTemplateId(sticker), emoji: sticker.emoji, ...(Object.keys(slots).length > 0 ? { slots } : {}) },
    });
  };

  const grid = (section: MeeSection, heading: Heading | null, list: readonly MeeSticker[]) =>
    list.length === 0 ? null : (
      <section key={section} data-mee-section={section} className="flex flex-col gap-2">
        {heading !== null ? (
          <header className="flex flex-col gap-0.5">
            <h3 className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translate(language, heading.title)}
            </h3>
            {heading.hint !== undefined ? (
              <p data-mee-hint className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {translate(language, heading.hint)}
              </p>
            ) : null}
          </header>
        ) : null}
        <ul className="grid grid-cols-4 gap-2">
          {list.map((sticker) => {
            const pinnable = sticker.tab !== 'instants' && onToggleFavorite !== undefined;
            const pinned = pinnable && isFavorite(favorites, { kind: 'mee', value: sticker.id });
            return (
              <li key={sticker.id} className="relative" style={{ contentVisibility: 'auto', containIntrinsicSize: '80px 80px' }}>
                <button
                  type="button"
                  data-mee-sticker={sticker.id}
                  aria-label={sticker.title}
                  disabled={busy}
                  onClick={() => void pick(sticker)}
                  data-favorite={pinned ? 'true' : undefined}
                  onContextMenu={
                    pinnable
                      ? (event) => {
                          event.preventDefault();
                          onToggleFavorite?.({ kind: 'mee', value: sticker.id });
                        }
                      : undefined
                  }
                  className="block aspect-square w-full rounded-xl p-0.5"
                  style={{ backgroundColor: 'var(--color-ios-card)' }}
                >
                  <span
                    aria-hidden
                    className="block h-full w-full"
                    dangerouslySetInnerHTML={{ __html: renderMeeSticker(sticker, { uid: `pick-${mode}-${sticker.id}`, slots: typed }) }}
                  />
                </button>
                {pinned ? <FavoriteStar /> : null}
              </li>
            );
          })}
        </ul>
      </section>
    );

  return (
    <div data-mee-panel={mode} className="flex flex-col gap-3">
      <p className="text-caption" role="status" aria-live="polite" style={{ color: failed ? 'var(--ios-error)' : 'var(--color-ios-ink-3)' }}>
        {failed ? translate(language, 'composer.sticker.unavailable') : ''}
      </p>

      {mode === 'favorites'
        ? grid('favorites' as MeeSection, null, stickers)
        : INTENT_SECTIONS.map(([section, heading]) => grid(section, heading, characters.filter((sticker) => sticker.section === section)))}

      {instants.length > 0 && mode !== 'favorites' ? (
        <div data-mee-instants className="flex flex-col gap-3 pt-2">
          <header className="flex flex-col gap-0.5">
            <h3 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              {translate(language, 'composer.sticker.tab.instants')}
            </h3>
            <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'composer.sticker.instants.hint')}
            </p>
          </header>
          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map(({ slot: field, label }) => (
              <label key={field} className="flex flex-col gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                <span>{translate(language, label)}</span>
                <input
                  data-mee-field={field}
                  type="text"
                  maxLength={60}
                  value={values[field] ?? ''}
                  onInput={(event) => {
                    const value = event.currentTarget.value;
                    setValues((current) => ({ ...current, [field]: value }));
                  }}
                  className="min-h-11 rounded-xl px-3 text-body"
                  style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
                />
              </label>
            ))}
          </div>
          {INSTANT_SECTIONS.map(([section, heading]) => grid(section, heading, instants.filter((sticker) => sticker.section === section)))}
        </div>
      ) : null}
    </div>
  );
}

