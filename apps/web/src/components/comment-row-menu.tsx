import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import type { ReportReason } from '@/lib/api/reports';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { CommentMenuEntry } from '@/lib/view/comment-menu';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { Glyph, GlyphSvg } from './glyph';
import { NOTIFICATIONS_GLYPHS } from './glyphs-notifications';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { ReportSheet } from './report-sheet';

/**
 * **LE MENU « … » D'UNE RANGÉE DE COMMENTAIRE** (#8734, jumelle web de #8709)
 * — miroir du `Menu` de `CommentRowView.swift` : le cœur et « Répondre »
 * restent à découvert, tout le reste vit derrière « … », à droite de la
 * rangée. Les ENTRÉES sont une loi pure (`commentMenuEntries`) ; ce composant
 * les peint et rend le geste choisi à la rangée.
 *
 * La MÉCANIQUE est celle du menu d'une carte du fil (`feed-post-menu.tsx`) :
 * portail, `useRovingMenu`, `popover.ts`, 44 px par entrée. Deux écarts, dus
 * à la feuille des stories et des Réels qui porte aussi ce fil :
 *  - la feuille ferme sur Échap en phase de CAPTURE du document ; le menu
 *    écoute donc Échap en capture de la FENÊTRE, qui la précède — sans quoi
 *    Échap fermerait la feuille entière au lieu du seul menu ;
 *  - la feuille arrête la propagation de `pointerdown` (le plateau navigue
 *    sur ce geste) ; l'appui HORS du menu s'écoute donc en capture aussi.
 *
 * « Signaler » demande son motif (`ReportSheet`, la feuille de tout
 * signalement) : choisir un motif EST la confirmation.
 */
const MENU_WIDTH = 248;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;
const MENU_Z_INDEX = 300;

const DESTRUCTIVE: ReadonlySet<CommentMenuEntry> = new Set(['delete', 'report']);

const LABEL = {
  copy: 'feed.post.menu.copy_text',
  image: 'comments.action.image',
  imageWithReplies: 'comments.action.image_with_replies',
  edit: 'comments.action.edit',
  delete: 'comments.action.delete',
  report: 'report.action',
} as const satisfies Readonly<Record<CommentMenuEntry, InterfaceCatalogKey>>;

const ICON: Readonly<Record<CommentMenuEntry, () => ReactNode>> = {
  copy: () => <GlyphSvg glyph={THREAD_MENU_GLYPHS.copy} size={16} />,
  image: () => <GlyphSvg glyph={THREAD_MENU_GLYPHS.imageSquare} size={16} />,
  imageWithReplies: () => <GlyphSvg glyph={THREAD_MENU_GLYPHS.imageSquare} size={16} />,
  edit: () => <GlyphSvg glyph={THREAD_MENU_GLYPHS.pencilSimple} size={16} />,
  delete: () => <GlyphSvg glyph={NOTIFICATIONS_GLYPHS.trash} size={16} />,
  report: () => <Glyph name="warningCircle" size={16} />,
};

/** Le geste choisi — « Signaler » arrive avec son motif. */
export type CommentMenuPick = { readonly entry: Exclude<CommentMenuEntry, 'report'> } | { readonly entry: 'report'; readonly reason: ReportReason };

export function CommentRowMenu({
  entries,
  language,
  authorName,
  triggerRef,
  onPick,
}: {
  readonly entries: readonly CommentMenuEntry[];
  readonly language: InterfaceLanguage;
  readonly authorName: string;
  /** Le déclencheur, que la rangée refocalise au retour d'une modification. */
  readonly triggerRef: { current: HTMLButtonElement | null };
  readonly onPick: (pick: CommentMenuPick) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });
  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: entries.length,
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  /* POSÉES DANS LE COMMIT QUI OUVRE LE MENU (#7293, `roving-menu.ts`) : un effet passif, différé d'une image sous Preact, laissait un Échap précoce à la feuille, qui se fermait avec le menu. */
  useLayoutEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeAndFocusButton();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (entries.length === 0) return null;

  const measure = () => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: entries.length * MENU_ITEM_HEIGHT + MENU_PADDING,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width });
  };

  const label = translate(language, 'feed.post.more_options');

  return (
    <>
      <button
        ref={(element) => {
          buttonRef.current = element;
          triggerRef.current = element;
        }}
        type="button"
        data-comment-gesture="more"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) measure();
          setOpen((value) => !value);
        }}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-chip focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ marginInlineStart: 'auto', color: 'var(--color-ios-ink-3)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <GlyphSvg glyph={THREAD_MENU_GLYPHS.dotsThree} size={18} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              data-comment-menu=""
              onKeyDown={onMenuKeyDown}
              className="fixed overflow-hidden rounded-card py-1 shadow-cast"
              style={{
                top: box.top,
                right: box.right,
                width: box.width,
                zIndex: MENU_Z_INDEX,
                backgroundColor: 'var(--color-ios-card)',
                border: '1px solid var(--color-edge)',
                colorScheme: 'light dark',
              }}
            >
              {entries.map((entry, index) => {
                const destructive = DESTRUCTIVE.has(entry);
                /* Le séparateur d'iOS (`Divider()`) : avant le premier verbe
                   destructeur, qu'il soit « Supprimer » ou « Signaler ». */
                const separe = destructive && index > 0 && !DESTRUCTIVE.has(entries[index - 1] ?? 'copy');
                return (
                  <button
                    key={entry}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    data-comment-gesture={entry === 'imageWithReplies' ? 'image-replies' : entry}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => {
                      closeAndFocusButton();
                      if (entry === 'report') {
                        setReporting(true);
                        return;
                      }
                      onPick({ entry });
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-start text-title font-medium"
                    style={{
                      color: destructive ? 'var(--color-error)' : 'var(--color-ios-ink)',
                      minHeight: MENU_ITEM_HEIGHT,
                      ...(separe ? { borderTop: '0.5px solid var(--color-edge)' } : {}),
                    }}
                  >
                    <span aria-hidden className="grid place-items-center" style={{ color: destructive ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}>
                      {ICON[entry]()}
                    </span>
                    {translate(language, LABEL[entry])}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}

      {reporting ? (
        <ReportSheet
          name={authorName}
          title={translate(language, 'comments.report.title')}
          busy={false}
          onPick={(reason) => {
            setReporting(false);
            onPick({ entry: 'report', reason });
            buttonRef.current?.focus();
          }}
          onClose={() => {
            setReporting(false);
            buttonRef.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
