import { Suspense, lazy, useRef, useState } from 'react';

import { recordEmojiUsage, topEmojis } from '@/lib/emoji-usage';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useLongPress } from '@/lib/view/long-press';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';

const ComposerEmojiSheet = lazy(() =>
  import('./composer-emoji-sheet').then((m) => ({ default: m.ComposerEmojiSheet })),
);

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
 * LA LISTE (#7983) — classée par USAGE comme iOS (`EmojiUsageTracker
 * .topEmojis`, jumelle web `lib/emoji-usage.ts`), `QUICK_REACTIONS` pour
 * défaut. Lue au montage : l'ordre ne bouge pas sous le doigt pendant une
 * série d'envois, il se reclasse au retour du cadre.
 *
 * L'APPUI LONG (#7931) — comme la touche Menu, Maj+F10 et le clic droit —
 * ouvre la palette des emojis ; l'emoji choisi part directement.
 */
export const QUICK_EMOJI_COUNT = 3;
const CELL = 32;
const GAP = 2;
const INSET = 4;

/** La largeur du cadre — celle que la ligne de saisie lui réserve. */
export const QUICK_EMOJI_FRAME_WIDTH = QUICK_EMOJI_COUNT * CELL + (QUICK_EMOJI_COUNT - 1) * GAP + 2 * INSET;

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
  const [emojis] = useState(() => topEmojis({ count: QUICK_EMOJI_COUNT, defaults: QUICK_REACTIONS }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const holding = useRef(false);
  const pressOpened = useRef(false);
  const longPress = useLongPress({
    onOpen: () => {
      pressOpened.current = holding.current;
      setPickerOpen(true);
    },
  });
  const release = () => {
    holding.current = false;
    longPress.onPointerUp();
  };
  const language = currentInterfaceLanguage();
  const sendLabel = translate(language, 'composer.quickEmoji.label');

  const sendEmoji = (emoji: string) => {
    recordEmojiUsage(emoji);
    onSend(emoji);
  };

  return (
    <>
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
        {emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            {...longPress}
            /* Ne vole pas le focus du champ au moment du tap (même garde que
               le bouton d'envoi, revue-correction #5813). */
            onPointerDown={(e) => {
              e.preventDefault();
              holding.current = e.button === 0;
              pressOpened.current = false;
              longPress.onPointerDown(e);
            }}
            onPointerUp={release}
            onPointerCancel={release}
            onClick={() => {
              if (pressOpened.current) {
                pressOpened.current = false;
                return;
              }
              if (performance.now() < liveFrom) return;
              sendEmoji(emoji);
            }}
            className="grid min-h-0 shrink-0 place-items-center rounded-[10px] text-[24px] leading-none transition-transform active:scale-90"
            style={{ width: CELL, touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none' }}
            aria-label={`${sendLabel} ${emoji}`}
            aria-haspopup="dialog"
            aria-keyshortcuts="Shift+F10"
            aria-description={translate(language, 'composer.quickEmoji.moreHint')}
          >
            <span aria-hidden>{emoji}</span>
          </button>
        ))}
      </div>
      {pickerOpen ? (
        <div data-quick-emoji-picker className="contents">
          <Suspense fallback={null}>
            <ComposerEmojiSheet
              title={translate(language, 'composer.quickEmoji.more')}
              onPick={(emoji) => {
                setPickerOpen(false);
                sendEmoji(emoji);
              }}
              onClose={() => setPickerOpen(false)}
            />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}
