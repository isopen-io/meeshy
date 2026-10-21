import { EmojiPickerSheet } from './emoji-picker-sheet';

export { prepareEmojiPickerSheet } from './emoji-picker-sheet';
import { recordEmojiUsage } from '@/lib/emoji-usage';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * « AJOUTER UNE RÉACTION » (#5814, § 5 étape 4) — le bouton ＋ du rail ouvre
 * cette feuille. Depuis #10531 c'est la feuille d'emojis COMPLÈTE
 * (`EmojiPickerSheet` : catégories, recherche, récents), qui s'ouvre sur les
 * vingt emojis étendus (`EXTENDED_REACTIONS`, miroir
 * `MessageOverlayMenu.swift:99-104`).
 *
 * La feuille vit dans `emoji-picker-sheet.tsx` : le composeur sert la même
 * pour sa tuile « Emoji », et deux feuilles auraient divergé au premier
 * correctif. Seule une RÉACTION compte un emploi (`recordEmojiUsage`), qui
 * classe le rail du menu d'un message.
 */
export function ReactionSheet({ onPick, onClose }: { readonly onPick: (emoji: string) => void; readonly onClose: () => void }) {
  return (
    <EmojiPickerSheet
      title={translate(currentInterfaceLanguage(), 'message.menu.addReaction')}
      onPick={(emoji) => {
        recordEmojiUsage(emoji);
        onPick(emoji);
      }}
      onClose={onClose}
    />
  );
}
