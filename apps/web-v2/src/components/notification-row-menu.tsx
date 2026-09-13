import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { Glyph, GlyphSvg } from './glyph';
import { NOTIFICATIONS_GLYPHS } from './glyphs-notifications';

/**
 * **LE MENU D'UNE LIGNE DE LA CLOCHE** (#6288) — « Marquer comme lue » et
 * « Supprimer ».
 *
 * iOS déclare `onMarkRead` / `onDelete` sur `NotificationRowView` sans aucun
 * véhicule pour les servir (le `.swipeActions` a été retiré : il n'agit que
 * dans une `List`). Le web leur en donne un, et c'est le MÊME que les rangées
 * de la liste des conversations (`row-actions.tsx`, #5559) : un bouton de
 * rangée qui ouvre un menu en portail. Même mécanique clavier
 * (`useRovingMenu`), même placement (`popover.ts`), même visibilité — au
 * survol et au focus sur un poste à souris, en permanence au doigt
 * (`.row-action-button`, `app.css`).
 *
 * Deux écarts voulus avec son aîné, qui ne connaît que des conversations : ses
 * libellés viennent du catalogue d'interface, et son fond est OPAQUE — la garde
 * du verre (`scripts/lib/glass-site.mjs`) n'admet qu'un fond translucide de
 * bouton de rangée, celui de la liste, avec sa raison.
 */

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;
/** 34 dessinés + le débord de `tap-target-34` = 44, le plancher du dépôt. */
const BUTTON_SIZE = 34;

type MenuItem = { readonly id: 'markRead' | 'delete'; readonly label: string; readonly icon: ReactNode; readonly run: () => void };

export function NotificationRowMenu({
  language,
  unread,
  onMarkRead,
  onDelete,
}: {
  readonly language: InterfaceLanguage;
  readonly unread: boolean;
  readonly onMarkRead: () => void;
  readonly onDelete: () => void;
}) {
  const items: readonly MenuItem[] = [
    ...(unread
      ? [
          {
            id: 'markRead' as const,
            label: translate(language, 'notifications.action.markRead'),
            icon: <Glyph name="check" size={16} />,
            run: onMarkRead,
          },
        ]
      : []),
    {
      id: 'delete',
      label: translate(language, 'notifications.action.delete'),
      icon: <GlyphSvg glyph={NOTIFICATIONS_GLYPHS.trash} size={16} />,
      run: onDelete,
    },
  ];
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });

  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: items.length,
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  const measure = () => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: items.length * MENU_ITEM_HEIGHT + MENU_PADDING,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width });
  };

  const label = translate(language, 'notifications.actions');

  return (
    <div className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!open) measure();
          setOpen((value) => !value);
        }}
        className={`row-action-button tap-target-34 grid place-items-center rounded-chip transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ width: BUTTON_SIZE, height: BUTTON_SIZE, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)' }}
      >
        <Glyph name="dotsThreeVertical" size={18} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKeyDown}
              className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
              style={{ top: box.top, right: box.right, width: box.width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
            >
              {items.map((item, index) => (
                <button
                  key={item.id}
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  data-notification-action={item.id}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    item.run();
                    closeAndFocusButton();
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-title font-medium"
                  style={{ color: item.id === 'delete' ? 'var(--color-error)' : 'var(--color-ios-ink)', minHeight: MENU_ITEM_HEIGHT }}
                >
                  <span className="grid place-items-center" style={{ color: item.id === 'delete' ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
