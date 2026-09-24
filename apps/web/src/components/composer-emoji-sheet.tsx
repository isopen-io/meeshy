import { EmojiGrid } from './emoji-grid';
import { Sheet } from './sheet';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « INSÉRER UN EMOJI » (#7280) — la palette de la tuile « Emoji » du tiroir,
 * miroir de `composer.attach.emoji` (`UniversalComposerBar+Attachments.swift:283-288`).
 *
 * MÊME GRILLE que « Ajouter une réaction » (`EmojiGrid`, seule liste du
 * dépôt), AUTRE effet : ici le caractère choisi entre dans le TEXTE en cours,
 * là il se pose sur un message. iOS tient exactement cette distinction — la
 * tuile emoji insère dans le champ, la tuile sticker compose un message
 * (le doc-comment de `carouselTiles` la formule mot pour mot).
 */
export function ComposerEmojiSheet({
  onPick,
  onClose,
}: {
  readonly onPick: (emoji: string) => void;
  readonly onClose: () => void;
}) {
  return (
    <Sheet title={translate(currentInterfaceLanguage(), 'composer.emoji.title')} onClose={onClose}>
      <EmojiGrid onPick={onPick} />
    </Sheet>
  );
}
