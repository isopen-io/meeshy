import { useState } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { stickerPackTemplateId } from '@meeshy/shared/types/sticker-pack';
import type { StickerPackDetail, StickerPackItem } from '@meeshy/shared/types/sticker-pack';

import { attachmentSrc } from '@/lib/api/media-url';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { RasterizeSvg } from '@/lib/mee/png';
import { packStickerFile } from '@/lib/sticker-packs/file';
import { packSlotsFor, renderInstantSvg } from '@/lib/sticker-packs/render';
import type { PackSlots } from '@/lib/sticker-packs/render';

/**
 * **UN PACK DE STICKERS D'UN TIERS** (#9141) — son onglet dans la feuille de
 * stickers. Fixe et cinématique partent au toucher ; un Instant s'ouvre
 * d'abord sous la grille : son aperçu, un champ par zone (borné à la
 * longueur que la zone admet), et « Envoyer ». L'aperçu se redessine à
 * chaque lettre, avec la mise en page qui partira — ce qu'on voit est ce que
 * l'autre recevra.
 *
 * Ce qui part : l'image de repli (`packStickerFile`) et le descripteur
 * `{ templateId: 'pack.<slug>.<clé>', slots, emoji }`, que le web redessine.
 */

export type PackPicked = { readonly file: File; readonly sticker: MessageSticker };

type Fetcher = (url: string) => Promise<Response>;

export function PackStickerPanel({
  pack,
  language,
  onPick,
  fetcher,
  rasterize,
}: {
  readonly pack: StickerPackDetail;
  readonly language: InterfaceLanguage;
  readonly onPick: (picked: PackPicked) => void;
  readonly fetcher?: Fetcher;
  readonly rasterize?: RasterizeSvg;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<StickerPackItem | null>(null);
  const [typed, setTyped] = useState<PackSlots>({});

  const send = async (item: StickerPackItem, values: PackSlots) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const slots = packSlotsFor(item, values);
    const file = await packStickerFile(pack.slug, item, slots, { ...(fetcher ? { fetcher } : {}), ...(rasterize ? { rasterize } : {}) });
    setBusy(false);
    if (file === null) {
      setFailed(true);
      return;
    }
    setOpen(null);
    onPick({
      file,
      sticker: { templateId: stickerPackTemplateId(pack.slug, item.key), emoji: item.emoji, ...(Object.keys(slots).length > 0 ? { slots } : {}) },
    });
  };

  const choose = (item: StickerPackItem) => {
    if (item.kind !== 'instant') {
      void send(item, {});
      return;
    }
    setTyped({});
    setOpen(item);
  };

  return (
    <div data-pack-panel={pack.slug} className="flex flex-col gap-3">
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'stickerPacks.by', { author: pack.author })}
      </p>
      <p className="text-caption" role="status" aria-live="polite" style={{ color: failed ? 'var(--ios-error)' : 'var(--color-ios-ink-3)' }}>
        {failed ? translate(language, 'composer.sticker.unavailable') : ''}
      </p>
      <ul className="grid grid-cols-4 gap-2">
        {pack.items.map((item) => (
          <li key={item.key} style={{ contentVisibility: 'auto', containIntrinsicSize: '80px 80px' }}>
            <button
              type="button"
              data-pack-sticker={item.key}
              data-kind={item.kind}
              aria-label={item.title}
              aria-expanded={item.kind === 'instant' ? open?.key === item.key : undefined}
              disabled={busy}
              onClick={() => choose(item)}
              className="block aspect-square w-full rounded-xl p-0.5"
              style={{ backgroundColor: 'var(--color-ios-card)', outline: open?.key === item.key ? '2px solid var(--accent)' : undefined }}
            >
              <PackStickerArt item={item} slots={{}} uid={`cell-${pack.slug}-${item.key}`} />
            </button>
          </li>
        ))}
      </ul>

      {open !== null ? (
        <section data-pack-instant={open.key} className="flex flex-col gap-3 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
          <div className="mx-auto w-40">
            <PackStickerArt item={open} slots={packSlotsFor(open, typed)} uid={`preview-${pack.slug}-${open.key}`} />
          </div>
          {open.zones.map((zone) => (
            <label key={zone.slot} className="flex flex-col gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              <span>{zone.label}</span>
              <input
                data-pack-field={zone.slot}
                type="text"
                maxLength={zone.maxLength}
                placeholder={zone.defaultText}
                value={typed[zone.slot] ?? ''}
                onInput={(event) => {
                  const value = event.currentTarget.value;
                  setTyped((current) => ({ ...current, [zone.slot]: value }));
                }}
                className="min-h-11 rounded-xl px-3 text-body"
                style={{ backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' }}
              />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" className="min-h-11 rounded-full px-4 text-body" style={{ color: 'var(--color-ios-ink)' }} onClick={() => setOpen(null)}>
              {translate(language, 'stickerPacks.cancel')}
            </button>
            <button
              type="button"
              data-pack-send
              disabled={busy}
              onClick={() => void send(open, typed)}
              className="min-h-11 rounded-full px-5 text-body font-semibold disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--color-ios-on-brand)' }}
            >
              {translate(language, 'stickerPacks.send')}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** L'image d'un sticker de pack : l'image seule, ou l'Instant avec son texte. */
export function PackStickerArt({ item, slots, uid }: { readonly item: StickerPackItem; readonly slots: PackSlots; readonly uid: string }) {
  const src = attachmentSrc(item.fileUrl);
  if (item.kind !== 'instant') {
    return <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />;
  }
  return <span aria-hidden className="block h-full w-full" dangerouslySetInnerHTML={{ __html: renderInstantSvg(item, { imageHref: src, slots, uid }) }} />;
}
