import { useEffect, useState } from 'react';

import type { MessageSticker } from '@meeshy/shared/types/message-sticker';

import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { stickerAddable, stickerPackSlugOf } from '@/lib/stickers/received';
import { useStickerLibrary } from '@/lib/stickers/use-sticker-library';
import { PACK_FOCUS_PARAM } from '@/routes/pack-focus-param';
import { PACKS_PANEL, SECURITY_PANEL_PARAM } from '@/routes/settings-sections';
import { href, navigate } from '@/routes/route-table';

import { StickerArtwork } from './message-body-blocks';
import { Sheet } from './sheet';

/**
 * **LA FICHE D'UN STICKER** (#10630) — ce qu'ouvre un toucher sur un sticker
 * d'un message : l'aperçu agrandi, « Ajouter à mes stickers » (ou « Dans mes
 * stickers ✓ » quand il y est), et « Voir le pack » quand son gabarit dit d'où
 * il vient. Le sticker n'est jamais une photo : ni visionneuse, ni
 * « Enregistrer l'image ».
 *
 * Les libellés vivent dans le catalogue du fil ; hors du fil (un commentaire),
 * il se charge à l'ouverture et la fiche attend.
 */
const PREVIEW_SIDE = 256;

export function StickerSheet({
  sticker,
  picture,
  senderName,
  onClose,
}: {
  readonly sticker: MessageSticker;
  readonly picture: Pick<Attachment, 'fileUrl'> | undefined;
  /** Qui a envoyé ce sticker (#10703) — la bulle, Focal et le commentaire le savent ; absent ⇒ rien n'est dit. */
  readonly senderName?: string | undefined;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [ready, setReady] = useState(false);
  const [outcome, setOutcome] = useState<'idle' | 'added' | 'failed'>('idle');
  const [busy, setBusy] = useState(false);
  const library = useStickerLibrary();
  useEffect(() => {
    let live = true;
    void loadMessagePiecesCatalog(language).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [language]);
  if (!ready) return null;

  const t = (key: Parameters<typeof translateMessagePieces>[1]) => translateMessagePieces(language, key as never);
  const inLibrary = library.has(sticker, picture);
  const addable = stickerAddable(picture);
  const packSlug = stickerPackSlugOf(sticker);

  const add = async () => {
    setBusy(true);
    setOutcome('idle');
    const ok = await library.add(sticker, picture);
    setBusy(false);
    setOutcome(ok ? 'added' : 'failed');
  };
  const openPack = () => {
    onClose();
    navigate(href('settings', undefined, { [SECURITY_PANEL_PARAM]: PACKS_PANEL, ...(packSlug === null ? {} : { [PACK_FOCUS_PARAM]: packSlug }) }));
  };

  return (
    <Sheet title={translate(language, 'composer.sticker.title')} bodyAs="div" presentation="bottom" onClose={onClose} dialogData={{ 'data-sticker-sheet': '' }}>
      <div className="flex flex-col items-center gap-4 px-4 pb-6">
        <div data-sticker-preview className="grid place-items-center" style={{ minHeight: PREVIEW_SIDE }}>
          <StickerArtwork sticker={sticker} picture={picture} side={PREVIEW_SIDE} interactive={false} />
        </div>
        {senderName !== undefined && senderName.trim() !== '' ? (
          <p data-sticker-sender className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translateMessagePieces(language, 'message.sticker.from', { name: senderName })}
          </p>
        ) : null}
        {inLibrary ? (
          <p data-sticker-in-library className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t('message.sticker.inLibrary')} ✓
          </p>
        ) : addable ? (
          <button
            type="button"
            data-sticker-add
            disabled={busy}
            onClick={() => void add()}
            className="min-h-11 rounded-full px-5 text-body font-semibold"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--color-ios-on-brand)' }}
          >
            {t('message.sticker.add')}
          </button>
        ) : null}
        {packSlug !== null ? (
          <button type="button" data-sticker-view-pack onClick={openPack} className="min-h-11 px-4 text-body" style={{ color: 'var(--accent)' }}>
            {t('message.sticker.viewPack')}
          </button>
        ) : null}
        {/* L'ÉCHEC SE VOIT (un réseau coupé, une image qui ne se relit plus) ;
            la réussite se lit déjà dans « Dans mes stickers ✓ ». */}
        <p data-sticker-notice role="status" aria-live="polite" className={outcome === 'failed' ? 'text-center text-caption' : 'sr-only'} style={{ color: 'var(--color-ios-ink-2)' }}>
          {outcome === 'failed' ? t('message.sticker.addFailed') : outcome === 'added' ? t('message.sticker.added') : ''}
        </p>
      </div>
    </Sheet>
  );
}
