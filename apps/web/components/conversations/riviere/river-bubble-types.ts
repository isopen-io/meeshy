/**
 * `river-bubble-types.ts` — ce que `RiverBubble` affiche pour un message
 * (R-134, miroir web de `RiverBubbleContent`, `RiverBubbleView.swift`).
 *
 * `RiverBubbleLaw` (le type `RiverBubble` de `river-lanes.ts`, la loi) ne
 * connaît ni texte ni nom — ce type porte ce que la loi ne porte pas, résolu
 * par l'APPELANT de `RiverThread`. Le Prisme (résolution de langue) s'applique
 * LÀ, côté appelant, comme pour toute bulle du Fil (amendement R) — ce fichier
 * et les composants qui le consomment ne résolvent AUCUNE langue, AUCUN
 * `useQuery` (garde R15 / WF-113).
 */

import type { RiverBubble as RiverBubbleLaw } from '@meeshy/shared/utils/river-lanes';

/** « La citation est une RÉFÉRENCE, pas une relecture » (§7ter A4) — une seule ligne tronquée. */
export interface RiverReplyPreview {
  readonly authorDisplayName: string;
  readonly text: string;
}

export interface RiverBubbleContent {
  readonly bubble: RiverBubbleLaw;
  readonly senderDisplayName: string;
  /**
   * Graine de couleur — PAS un hex déjà résolu. Les composants appellent
   * eux-mêmes `colorForName` (`@meeshy/shared/utils/conversation-colors`,
   * contrat R-133/R-134 : « couleur de ligne par participant via
   * DynamicColorGenerator »).
   */
  readonly colorSeed: string;
  readonly timeString: string;
  /** « Le message en ENTIER » (§7ter A1) — jamais tronqué par ce type ni par la peau. */
  readonly text: string;
  readonly replyPreview: RiverReplyPreview | null;
}
