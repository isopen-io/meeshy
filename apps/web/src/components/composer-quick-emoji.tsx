import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';

/**
 * LE CADRE DES EMOJIS RAPIDES (#7980, jumelle web de #7961 et #7966 —
 * miroir `QuickEmojiGrid.swift` et `UniversalComposerBar+Send.swift`).
 *
 * Champ vide et NON focalisé : les CINQ premiers, en 3 + 2, dans un cadre de
 * verre qui prend TOUT le côté droit du composeur — du haut de la barre
 * d'outils au bas de la ligne de saisie. Le cadre se pose en absolu dans le
 * « pont » du composeur (`data-composer-deck`, `position: relative`), et la
 * barre d'outils lui réserve sa droite (`reserveEnd`).
 *
 * Au FOCUS : il se replie à la hauteur de la ligne, les TROIS premiers sur
 * une rangée, et la barre d'outils retrouve toute sa largeur. Le MÊME nœud
 * change de forme — jamais un remplacement — pour que le focus clavier posé
 * sur un emoji survive au passage d'une forme à l'autre.
 *
 * LA LISTE — iOS classe les emojis par USAGE (`EmojiUsageTracker.topEmojis`),
 * avec `quickSendDefaultEmojis` pour défaut. Le web ne tient AUCUN suivi
 * d'usage des emojis : ce sont donc les premiers de la liste unique
 * `QUICK_REACTIONS` (`lib/view/message-actions.ts`), qui EST ce défaut
 * d'iOS, jamais une seconde liste.
 */
export const QUICK_EMOJI_COUNT = 5;
export const QUICK_EMOJI_FOCUSED_COUNT = 3;
const FIRST_ROW_COUNT = 3;
const CELL = 32;
const GAP = 2;
const INSET = 4;

/** La largeur du cadre — celle que la ligne de saisie lui réserve. */
export const QUICK_EMOJI_FRAME_WIDTH = FIRST_ROW_COUNT * CELL + (FIRST_ROW_COUNT - 1) * GAP + 2 * INSET;

/** Hors focus, trois puis deux ; au focus, les trois premiers sur une
 * rangée. Jamais de rangée vide (miroir `QuickEmojiGrid.rows`). */
export function quickEmojiRows(emojis: readonly string[], { focused }: { readonly focused: boolean }): readonly (readonly string[])[] {
  const served = emojis.slice(0, focused ? QUICK_EMOJI_FOCUSED_COUNT : QUICK_EMOJI_COUNT);
  return [served.slice(0, FIRST_ROW_COUNT), served.slice(FIRST_ROW_COUNT)].filter((row) => row.length > 0);
}

export function QuickEmojiFrame({
  focused,
  onSend,
}: {
  /** Le champ a le focus : le cadre se replie sur la ligne de saisie. */
  readonly focused: boolean;
  readonly onSend: (emoji: string) => void;
}) {
  const language = currentInterfaceLanguage();
  const sendLabel = translate(language, 'composer.quickEmoji.label');
  const coversToolbar = !focused;

  return (
    <div
      data-composer-quick-emoji
      data-covers-toolbar={coversToolbar ? 'true' : 'false'}
      role="group"
      aria-label={translate(language, 'composer.quickEmoji.group')}
      className={`glass glass-card flex flex-col ${coversToolbar ? 'absolute' : 'relative'}`}
      style={{
        width: QUICK_EMOJI_FRAME_WIDTH,
        padding: INSET,
        gap: GAP,
        borderRadius: 16,
        boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 25%, transparent)',
        ...(coversToolbar
          ? /* Du haut de la barre d'outils (`pt-1.5`) au bas de la ligne de
               saisie (`py-2.5`), collé au bord de fin (`px-3`) — en logique,
               donc juste en RTL. */
            { top: 6, bottom: 10, insetInlineEnd: 12 }
          : { height: 44 }),
      }}
    >
      {quickEmojiRows(QUICK_REACTIONS, { focused }).map((row, index) => (
        <div key={index} data-quick-emoji-row className="flex min-h-0 flex-1" style={{ gap: GAP }}>
          {row.map((emoji) => (
            <button
              key={emoji}
              type="button"
              /* Ne vole pas le focus du champ au moment du tap (même garde que
                 le bouton d'envoi, revue-correction #5813). */
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onSend(emoji)}
              className="grid min-h-0 shrink-0 place-items-center rounded-[10px] text-[24px] leading-none transition-transform active:scale-90"
              style={{ width: CELL }}
              aria-label={`${sendLabel} ${emoji}`}
            >
              <span aria-hidden>{emoji}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
