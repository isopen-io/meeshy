import type { Attachment } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { attachmentReactionBadge } from '@/lib/view/attachment-reactions';

/**
 * LA PASTILLE DES RÉACTIONS D'UNE PIÈCE, PEINTE (#7894) — miroir de
 * `AttachmentReactionBadge` (`apps/ios/Meeshy/Features/Main/Views/
 * AttachmentReactionBadge.swift`) : coin BAS-GAUCHE de la tuile (le bas-droite
 * porte la durée d'une vidéo), capsule noire 55 %, ou teintée à l'accent de la
 * conversation avec un contour de 2 px quand le lecteur y a réagi. Le total
 * n'est écrit qu'au-delà d'une réaction.
 *
 * L'HÔTE doit être `relative` et ne monter la pastille que sur une pièce NON
 * masquée : une pièce protégée n'annonce rien, pas même un compte (leçon 275,
 * `FocalAttachmentBlock.swift` § `reactionsBadge`).
 */
export function AttachmentReactionBadge({ attachment }: { readonly attachment: Attachment }) {
  const badge = attachmentReactionBadge(attachment);
  if (badge === null) return null;

  const language = currentInterfaceLanguage();
  const base = translate(language, 'media.reactions.badge.a11y');
  const label = badge.mine ? `${base}, ${translate(language, 'media.reactions.badge.mine.a11y')}` : base;

  return (
    <span
      data-attachment-reactions={attachment.id}
      data-mine={badge.mine ? 'true' : 'false'}
      role="img"
      aria-label={`${label} : ${badge.total}`}
      className="pointer-events-none absolute bottom-[5px] left-[5px] z-[1] flex items-center gap-px rounded-full px-[5px] py-[2px] leading-none"
      style={
        badge.mine
          ? {
              backgroundColor: 'color-mix(in srgb, var(--accent) 55%, transparent)',
              boxShadow: 'inset 0 0 0 2px var(--accent), 0 0 4px color-mix(in srgb, var(--accent) 40%, transparent)',
            }
          : { backgroundColor: 'rgba(0,0,0,0.55)' }
      }
    >
      {badge.emojis.map((emoji) => (
        <span key={emoji} aria-hidden style={{ fontSize: 11 }}>
          {emoji}
        </span>
      ))}
      {badge.total > 1 ? (
        <span aria-hidden data-reaction-total className="font-semibold tabular-nums text-white" style={{ fontSize: 9 }}>
          {badge.total}
        </span>
      ) : null}
    </span>
  );
}
