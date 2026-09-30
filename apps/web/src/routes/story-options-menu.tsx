import { useEffect, useRef, useState } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { GLYPHS } from '@/components/glyphs';
import { THREAD_MENU_GLYPHS } from '@/components/glyphs-thread-menu';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE MENU (…) DU LECTEUR DE STORIES** (#8823) — miroir du `Menu` à
 * `ellipsis` de `StoryViewerView+Header.swift`, posé à côté de la fermeture.
 *
 * Demande porteur 2026-09-30 : « Enregistrer » y appelle la sauvegarde
 * EXISTANTE, offerte à TOUT lecteur. Le menu ne sait pas enregistrer : il
 * reçoit `onSave` de l'hôte — `useStoryOwnerRail().handlers.save`, le geste
 * du rail auteur (route d'export filigranée `@auteur`, store de progression
 * partagé) — et le déclenche. Aucune seconde implémentation.
 *
 * Loi 4 : sans `onSave` (story sans média exportable, hôte sans porte
 * fichier), aucun bouton — un menu vide n'a pas d'effet.
 *
 * `onPointerDown` stoppé comme sur `CloseButton` : le plateau navigue au
 * pointeur, et ouvrir le menu ne doit pas faire avancer la story.
 */
export function StoryOptionsMenu({
  language,
  onSave,
  onOpenChange,
}: {
  readonly language: InterfaceLanguage;
  readonly onSave?: (() => void) | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const change = (next: boolean) => {
    setOpen(next);
    onOpenChangeRef.current?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') change(false);
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

  if (onSave === undefined) return null;

  const label = translate(language, 'feed.post.more_options');

  return (
    <div ref={rootRef} className="pointer-events-auto relative shrink-0" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        data-story-options=""
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => change(!open)}
        className="grid place-items-center rounded-full"
        style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <GlyphSvg glyph={THREAD_MENU_GLYPHS.dotsThree} size={18} style={{ color: '#fff' }} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={label}
          className="absolute end-0 top-full z-50 mt-1 grid min-w-48 overflow-hidden rounded-card py-1 shadow-cast"
          style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)', colorScheme: 'light dark' }}
        >
          <button
            type="button"
            role="menuitem"
            data-story-option="save"
            onClick={() => {
              change(false);
              onSave();
            }}
            className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-start text-title font-medium"
            style={{ color: 'var(--color-ios-ink)' }}
          >
            <span aria-hidden className="grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
              <GlyphSvg glyph={GLYPHS.downloadSimple} size={18} />
            </span>
            {translate(language, 'story.action.save')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
