import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { isContextMenuKey, useLongPress } from '@/lib/view/long-press';
import { placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import type { SummaryEntryAction, SummaryEntryMenu } from '@/lib/view/summary-exits';

import { GlyphSvg } from '../glyph';
import { THREAD_MENU_GLYPHS } from '../glyphs-thread-menu';

import type { SummaryEntryPress } from './summary-entry-press';

/**
 * **LE MENU D'APPUI LONG D'UNE ENTRÉE DU RÉSUMÉ** (#11225) — Aller au message ·
 * Répondre, sur un visage de la rampe comme sur un épisode, ouvert par l'appui
 * long, le clic droit, la touche menu et `Maj+F10` (`useLongPress`, le seuil
 * d'iOS). Le toucher garde sa sortie (`summaryExits`) ; le menu sépare ce que
 * le toucher d'un visage fait en un geste — mener au message ET le citer.
 *
 * Même mécanique que le menu d'un avatar (`avatar-menu.tsx`) : `useRovingMenu`
 * pour le clavier et les sorties, `placePopoverVertical` pour le placement,
 * portail dans le `<dialog>` qui porte l'entrée s'il y en a un.
 */

const MENU_WIDTH = 240;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;
/** Le clic que produit le relâcher d'un appui long arrive dans la foulée ; passé ce délai, un clic est un toucher. */
const RELEASE_CLICK_WINDOW_MS = 400;

type OpenEntry = {
  readonly anchor: HTMLElement;
  readonly messageId: string;
  readonly label: string;
  readonly actions: readonly SummaryEntryAction[];
};

/** Un geste né DANS le menu y reste (un portail remonte l'arbre des composants, motif `avatar-menu.tsx`). */
const keepInside = (event: SyntheticEvent) => event.stopPropagation();

const LABEL_KEY: Record<SummaryEntryAction, InterfaceCatalogKey> = {
  goToMessage: 'summary.entry.goTo',
  reply: 'summary.entry.reply',
};

const GLYPH: Record<SummaryEntryAction, (typeof THREAD_MENU_GLYPHS)[keyof typeof THREAD_MENU_GLYPHS]> = {
  goToMessage: THREAD_MENU_GLYPHS.chatText,
  reply: THREAD_MENU_GLYPHS.arrowUUpLeft,
};

function SummaryEntryMenuPanel({
  entry,
  onChoose,
  onClose,
}: {
  readonly entry: OpenEntry;
  readonly onChoose: (action: SummaryEntryAction) => void;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const roving = useRovingMenu({
    itemCount: entry.actions.length,
    returnFocusTo: () => entry.anchor,
    anchor: () => entry.anchor,
    onScroll: onClose,
    onResize: onClose,
    initialOpen: true,
  });

  const wasOpen = useRef(false);
  useEffect(() => {
    if (roving.open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) onClose();
  }, [roving.open, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isContextMenuKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    roving.onMenuKeyDown(event);
  };

  if (!roving.open || typeof document === 'undefined') return null;

  const rect = entry.anchor.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const width = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - 2 * MENU_MARGIN));
  const left = Math.max(MENU_MARGIN, Math.min(rect.left, viewportWidth - width - MENU_MARGIN));
  const { top } = placePopoverVertical({
    anchorTop: rect.top,
    anchorBottom: rect.bottom,
    viewportHeight: window.innerHeight,
    estimatedHeight: entry.actions.length * MENU_ITEM_HEIGHT + MENU_PADDING,
    gap: MENU_GAP,
    margin: MENU_MARGIN,
  });

  return createPortal(
    <div
      ref={roving.menuRef}
      role="menu"
      aria-label={translate(language, 'summary.entry.menu', { name: entry.label })}
      data-summary-entry-menu
      onKeyDown={onKeyDown}
      onPointerDown={keepInside}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-40 overflow-hidden rounded-card py-1 shadow-cast"
      style={{ top, left, width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
    >
      {entry.actions.map((action, index) => (
        <button
          key={action}
          ref={(element) => {
            roving.itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitem"
          data-summary-entry-action={action}
          tabIndex={index === roving.activeIndex ? 0 : -1}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            roving.closeAndFocusButton();
            onChoose(action);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-title font-medium"
          style={{ color: 'var(--color-ios-ink)', minHeight: MENU_ITEM_HEIGHT }}
        >
          <span aria-hidden className="grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
            <GlyphSvg glyph={GLYPH[action]} size={16} />
          </span>
          {translate(language, LABEL_KEY[action])}
        </button>
      ))}
    </div>,
    entry.anchor.closest('dialog') ?? document.body,
  );
}

/**
 * LE GESTE, UNE FOIS, CHEZ L'HÔTE DU RÉSUMÉ — jamais une instance par entrée :
 * `press` s'étale sur chaque visage et chaque épisode (`entryPressAttributes`),
 * et l'élément ouvert dit ce qu'il désigne. `guard` enveloppe les touchers :
 * le relâcher d'un appui long qui vient d'ouvrir le menu n'est pas un toucher.
 * Sans `menu` (aucune capacité), rien n'est étalé et rien ne s'ouvre.
 */
export function useSummaryEntryMenu(menu: SummaryEntryMenu | undefined): {
  readonly press: SummaryEntryPress | undefined;
  readonly guard: <T>(tap: (value: T) => void) => (value: T) => void;
  readonly panel: ReactNode;
} {
  const [open, setOpen] = useState<OpenEntry | null>(null);
  const openRef = useRef(false);
  const swallowClickUntil = useRef(0);

  const longPress = useLongPress({
    enabled: menu !== undefined,
    onOpen: ({ element }) => {
      const messageId = element.dataset['summaryTarget'];
      if (menu === undefined || messageId === undefined) return false;
      const actions = menu.actionsOf(messageId);
      if (actions.length === 0) return false;
      openRef.current = true;
      setOpen({ anchor: element, messageId, label: element.dataset['summaryLabel'] ?? '', actions });
      return true;
    },
  });

  const close = useRef(() => {
    openRef.current = false;
    setOpen(null);
  }).current;

  const press: SummaryEntryPress = {
    ...longPress,
    onPointerDown: (event) => {
      swallowClickUntil.current = 0;
      longPress.onPointerDown(event);
    },
    onPointerUp: () => {
      if (openRef.current) swallowClickUntil.current = Date.now() + RELEASE_CLICK_WINDOW_MS;
      longPress.onPointerUp();
    },
  };

  function guard<T>(tap: (value: T) => void): (value: T) => void {
    return (value) => {
      if (Date.now() < swallowClickUntil.current) {
        swallowClickUntil.current = 0;
        return;
      }
      tap(value);
    };
  }

  const panel =
    open === null || menu === undefined ? null : (
      <SummaryEntryMenuPanel entry={open} onClose={close} onChoose={(action) => menu.run(action, open.messageId)} />
    );

  return { press: menu === undefined ? undefined : press, guard, panel };
}
