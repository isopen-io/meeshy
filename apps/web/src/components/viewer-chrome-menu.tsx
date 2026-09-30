import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { VIEWER_GLASS, type ViewerProbe } from './viewer-chrome';

/**
 * **LE MENU « … » ET LA TRAÎNÉE D'ÉMOJIS DES VISIONNEUSES** (#8879) — deux
 * surfaces qui s'OUVRENT depuis le chrome, extraites de leurs deux jumelles :
 * le menu d'options du lecteur de stories (`story-options-menu.tsx`) et la
 * traînée de réactions de la visionneuse de médias (`viewer-media-actions.tsx`).
 * iOS range l'enregistrement de la galerie DANS son menu « … » (#6145,
 * `ConversationMediaGalleryView+Menu.swift`) comme la story : un même geste,
 * une même place.
 */

export type ViewerMenuItem = {
  readonly key: string;
  readonly label: string;
  readonly glyph: ReactNode;
  /** Absente ⇒ l'entrée n'existe pas ; aucune entrée ⇒ aucun menu (loi 4). */
  readonly onSelect?: (() => void) | undefined;
  readonly destructive?: boolean;
};

export function ViewerMenu({
  label,
  items,
  onOpenChange,
  probe,
}: {
  readonly label: string;
  readonly items: readonly ViewerMenuItem[];
  readonly probe?: ViewerProbe;
  /** L'hôte met sa lecture en pause tant que le menu est ouvert. */
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const change = (next: boolean): void => {
    setOpen(next);
    onOpenChangeRef.current?.(next);
  };

  useEffect(() => {
    if (!open) return;
    /* ÉCHAP FERME LE MENU, ET LUI SEUL — écouté en CAPTURE et arrêté : sans
       cela, la même touche remontait à la visionneuse, qui se refermait sous
       le menu qu'on voulait seulement quitter. */
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      change(false);
      buttonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      change(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = items.filter((item) => item.onSelect !== undefined);
  if (shown.length === 0) return null;

  return (
    <div ref={rootRef} className="pointer-events-auto relative shrink-0" onPointerDown={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        {...probe}
        data-viewer-menu-button=""
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          change(!open);
        }}
        className="grid size-11 place-items-center rounded-full"
      >
        <span className={`${VIEWER_GLASS} viewer-disc grid place-items-center rounded-full`}>
          <GlyphSvg glyph={THREAD_MENU_GLYPHS.dotsThree} size={18} />
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute end-0 top-full z-50 mt-1 grid min-w-48 overflow-hidden rounded-card py-1 shadow-cast"
          style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)', colorScheme: 'light dark' }}
        >
          {shown.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-viewer-menu-item={item.key}
              {...(item.destructive === true ? { 'data-destructive': 'true' } : {})}
              onClick={(event) => {
                event.stopPropagation();
                change(false);
                item.onSelect?.();
              }}
              className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-start text-title font-medium"
              style={{ color: item.destructive === true ? 'var(--color-error)' : 'var(--color-ios-ink)' }}
            >
              <span aria-hidden="true" className="grid place-items-center" style={{ color: item.destructive === true ? 'inherit' : 'var(--color-ios-ink-2)' }}>
                {item.glyph}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ViewerReactionTray({
  label,
  reactions,
  mine,
  labelOf,
  onPick,
}: {
  readonly label: string;
  readonly reactions: readonly string[];
  /** Les émojis que le lecteur a déjà posés — `aria-pressed`. */
  readonly mine: readonly string[];
  /** Le nom accessible de chaque émoji (« Réagir avec ❤️ »), traduit par l'hôte. */
  readonly labelOf: (emoji: string) => string;
  readonly onPick: (emoji: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-viewer-reactions=""
      className={`${VIEWER_GLASS} flex max-w-[85vw] gap-1 overflow-x-auto rounded-full px-1`}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      {reactions.map((emoji) => (
        <button
          key={emoji}
          type="button"
          data-viewer-reaction={emoji}
          aria-label={labelOf(emoji)}
          aria-pressed={mine.includes(emoji)}
          onClick={(event) => {
            event.stopPropagation();
            onPick(emoji);
          }}
          className="grid size-11 place-items-center rounded-full text-2xl"
        >
          <span aria-hidden="true">{emoji}</span>
        </button>
      ))}
    </div>
  );
}
