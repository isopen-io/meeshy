import { useMemo, useState } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { meeSlotsFor, meeStickersOfTab, meeTemplateId } from '@/lib/mee/catalog';
import { meeStickerFile, rasterizeSvg } from '@/lib/mee/png';
import type { RasterizeSvg } from '@/lib/mee/png';
import { renderMeeSticker } from '@/lib/mee/render';
import type { MeeSection, MeeSlot, MeeSlots, MeeSticker, MeeTab } from '@/lib/mee/types';

/**
 * LES STICKERS DE MEE ET MEO (#9034) — trois onglets de la feuille de
 * stickers, après « Mes stickers ». Mee et Meo : les stickers seuls, puis
 * « à deux », où le personnage de l'onglet fait le geste. Instants : les
 * stickers dynamiques, qui écrivent ce que l'utilisateur saisit au-dessus
 * (message, lieu, météo, heure — l'heure est celle de l'instant, modifiable).
 *
 * Toucher un sticker rend son image fixe (le repli des clients qui ne le
 * redessinent pas) et rend à l'hôte l'image et le descripteur
 * `{ templateId: 'mee.<id>', slots, emoji }` : le web le redessine, animé.
 */

export type MeePicked = { readonly file: File; readonly sticker: MessageSticker };

const SECTIONS: Readonly<Record<MeeTab, readonly MeeSection[]>> = {
  mee: ['solo', 'duo'],
  meo: ['solo', 'duo'],
  instants: ['message', 'moment', 'lieu', 'meteo'],
};

const SECTION_KEYS = {
  'mee.solo': 'composer.sticker.mee.solo',
  'mee.duo': 'composer.sticker.mee.duo',
  'meo.solo': 'composer.sticker.meo.solo',
  'meo.duo': 'composer.sticker.meo.duo',
  'instants.message': 'composer.sticker.instants.message',
  'instants.moment': 'composer.sticker.instants.moment',
  'instants.lieu': 'composer.sticker.instants.lieu',
  'instants.meteo': 'composer.sticker.instants.meteo',
} as const satisfies Readonly<Record<string, InterfaceCatalogKey>>;

const sectionKey = (tab: MeeTab, section: MeeSection): InterfaceCatalogKey =>
  SECTION_KEYS[`${tab}.${section}` as keyof typeof SECTION_KEYS] ?? 'composer.sticker.item';

const HINT_KEYS = {
  mee: 'composer.sticker.mee.hint',
  meo: 'composer.sticker.meo.hint',
  instants: 'composer.sticker.instants.hint',
} as const satisfies Readonly<Record<MeeTab, InterfaceCatalogKey>>;

const FIELDS = [
  { slot: 'message', label: 'composer.sticker.instants.field.message', placeholder: 'composer.sticker.instants.placeholder.message' },
  { slot: 'place', label: 'composer.sticker.instants.field.place', placeholder: 'composer.sticker.instants.placeholder.place' },
  { slot: 'weather', label: 'composer.sticker.instants.field.weather', placeholder: 'composer.sticker.instants.placeholder.weather' },
  { slot: 'time', label: 'composer.sticker.instants.field.time', placeholder: 'composer.sticker.instants.placeholder.time' },
] as const satisfies readonly { readonly slot: MeeSlot; readonly label: InterfaceCatalogKey; readonly placeholder: InterfaceCatalogKey }[];

const clockOf = (language: InterfaceLanguage, now: Date): string =>
  new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(now);

export function MeeStickerPanel({
  tab,
  language,
  onPick,
  rasterize = rasterizeSvg,
  now = () => new Date(),
}: {
  readonly tab: MeeTab;
  readonly language: InterfaceLanguage;
  readonly onPick: (picked: MeePicked) => void;
  readonly rasterize?: RasterizeSvg;
  readonly now?: () => Date;
}) {
  const [values, setValues] = useState<MeeSlots>(() => ({ time: clockOf(language, now()) }));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const stickers = useMemo(() => meeStickersOfTab(tab), [tab]);
  const typed = tab === 'instants' ? values : {};

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

  return (
    <div data-mee-panel={tab} className="flex flex-col gap-3">
      {tab === 'instants' ? (
        <div className="grid grid-cols-2 gap-2">
          {FIELDS.map(({ slot: field, label, placeholder }) => (
            <label key={field} className="flex flex-col gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              <span>{translate(language, label)}</span>
              <input
                data-mee-field={field}
                type="text"
                maxLength={60}
                value={values[field] ?? ''}
                placeholder={translate(language, placeholder)}
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
      ) : null}

      <p className="text-caption" role="status" aria-live="polite" style={{ color: failed ? 'var(--ios-error)' : 'var(--color-ios-ink-3)' }}>
        {failed ? translate(language, 'composer.sticker.unavailable') : translate(language, HINT_KEYS[tab])}
      </p>

      {SECTIONS[tab].map((section) => {
        const list = stickers.filter((sticker) => sticker.section === section);
        return list.length === 0 ? null : (
          <section key={section} data-mee-section={section} className="flex flex-col gap-2">
            <h3 className="text-footnote font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, sectionKey(tab, section))}
            </h3>
            <ul className="grid grid-cols-4 gap-2">
              {list.map((sticker) => (
                <li key={sticker.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '80px 80px' }}>
                  <button
                    type="button"
                    data-mee-sticker={sticker.id}
                    aria-label={sticker.title}
                    disabled={busy}
                    onClick={() => void pick(sticker)}
                    className="block aspect-square w-full rounded-xl p-0.5"
                    style={{ backgroundColor: 'var(--color-ios-card)' }}
                  >
                    <span
                      aria-hidden
                      className="block h-full w-full"
                      dangerouslySetInnerHTML={{ __html: renderMeeSticker(sticker, { uid: `pick-${sticker.id}`, slots: typed }) }}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
