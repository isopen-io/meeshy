import { createContext, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { AvatarMenuEntry } from '@/lib/view/avatar-menu';
import { isContextMenuKey, useLongPress } from '@/lib/view/long-press';
import { peekProfile } from '@/lib/view/profile-peek';
import { placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { href, navigate } from '@/routes/route-table';

import { Glyph } from './glyph';

/**
 * **L'HÔTE QUI SAIT OUVRIR LES DÉTAILS DE LA CONVERSATION** (#7828, #7829) —
 * posé par l'écran du fil, lu par chaque avatar d'auteur qu'il monte. Sans
 * lui (`null`), l'entrée « Détails de la conversation » n'existe pas : un
 * avatar hors d'un fil n'a pas de conversation à détailler (loi 4).
 *
 * Un contexte plutôt qu'une prop : l'avatar vit trois niveaux sous l'écran
 * (fil → rangée → peau → avatar), et les deux peaux (`Bubble`, `FocalRow`)
 * n'ont rien à faire de cette capacité sinon la transmettre.
 */
export const ConversationDetailsContext = createContext<(() => void) | null>(null);

const MENU_WIDTH = 240;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;

/**
 * L'ÉLÉMENT DONT ON MESURE LA PLACE — l'enveloppe du déclencheur est en
 * `display: contents` (elle ne dessine aucune boîte, pour ne rien changer à la
 * mise en page de l'avatar qu'elle entoure) : sa propre boîte est nulle, c'est
 * celle de son premier enfant qui dit où est l'avatar.
 */
const boxOf = (element: HTMLElement): DOMRect => (element.firstElementChild ?? element).getBoundingClientRect();

/** Ce qui reprend le focus à la fermeture : le lien ou le bouton enveloppé. */
const focusTargetOf = (element: HTMLElement): HTMLElement =>
  element.querySelector<HTMLElement>('a[href], button, [tabindex]') ?? element;

/**
 * Un geste né DANS le menu y reste. Sous React, un portail fait remonter ses
 * événements le long de l'arbre des COMPOSANTS : sans cet arrêt, un appui long
 * sur une entrée remonterait jusqu'à la rangée du message et ouvrirait SON
 * menu par-dessus. Échap, lui, doit continuer jusqu'au `document`, où
 * `useRovingMenu` l'écoute : seule la touche menu est arrêtée au clavier.
 */
const keepInside = (event: SyntheticEvent) => event.stopPropagation();

export function AvatarMenu({
  entries,
  anchor,
  name,
  onClose,
  onOpenDetails,
}: {
  readonly entries: readonly AvatarMenuEntry[];
  readonly anchor: HTMLElement;
  readonly name: string;
  readonly onClose: () => void;
  readonly onOpenDetails?: (() => void) | undefined;
}) {
  const language = currentInterfaceLanguage();
  const roving = useRovingMenu({
    itemCount: entries.length,
    returnFocusTo: () => focusTargetOf(anchor),
    anchor: () => (anchor.firstElementChild as HTMLElement | null) ?? anchor,
    onScroll: onClose,
    onResize: onClose,
    initialOpen: true,
  });

  /* Monté DÉJÀ ouvert : l'hôte se referme quand `useRovingMenu` bascule
     `open` à faux (Échap, appui hors du menu) — même mécanique que le menu du
     message (`message-menu.tsx`). */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (roving.open) {
      wasOpen.current = true;
      return;
    }
    if (wasOpen.current) onClose();
  }, [roving.open, onClose]);

  const rect = boxOf(anchor);
  const viewportWidth = typeof window === 'undefined' ? MENU_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  const width = Math.min(MENU_WIDTH, Math.max(0, viewportWidth - 2 * MENU_MARGIN));
  const left = Math.max(MENU_MARGIN, Math.min(rect.left, viewportWidth - width - MENU_MARGIN));
  const { top } = placePopoverVertical({
    anchorTop: rect.top,
    anchorBottom: rect.bottom,
    viewportHeight,
    estimatedHeight: entries.length * MENU_ITEM_HEIGHT + MENU_PADDING,
    gap: MENU_GAP,
    margin: MENU_MARGIN,
  });

  const run = (entry: AvatarMenuEntry) => {
    switch (entry.kind) {
      case 'profile':
        if (!peekProfile(entry.username)) navigate(href('userProfile', { username: entry.username }));
        return;
      case 'story':
        navigate(href('story', { post: entry.post }));
        return;
      case 'details':
        onOpenDetails?.();
        return;
    }
  };

  const labelOf = (entry: AvatarMenuEntry): string => {
    switch (entry.kind) {
      case 'profile':
        return translate(language, 'avatar.menu.view_profile');
      case 'story':
        return translate(language, 'avatar.menu.view_story');
      case 'details':
        return translate(language, 'avatar.menu.conversation_details');
    }
  };

  const glyphOf = (entry: AvatarMenuEntry) => {
    switch (entry.kind) {
      case 'profile':
        return 'user' as const;
      case 'story':
        return 'fillPlay' as const;
      case 'details':
        return 'users' as const;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (isContextMenuKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    roving.onMenuKeyDown(event);
  };

  if (!roving.open || typeof document === 'undefined') return null;

  /* DANS le `<dialog>` qui porte l'avatar, s'il y en a un : une feuille
     modale (`sheet.tsx`, `showModal()`) rend INERTE tout ce qui vit hors
     d'elle — un menu posé sur `document.body` y serait peint sous la couche
     du dessus et ne recevrait aucun toucher. */
  const host = anchor.closest('dialog') ?? document.body;

  return createPortal(
    <div
      ref={roving.menuRef}
      role="menu"
      aria-label={translate(language, 'avatar.menu.label', { name })}
      data-avatar-menu
      onKeyDown={onKeyDown}
      onPointerDown={keepInside}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className="fixed z-40 overflow-hidden rounded-card py-1 shadow-cast"
      style={{ top, left, width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
    >
      {entries.map((entry, index) => (
        <button
          key={entry.kind}
          ref={(element) => {
            roving.itemRefs.current[index] = element;
          }}
          type="button"
          role="menuitem"
          data-avatar-menu-entry={entry.kind}
          tabIndex={index === roving.activeIndex ? 0 : -1}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            roving.closeAndFocusButton();
            run(entry);
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-title font-medium"
          style={{ color: 'var(--color-ios-ink)', minHeight: MENU_ITEM_HEIGHT }}
        >
          <span aria-hidden className="grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
            <Glyph name={glyphOf(entry)} size={16} />
          </span>
          {labelOf(entry)}
        </button>
      ))}
    </div>,
    host,
  );
}

/**
 * **LE DÉCLENCHEUR DU MENU D'AVATAR** (#7828) — enveloppe une identité (un
 * avatar, un nom, une pile d'avatars) et lui donne l'appui long, le clic droit,
 * la touche menu et `Maj+F10`. Le TOUCHER de ce qu'il enveloppe reste le sien :
 * l'enveloppe ne pose aucun `onClick`, elle n'en RETIENT qu'un — celui qui suit
 * le relâcher d'un appui long, sans quoi le doigt levé après l'ouverture du
 * menu suivrait aussi le lien et quitterait l'écran sous le menu.
 *
 * `display: contents` : l'enveloppe ne dessine rien, la géométrie de l'avatar
 * (et les témoins qui la mesurent) reste celle qu'elle était.
 *
 * `-webkit-touch-callout: none` : sur Safari iOS, un appui long sur un lien
 * ouvre l'aperçu natif du lien — il couvrirait le menu, et c'est le menu que
 * l'appui long demande.
 *
 * Sans entrée, l'enveloppe n'existe pas : l'appui long revient à l'hôte parent
 * (le menu du message), plutôt qu'à un menu vide.
 */
export function AvatarMenuTrigger({
  entries,
  name,
  onOpenDetails,
  children,
}: {
  readonly entries: readonly AvatarMenuEntry[];
  readonly name: string;
  readonly onOpenDetails?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const swallowNextClick = useRef(false);
  const longPress = useLongPress({
    onOpen: ({ element }) => {
      setAnchor(element);
    },
  });

  if (entries.length === 0) return <>{children}</>;

  return (
    <>
      <span
        className="contents"
        style={{ WebkitTouchCallout: 'none' }}
        data-avatar-menu-trigger
        {...longPress}
        onPointerDown={(event) => {
          swallowNextClick.current = false;
          longPress.onPointerDown(event);
        }}
        onPointerUp={() => {
          /* Le menu s'est ouvert PENDANT l'appui : le clic que ce relâcher va
             produire n'est pas un toucher, c'est la fin de l'appui long. */
          if (anchor !== null) swallowNextClick.current = true;
          longPress.onPointerUp();
        }}
        onClickCapture={(event) => {
          if (!swallowNextClick.current) return;
          swallowNextClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {children}
      </span>
      {anchor === null ? null : (
        <AvatarMenu entries={entries} anchor={anchor} name={name} onClose={() => setAnchor(null)} onOpenDetails={onOpenDetails} />
      )}
    </>
  );
}
