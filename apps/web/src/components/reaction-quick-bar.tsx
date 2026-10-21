import { useEffect, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { RAIL_GAP, RAIL_HEIGHT, RAIL_TILE_GAP, RAIL_WIDTH, SIDE_PADDING } from '@/lib/view/message-menu-metrics';
import { placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { safeAreaInsets } from '@/lib/view/safe-area';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

import { Glyph } from './glyph';
import { quickReactionEmojis, RAIL_ITEM_COUNT, ReactionRailTiles } from './reaction-rail';

/**
 * LA CAPSULE « + » ET SA BARRE RAPIDE (#10583) — sous le dernier message
 * REÇU, on réagit d'un geste sans ouvrir le menu. Miroir
 * `BubbleReactionsOverlay.addButton` (la capsule, `!isMe &&
 * isLastReceivedMessage`) et `ConversationView+MessageRow.quickReactionBar`
 * (la barre des plus utilisés, dont « ＋ » ouvre le sélecteur complet).
 *
 * La barre pose le rail du menu du message (`ReactionRailTiles`) : mêmes
 * tuiles, même classement, aucune seconde liste d'emojis.
 *
 * C'EST UN MENU ANCRÉ, PAS UNE COUCHE MODALE — `useRovingMenu` en porte la
 * mécanique : Échap et un toucher ailleurs referment, un défilement qui
 * déplace la capsule referme (une barre immobile désignerait un autre
 * message), les flèches parcourent les tuiles. Le retour matériel Android
 * referme la barre plutôt que de quitter le fil (`useBackDismiss`, posé
 * seulement tant qu'elle est ouverte).
 *
 * L'ACCENT est relu sur la capsule et reposé sur le portail, qui vit hors de
 * la portée de `--accent` (même raison que `message-menu.tsx::accentOf`).
 *
 * LA MÊME BARRE S'OUVRE AU DOUBLE TOUCHER D'UN MESSAGE (#10599, décision
 * porteur du 2026-10-14 : « sur le web le double toucher peut ouvrir plutôt un
 * petit menu de réaction rapide ») — `MessageReactionQuickBar`, ancrée au
 * message ou à la tuile visée, centrée sous le doigt. Une seule barre
 * (`QuickBarRail`) sert les deux portes.
 */
type BarBox = { readonly top: number; readonly left: number; readonly width: number; readonly accent: string | undefined };

/** `centerX` : le point touché, sur lequel la barre se centre ; absent, elle s'aligne sur le bord de l'ancre. */
function barBoxOf(anchor: HTMLElement, centerX?: number): BarBox {
  const rect = anchor.getBoundingClientRect();
  const safe = safeAreaInsets();
  const width = Math.min(RAIL_WIDTH, Math.max(0, window.innerWidth - 2 * SIDE_PADDING));
  const { top } = placePopoverVertical({
    anchorTop: rect.top,
    anchorBottom: rect.bottom,
    viewportHeight: window.innerHeight - safe.bottom,
    estimatedHeight: RAIL_HEIGHT,
    gap: RAIL_GAP,
    margin: SIDE_PADDING + safe.top,
  });
  const start = centerX === undefined ? rect.left : centerX - width / 2;
  const left = Math.max(SIDE_PADDING, Math.min(start, window.innerWidth - width - SIDE_PADDING));
  const accent = getComputedStyle(anchor).getPropertyValue('--accent').trim();
  return { top, left, width, accent: accent === '' ? undefined : accent };
}

const isRtl = (): boolean => document.documentElement.dir === 'rtl';

export function ReactionAddCapsule({
  onReact,
  onExpand,
}: {
  readonly onReact: (emoji: string) => void;
  /** « ＋ » de la barre : la feuille d'emojis complète. */
  readonly onExpand: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [emojis, setEmojis] = useState(quickReactionEmojis);
  const [box, setBox] = useState<BarBox | null>(null);
  const roving = useRovingMenu({
    itemCount: RAIL_ITEM_COUNT,
    onScroll: () => roving.setOpen(false),
    onResize: () => roving.setOpen(false),
  });

  const toggle = () => {
    const anchor = roving.buttonRef.current;
    if (roving.open || anchor === null) {
      roving.setOpen(false);
      return;
    }
    setEmojis(quickReactionEmojis());
    setBox(barBoxOf(anchor));
    roving.setOpen(true);
  };

  return (
    <>
      <button
        ref={roving.buttonRef}
        type="button"
        data-reaction-add
        aria-label={translate(language, 'message.menu.addReaction')}
        aria-haspopup="menu"
        aria-expanded={roving.open}
        onClick={toggle}
        className="reaction-add-capsule grid place-items-center rounded-full"
      >
        <Glyph name="smiley" size={14} />
      </button>
      {roving.open && box !== null ? <QuickBarRail box={box} emojis={emojis} roving={roving} onReact={onReact} onExpand={onExpand} /> : null}
    </>
  );
}

/**
 * LA BARRE DU DOUBLE TOUCHER (#10599) — montée OUVERTE par son hôte tant que
 * la cible est posée ; toute fermeture (choix, « ＋ », Échap, toucher
 * ailleurs, défilement qui déplace le message, retour matériel) passe par
 * `onClose`, qui la démonte. Le focus revient au message.
 */
export function MessageReactionQuickBar({
  anchor,
  x,
  onReact,
  onExpand,
  onClose,
}: {
  /** Ce qui ancre la barre : la rangée du message, ou la tuile de la pièce visée. */
  readonly anchor: HTMLElement;
  /** Le point touché, sur lequel la barre se centre. */
  readonly x: number;
  readonly onReact: (emoji: string) => void;
  readonly onExpand: () => void;
  readonly onClose: () => void;
}) {
  const [emojis] = useState(quickReactionEmojis);
  const [box] = useState(() => barBoxOf(anchor, x));
  const roving = useRovingMenu({
    itemCount: RAIL_ITEM_COUNT,
    initialOpen: true,
    anchor: () => anchor,
    returnFocusTo: () => anchor,
    onScroll: () => roving.setOpen(false),
    onResize: () => roving.setOpen(false),
  });
  const { open } = roving;
  useEffect(() => {
    if (!open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return open ? <QuickBarRail box={box} emojis={emojis} roving={roving} onReact={onReact} onExpand={onExpand} /> : null;
}

/** La barre posée en portail : le rail, son parcours clavier, ses sorties — écrite une fois pour les deux portes. */
function QuickBarRail({
  box,
  emojis,
  roving,
  onReact,
  onExpand,
}: {
  readonly box: BarBox;
  readonly emojis: readonly string[];
  readonly roving: ReturnType<typeof useRovingMenu>;
  readonly onReact: (emoji: string) => void;
  readonly onExpand: () => void;
}) {
  const language = currentInterfaceLanguage();
  const onBarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      roving.closeAndFocusButton();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const forward = (event.key === 'ArrowRight') !== isRtl();
      if (roving.handleKey(forward ? 'ArrowDown' : 'ArrowUp')) event.preventDefault();
      return;
    }
    roving.onMenuKeyDown(event);
  };
  return createPortal(
    <ReactionQuickBar
      box={box}
      onKeyDown={onBarKeyDown}
      menuRef={roving.menuRef}
      label={translate(language, 'message.menu.react')}
      onBack={() => roving.setOpen(false)}
    >
      <ReactionRailTiles
        emojis={emojis}
        language={language}
        activeIndex={roving.activeIndex}
        itemRef={(index, el) => {
          roving.itemRefs.current[index] = el;
        }}
        onPick={(emoji) => {
          roving.closeAndFocusButton();
          onReact(emoji);
        }}
        onExpand={() => {
          roving.setOpen(false);
          onExpand();
        }}
      />
    </ReactionQuickBar>,
    document.body,
  );
}

function ReactionQuickBar({
  box,
  label,
  menuRef,
  onKeyDown,
  onBack,
  children,
}: {
  readonly box: BarBox;
  readonly label: string;
  readonly menuRef: ReturnType<typeof useRovingMenu>['menuRef'];
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  useBackDismiss(onBack);
  const style: CSSProperties = {
    position: 'fixed',
    top: box.top,
    left: box.left,
    width: box.width,
    height: RAIL_HEIGHT,
    gap: RAIL_TILE_GAP,
    ...(box.accent === undefined ? {} : ({ '--accent': box.accent } as CSSProperties)),
  };
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      aria-orientation="horizontal"
      data-reaction-quick-bar
      className="message-menu-rail reaction-quick-bar glass glass-card"
      onKeyDown={onKeyDown}
      style={style}
    >
      {children}
    </div>
  );
}
