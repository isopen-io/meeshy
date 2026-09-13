import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';

import { Sheet } from './sheet';

/**
 * « AJOUTER UNE RÉACTION » (#5814, § 5 étape 4) — le bouton ＋ du rail ouvre
 * cette feuille : les 20 emojis étendus (`EXTENDED_REACTIONS`, miroir
 * `MessageOverlayMenu.swift:99-104`) en grille, boutons ≥ 44 px. Sans champ
 * de recherche (`Sheet` § 5 étape 4 : les props de recherche sont
 * OPTIONNELLES) — vingt emojis fixes n'ont rien à filtrer.
 */
export function ReactionSheet({ onPick, onClose }: { readonly onPick: (emoji: string) => void; readonly onClose: () => void }) {
  return (
    <Sheet title="Ajouter une réaction" onClose={onClose}>
      <li className="grid grid-cols-5 gap-2 px-4 py-3">
        {EXTENDED_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            className="grid place-items-center rounded-chip text-2xl"
            style={{ minHeight: 44, minWidth: 44, backgroundColor: 'var(--color-ios-card)' }}
            onClick={() => onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
      </li>
    </Sheet>
  );
}
