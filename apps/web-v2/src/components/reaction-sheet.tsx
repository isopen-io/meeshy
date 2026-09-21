import { EmojiGrid } from './emoji-grid';
import { Sheet } from './sheet';

/**
 * « AJOUTER UNE RÉACTION » (#5814, § 5 étape 4) — le bouton ＋ du rail ouvre
 * cette feuille : les 20 emojis étendus (`EXTENDED_REACTIONS`, miroir
 * `MessageOverlayMenu.swift:99-104`) en grille, boutons ≥ 44 px. Sans champ
 * de recherche (`Sheet` § 5 étape 4 : les props de recherche sont
 * OPTIONNELLES) — vingt emojis fixes n'ont rien à filtrer.
 *
 * La GRILLE vit dans `emoji-grid.tsx` depuis #7280 : le composeur sert la
 * même pour sa tuile « Emoji », et deux grilles auraient divergé au premier
 * correctif.
 */
export function ReactionSheet({ onPick, onClose }: { readonly onPick: (emoji: string) => void; readonly onClose: () => void }) {
  return (
    <Sheet title="Ajouter une réaction" onClose={onClose}>
      <EmojiGrid onPick={onPick} />
    </Sheet>
  );
}
