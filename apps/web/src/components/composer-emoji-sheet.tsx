import { EmojiPickerSheet } from './emoji-picker-sheet';

export { prepareEmojiPickerSheet } from './emoji-picker-sheet';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « INSÉRER UN EMOJI » (#7280) — la palette de la tuile « Emoji » du tiroir,
 * miroir de `composer.attach.emoji` (`UniversalComposerBar+Attachments.swift:283-288`).
 *
 * MÊME FEUILLE que « Ajouter une réaction » (`EmojiPickerSheet`, #10531 :
 * catégories, recherche et récents sur tous les emojis), AUTRE effet : ici le
 * caractère choisi entre dans le TEXTE en cours, là il se pose sur un message.
 * iOS tient exactement cette distinction — la tuile emoji insère dans le
 * champ, la tuile sticker compose un message (le doc-comment de
 * `carouselTiles` la formule mot pour mot).
 */
export function ComposerEmojiSheet({
  onPick,
  onClose,
  title,
}: {
  readonly onPick: (emoji: string) => void;
  readonly onClose: () => void;
  readonly title?: string;
}) {
  return <EmojiPickerSheet title={title ?? translate(currentInterfaceLanguage(), 'composer.emoji.title')} onPick={onPick} onClose={onClose} />;
}
