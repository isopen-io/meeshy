import { recordEmojiUsage, topEmojis } from '@/lib/emoji-usage';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { EXTENDED_REACTIONS, QUICK_REACTIONS } from '@/lib/view/message-actions';
import { RAIL_TILE } from '@/lib/view/message-menu-metrics';

import { GlyphSvg } from './glyph';

/**
 * LE RAIL DE RÉACTIONS, ÉCRIT UNE FOIS (#10583) — le menu du message (appui
 * long) et la barre rapide de la capsule « + » posent les MÊMES tuiles : les
 * emojis les plus utilisés (`topEmojis`, `emoji-usage.ts`), puis « ＋ » qui
 * mène à la feuille complète. Miroir `EmojiReactionPicker` (MeeshyUI), que
 * `MessageOverlayMenu` et `quickReactionBar` partagent côté iOS.
 *
 * Ce fichier porte les TUILES et le CLASSEMENT. Le placement, le parcours
 * clavier et la fermeture restent à l'hôte : le menu est une couche modale
 * sur un voile, la barre un menu ancré à sa capsule.
 *
 * Une RÉACTION compte un emploi (`recordEmojiUsage`) — ici, pour que les deux
 * hôtes alimentent le classement de la même façon.
 */
export const RAIL_ITEM_COUNT = QUICK_REACTIONS.length + 1;

export const quickReactionEmojis = (): readonly string[] =>
  topEmojis({ count: QUICK_REACTIONS.length, defaults: EXTENDED_REACTIONS });

const PLUS_GLYPH = {
  viewBox: '0 0 256 256',
  body: '<path d="M224,128a8,8,0,0,1-8,8H136v80a8,8,0,0,1-16,0V136H40a8,8,0,0,1,0-16h80V40a8,8,0,0,1,16,0v80h80A8,8,0,0,1,224,128Z"/>',
} as const;

export function ReactionRailTiles({
  emojis,
  language,
  activeIndex,
  itemRef,
  onPick,
  onExpand,
}: {
  readonly emojis: readonly string[];
  readonly language: InterfaceLanguage;
  /** La tuile que Tab atteint (roving tabindex de l'hôte). */
  readonly activeIndex: number;
  readonly itemRef: (index: number, element: HTMLButtonElement | null) => void;
  readonly onPick: (emoji: string) => void;
  readonly onExpand: () => void;
}) {
  return (
    <>
      {[...emojis, '+'].map((tile, index) => {
        const isPlus = index === emojis.length;
        return (
          <button
            key={isPlus ? 'plus' : tile}
            ref={(el) => itemRef(index, el)}
            type="button"
            role="menuitem"
            tabIndex={index === activeIndex ? 0 : -1}
            aria-label={isPlus ? translate(language, 'message.menu.addReaction') : tile}
            data-add-reaction={isPlus ? '' : undefined}
            className="tap-target-34 grid place-items-center rounded-full"
            style={{ width: RAIL_TILE, height: RAIL_TILE, fontSize: 22 }}
            onClick={() => {
              if (isPlus) {
                onExpand();
                return;
              }
              recordEmojiUsage(tile);
              onPick(tile);
            }}
          >
            {isPlus ? <GlyphSvg glyph={PLUS_GLYPH} size={16} /> : tile}
          </button>
        );
      })}
    </>
  );
}
