import { useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';

/**
 * LE CADRE DES EMOJIS RAPIDES (#7980, puis #7985 — miroir `QuickEmojiGrid.swift`
 * et `UniversalComposerBar+Send.swift`).
 *
 * TROIS emojis EN PERMANENCE, sur une rangée, à la hauteur de la ligne de
 * saisie — focus ou non (directive porteur 2026-09-25). Le cadre vit DANS la
 * ligne, à la place du bouton d'envoi : la barre d'outils garde toute sa
 * largeur. La forme « cinq en 3 + 2 sur tout le côté droit » de #7980 est
 * retirée, et avec elle toute compensation de la barre.
 *
 * Chaque tap ENVOIE l'emoji — deux taps, deux messages : aucun dédoublonnage
 * par contenu ne les fusionne (#7985).
 *
 * LA LISTE — iOS classe les emojis par USAGE (`EmojiUsageTracker.topEmojis`),
 * avec `quickSendDefaultEmojis` pour défaut. Le web ne tient AUCUN suivi
 * d'usage des emojis : ce sont donc les premiers de la liste unique
 * `QUICK_REACTIONS` (`lib/view/message-actions.ts`), qui EST ce défaut
 * d'iOS, jamais une seconde liste.
 */
export const QUICK_EMOJI_COUNT = 3;
const CELL = 32;
const GAP = 2;
const INSET = 4;

/** La largeur du cadre — celle que la ligne de saisie lui réserve. */
export const QUICK_EMOJI_FRAME_WIDTH = QUICK_EMOJI_COUNT * CELL + (QUICK_EMOJI_COUNT - 1) * GAP + 2 * INSET;

const QUICK_EMOJIS = QUICK_REACTIONS.slice(0, QUICK_EMOJI_COUNT);

/**
 * LE CADRE QUI REVIENT N'EST PAS ENCORE VIVANT (#7985, mesuré au navigateur) —
 * un double clic sur « Envoyer » : le premier envoie, le bouton part, le
 * cadre revient À LA MÊME PLACE, et le second clic envoyait l'emoji sous le
 * pointeur. Pendant le temps d'un double clic (500 ms, le seuil par défaut
 * des systèmes), le cadre qui ARRIVE ignore les taps. Ce n'est pas un
 * dédoublonnage : le cadre déjà là n'a aucune garde, et 😂 😂 😂 tapés en
 * série partent tous.
 */
export const QUICK_EMOJI_ARRIVAL_MS = 500;

export function QuickEmojiFrame({
  onSend,
  animateIn,
}: {
  readonly onSend: (emoji: string) => void;
  /** Le cadre REVIENT (après un envoi) : il entre par le tourbillon doux
   * (`.composer-slot-in`, #7985) — jamais au premier rendu. */
  readonly animateIn: boolean;
}) {
  const [liveFrom] = useState(() => (animateIn ? performance.now() + QUICK_EMOJI_ARRIVAL_MS : 0));
  const language = currentInterfaceLanguage();
  const sendLabel = translate(language, 'composer.quickEmoji.label');

  return (
    <div
      data-composer-quick-emoji
      role="group"
      aria-label={translate(language, 'composer.quickEmoji.group')}
      className={`glass glass-card flex${animateIn ? ' composer-slot-in' : ''}`}
      style={{
        width: QUICK_EMOJI_FRAME_WIDTH,
        height: 44,
        padding: INSET,
        gap: GAP,
        borderRadius: 16,
        boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 25%, transparent)',
      }}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          /* Ne vole pas le focus du champ au moment du tap (même garde que
             le bouton d'envoi, revue-correction #5813). */
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            if (performance.now() < liveFrom) return;
            onSend(emoji);
          }}
          className="grid min-h-0 shrink-0 place-items-center rounded-[10px] text-[24px] leading-none transition-transform active:scale-90"
          style={{ width: CELL }}
          aria-label={`${sendLabel} ${emoji}`}
        >
          <span aria-hidden>{emoji}</span>
        </button>
      ))}
    </div>
  );
}
