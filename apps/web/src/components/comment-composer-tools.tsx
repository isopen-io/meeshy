import { Suspense, useState } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { COMPOSER_GLYPHS } from '@/components/glyphs-composer';
import { ComposerEmojiSheet, ComposerStickerSheet } from '@/components/composer-sheets-lazy';
import type { PickedSticker } from '@/components/composer-sticker-sheet';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES OUTILS DU COMPOSEUR DE COMMENTAIRE** (#9318) — la photothèque (photos,
 * GIF, vidéos et sons), le micro, l'emoji et le sticker, sous le champ. La
 * règle « un commentaire n'a ni son ni fichier » est levée par le porteur :
 * un commentaire porte désormais tout ce qu'un message porte de MÉDIA, par
 * les MÊMES pièces que le composeur du fil (`composer-sheets-lazy.ts`), miroir
 * de `PostDetailView+CommentComposer.swift` (voix toujours visible,
 * photothèque, fichiers).
 *
 * Les deux feuilles ont deux effets distincts, exactement comme dans le
 * composeur du fil : l'emoji ENTRE dans le texte en cours, le sticker PART
 * comme un commentaire à lui seul — le brouillon reste au champ.
 *
 * Chaque contrôle n'est rendu que s'il a un effet (loi 4) : sans micro
 * utilisable, pas de bouton micro ; sans hôte qui envoie un sticker, pas de
 * bouton sticker.
 */
const TOOL_TARGET_PX = 44;

const TOOL_STYLE = {
  width: TOOL_TARGET_PX,
  height: TOOL_TARGET_PX,
  color: 'var(--color-ios-ink-2)',
  outlineColor: 'var(--color-ios-brand)',
} as const;

const TOOL_CLASS = 'grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2';

export type CommentComposerToolsProps = {
  readonly language: InterfaceLanguage;
  readonly onAttach: () => void;
  /** Absent ⇒ aucun micro : le navigateur n'en offre pas. */
  readonly onRecord?: (() => void) | undefined;
  /** La permission du micro est en cours de demande. */
  readonly recordBusy: boolean;
  readonly onEmoji: (emoji: string) => void;
  /** Absent ⇒ aucun sticker : l'hôte ne sait pas l'envoyer. */
  readonly onSticker?: ((picked: PickedSticker) => void) | undefined;
  /** LA CAMÉRA (#9736, décision porteur du 2026-10-09) — à DROITE de la
   * rangée, le glyphe et le libellé de celle du message (`composer-top-row`). */
  readonly onCamera: () => void;
};

export function CommentComposerTools({ language, onAttach, onRecord, recordBusy, onEmoji, onSticker, onCamera }: CommentComposerToolsProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  return (
    <div data-comment-tools="" className="flex items-center gap-1">
      <button type="button" data-comment-attach="" aria-label={translate(language, 'comments.composer.attach')} onClick={onAttach} className={TOOL_CLASS} style={TOOL_STYLE}>
        <Glyph name="image" size={20} />
      </button>
      {onRecord === undefined ? null : (
        <button
          type="button"
          data-comment-voice=""
          aria-label={translate(language, 'comments.composer.voice')}
          aria-busy={recordBusy}
          onClick={onRecord}
          className={TOOL_CLASS}
          style={TOOL_STYLE}
        >
          <Glyph name="microphone" size={20} {...(recordBusy ? { className: 'animate-pulse' } : {})} />
        </button>
      )}
      <button
        type="button"
        data-comment-emoji-open=""
        aria-label={translate(language, 'composer.attach.emoji.action')}
        onClick={() => setEmojiOpen(true)}
        className={TOOL_CLASS}
        style={TOOL_STYLE}
      >
        <Glyph name="smiley" size={20} />
      </button>
      {onSticker === undefined ? null : (
        <button
          type="button"
          data-comment-sticker-open=""
          aria-label={translate(language, 'composer.attach.sticker.action')}
          onClick={() => setStickerOpen(true)}
          className={TOOL_CLASS}
          style={TOOL_STYLE}
        >
          <GlyphSvg glyph={COMPOSER_GLYPHS.sticker} size={20} />
        </button>
      )}
      <button
        type="button"
        data-comment-camera=""
        aria-label={translate(language, 'composer.attach.camera.action')}
        onClick={onCamera}
        className={TOOL_CLASS}
        style={{ ...TOOL_STYLE, marginInlineStart: 'auto' }}
      >
        <GlyphSvg glyph={COMPOSER_GLYPHS.camera} size={20} />
      </button>
      {emojiOpen ? (
        <Suspense fallback={null}>
          <ComposerEmojiSheet
            onPick={(emoji) => {
              setEmojiOpen(false);
              onEmoji(emoji);
            }}
            onClose={() => setEmojiOpen(false)}
          />
        </Suspense>
      ) : null}
      {stickerOpen && onSticker !== undefined ? (
        <Suspense fallback={null}>
          <ComposerStickerSheet
            onPick={(picked) => {
              setStickerOpen(false);
              onSticker(picked);
            }}
            onClose={() => setStickerOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
