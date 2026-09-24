import { EXTENDED_REACTIONS } from '@/lib/view/message-actions';

/**
 * LA GRILLE DES VINGT EMOJIS (#7280) — extraite de `ReactionSheet` (#5814)
 * quand le composeur a eu besoin de la MÊME grille pour sa tuile « Emoji »
 * (`composer.attach.emoji`, `UniversalComposerBar+Attachments.swift:283-288`).
 *
 * Une grille recopiée aurait été la jumelle divergente que ce dépôt combat le
 * plus : deux listes d'emojis, deux tailles de cible, et la première
 * correction d'accessibilité appliquée à une seule. `EXTENDED_REACTIONS`
 * (miroir `MessageOverlayMenu.swift:99-104`) reste la SEULE liste.
 *
 * Les deux hôtes diffèrent par ce qu'ils FONT du choix — une réaction posée
 * sur un message, ou un caractère inséré dans le texte en cours — jamais par
 * ce qu'ils MONTRENT.
 */
export function EmojiGrid({ onPick }: { readonly onPick: (emoji: string) => void }) {
  return (
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
  );
}
