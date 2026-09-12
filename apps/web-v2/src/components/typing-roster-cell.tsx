import { Avatar } from './avatar';
import { TypingDots } from './typing-dots';
import type { TypingEntry } from '@/lib/api/typing-store';
import { AVATAR_SIZE, ROW_PADDING_HORIZONTAL } from '@/lib/reading-mode/metrics';
import { initialsOf } from '@/lib/view/conversation';
import { typingAnnouncement, typingLead } from '@/lib/view/typing-roster';

/**
 * LA CELLULE DE FRAPPE DU FIL (#6171, G1) — extraite de `routes/thread-
 * modes.tsx` pour être testable par `renderToStaticMarkup` (motif
 * `thread-chrome.tsx` § `DayPill`/`ScrollToBottomButton`) : une VRAIE cellule
 * du flux, en queue — pas un overlay, elle pousse le fil comme le ferait un
 * message, donc l'arrivée du vrai message ne fait sauter aucune ligne.
 *
 * LE ROSTER ENTIER, jamais le seul premier frappeur — `typingAnnouncement`
 * (`lib/view/typing-roster.ts`) compose « X écrit » / « X et Y écrivent » /
 * « Plusieurs personnes écrivent », miroir `TypingIndicatorBubble.label`
 * (`MessageListViewController.swift:3146-3153`). Le VISAGE reste celui du
 * MENEUR SEUL (`typingLead`, le premier apparu, `lead =
 * participants.first`), quel que soit le nombre de frappeurs : la cellule ne
 * grandit ni ne multiplie ses avatars.
 *
 * DEUX TENUES (`flat`, revue-correction #6171, défaut 4) — miroir
 * `TypingIndicatorBubble(isFlat:)` (`MessageListViewController.swift:3137-
 * 3138`, `:3195-3213`) : en rangée PLATE (Focal/Script, le mode PAR DÉFAUT
 * D-7) une pastille `AVATAR_SIZE` (22, alignée sur la colonne d'identité de
 * `FocalRow` via `ROW_PADDING_HORIZONTAL`) + trois points, SANS capsule ni
 * libellé VISIBLE ; en mode Bulles, la capsule historique (avatar 18 +
 * libellé + points). Avant ce correctif, la cellule rendait TOUJOURS la
 * capsule — l'état NOMINAL de l'écran phare (Focal par défaut) ne
 * correspondait donc jamais à la cible iOS (`targets/focal-script.md:553`).
 *
 * Le libellé reste calculé dans LES DEUX tenues et porté en `aria-label`
 * (miroir `.accessibilityLabel(label)` posé inconditionnellement par iOS,
 * `:3241-3242`) : la tenue plate n'a plus de texte VISIBLE pour le nommer,
 * et un lecteur d'écran doit pouvoir lire la cellule même sans lui. Ce n'est
 * PAS une région live (D-11, #6172 reste ouvert pour l'ANNONCE proactive) —
 * `aria-label` nomme l'élément, il ne le pousse pas au lecteur d'écran de
 * sa propre initiative.
 *
 * `role="img"` SUR LE CONTENEUR (revue-correction, défaut majeur 1) — miroir
 * de `.accessibilityElement(children: .combine)` posé AVANT
 * `.accessibilityLabel` par iOS (`:3241-3242`) : combiner sans laisser le
 * rôle à `generic` (ARIA 1.2 interdit le nommage d'un rôle `generic` —
 * `aria-label` y était exposé par Chromium mais pas garanti par NVDA/Firefox,
 * un premier jet mesuré SEULEMENT sous Chromium et donc vert par omission).
 * `role="img"`
 * est le même choix que fait déjà `Avatar` pour son propre insigne nommé
 * (`components/avatar.tsx`, `role={name === undefined ? undefined : 'img'}`)
 * — un rôle qui AUTORISE le nommage et traite ses enfants comme du contenu
 * d'image opaque : les initiales et les points de la tenue plate restent
 * masqués, et la cellule entière expose UN nom calculé, dans tous les
 * moteurs, pas seulement celui où `aria-label` sur `generic` se trouve
 * toléré. Posé dans les DEUX tenues, comme iOS le fait inconditionnellement.
 *
 * `data-typing-cell`/`data-typing-label` restent le crochet de GATE (motif
 * `data-reading-mode`/`data-message` du fil) pour lire le libellé CALCULÉ
 * sans dépendre du texte visible, absent en tenue plate — mais ce ne sont
 * PAS la preuve d'exposition : celle-ci est `role="img"` + `aria-label` sur
 * le même nœud, seule paire qu'un lecteur d'écran restitue réellement.
 */
export function TypingRosterCell({
  typists,
  accent,
  flat,
}: {
  readonly typists: readonly TypingEntry[];
  readonly accent: string;
  readonly flat: boolean;
}) {
  const lead = typingLead(typists);
  if (lead === undefined) return null;
  const label = typingAnnouncement(typists.map((t) => t.displayName));

  if (flat) {
    return (
      <div
        className="flex items-center gap-[7px] py-1"
        style={{ paddingInline: ROW_PADDING_HORIZONTAL }}
        role="img"
        aria-label={label}
        data-typing-cell
        data-typing-label={label}
      >
        <Avatar initials={initialsOf(lead.displayName)} color={accent} size={AVATAR_SIZE} />
        <TypingDots color={accent} />
      </div>
    );
  }

  return (
    <div
      className="flex items-end gap-1.5 py-1"
      role="img"
      aria-label={label}
      data-typing-cell
      data-typing-label={label}
    >
      <Avatar initials={initialsOf(lead.displayName)} color={accent} size={18} />
      <span
        className="flex items-center gap-1.5 rounded-chip px-3 py-2"
        style={{ backgroundColor: 'var(--color-ios-card)' }}
      >
        <span className="text-time" style={{ color: 'var(--color-ios-ink-2)' }}>
          {label}
        </span>
        <TypingDots color="var(--accent)" />
      </span>
    </div>
  );
}
