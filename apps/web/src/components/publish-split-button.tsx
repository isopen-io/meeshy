import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PUBLICATION_KINDS, type PublicationKind } from '@/lib/stories/publication-kind';
import { PUBLICATION_LAYOUT_ORDER, publicationLayoutLabelKey, type PublishChoice } from '@/lib/stories/publication-layout';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { Glyph } from './glyph';

/** LE GLYPHE D'UN AGENCEMENT, CHARGÉ À LA DEMANDE (#7684) — il tire la
 * géométrie des cinq modes (`mosaicTiles`, `lib/feed/mosaic-layout.ts`) : elle
 * ne pèse sur le chunk du studio que si l'auteur déplie la ligne « Post ». Les
 * LIGNES, elles, sont statiques : leur hauteur ne dépend pas du glyphe (la
 * réserve de `LAYOUT_MARK_SIZE` tient sa place), donc la mesure du menu est
 * juste dès le commit qui les monte. */
const LayoutMark = lazy(() => import('./layout-mark').then((m) => ({ default: m.LayoutMark })));

/**
 * **LA CAPSULE PUBLIER, SCINDÉE** — `[Publier la story | ▾]` (#7497,
 * directive porteur 2026-09-22).
 *
 * La partie principale publie le choix EN COURS (`onPrimary`) ; le chevron
 * ouvre « Publier comme » et publie au format choisi — un geste, une
 * publication, comme le menu de la flèche iOS (`ComposerPublishMenu`).
 *
 * Un format que la composition ne sert pas (un réel sans média qualifiant, une
 * story de plusieurs pages) reste AU MENU, grisé AVEC sa raison — il ne saute
 * pas de place sous le doigt, et il dit quoi faire plutôt que « non »
 * (`ComposerFormatAvailability`).
 *
 * **UN MENU DANS LE MENU** (#7684, `ComposerPublishMenu.swift:165-210`) : là où
 * la disposition voyage (`layoutsServedFor`), la ligne du format N'EST PLUS un
 * bouton qui publie — elle DÉPLIE ses cinq agencements (`aria-haspopup`,
 * `aria-expanded`), et chacun publie. Le navigateur n'a pas de menu imbriqué :
 * les cinq lignes se déplient EN PLACE, dans le même `role="menu"` et le même
 * parcours au clavier (`ArrowRight` déplie, `ArrowLeft` replie).
 */

const MENU_WIDTH = 260;
const MENU_MARGIN = 8;
const MENU_GAP = 6;
const MENU_ITEM_HEIGHT = 56;
const LAYOUT_ITEM_HEIGHT = 44;
const LAYOUT_MARK_SIZE = 18;
const MENU_PADDING = 40;

const KIND_KEY = { STORY: 'story', POST: 'post', REEL: 'reel' } as const;

export const publishTitleKey = (kind: PublicationKind) => `story.studio.publish.as.${KIND_KEY[kind]}` as const;

/** La hauteur du CONTENU du menu, bordures comprises — jamais la hauteur
 * déjà bornée par `maxHeight`, qui ne dirait pas qu'il manque de place. */
const menuHeightOf = (menu: HTMLElement | null): number =>
  menu === null ? 0 : menu.scrollHeight + menu.offsetHeight - menu.clientHeight;

/** Une LIGNE du menu, dans l'ordre VISUEL — celui du parcours au clavier. */
type MenuRow =
  | { readonly type: 'format'; readonly format: PublicationKind; readonly refusal: string | null; readonly expandable: boolean }
  | { readonly type: 'layout'; readonly format: PublicationKind; readonly mode: MosaicLayoutMode };

export function PublishSplitButton({
  language,
  kind,
  label,
  disabled,
  menuDisabled,
  busy,
  refusalOf,
  audienceLabelOf,
  layoutsServedFor,
  onPrimary,
  onChoose,
}: {
  readonly language: InterfaceLanguage;
  /** Le format que la partie principale publie. */
  readonly kind: PublicationKind;
  /** Ce que dit la partie principale — « Publier la story », ou l'état en vol. */
  readonly label: string;
  readonly disabled: boolean;
  readonly menuDisabled: boolean;
  readonly busy: boolean;
  /** La raison pour laquelle un format ne peut pas partir, ou `null`. */
  readonly refusalOf: (kind: PublicationKind) => string | null;
  /** **CE QUE CE FORMAT PARTIRAIT COMME AUDIENCE** (#7683). */
  readonly audienceLabelOf?: (kind: PublicationKind) => string;
  /** **CE FORMAT DÉPLIE-T-IL SES AGENCEMENTS ?** (#7684, `layoutIsServed`) —
   * absent ⇒ aucun sous-menu, exactement comme avant #7684. */
  readonly layoutsServedFor?: (kind: PublicationKind) => boolean;
  /** La partie principale : publier le choix EN COURS, que l'hôte tient. */
  readonly onPrimary: () => void;
  /** Un geste du menu : un format, et sa disposition s'il en a choisi une. */
  readonly onChoose: (choice: PublishChoice) => void;
}) {
  const [box, setBox] = useState<{ top: number; right: number; width: number; maxHeight: number }>({
    top: 0,
    right: 0,
    width: MENU_WIDTH,
    maxHeight: 0,
  });
  const [expanded, setExpanded] = useState<PublicationKind | null>(null);
  /** La ligne à focaliser APRÈS le commit qui déplie ou replie. */
  const pendingFocus = useRef<number | null>(null);

  const rows: readonly MenuRow[] = PUBLICATION_KINDS.flatMap((format): MenuRow[] => {
    const refusal = refusalOf(format);
    const expandable = refusal === null && (layoutsServedFor?.(format) ?? false);
    const head: MenuRow = { type: 'format', format, refusal, expandable };
    if (!expandable || expanded !== format) return [head];
    return [head, ...PUBLICATION_LAYOUT_ORDER.map((mode): MenuRow => ({ type: 'layout', format, mode }))];
  });

  const { open, setOpen, activeIndex, setActiveIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: rows.length,
    isDisabledAt: (index) => {
      const row = rows[index];
      return row?.type === 'format' && row.refusal !== null;
    },
    computeInitialIndex: () => Math.max(0, rows.findIndex((row) => row.type === 'format' && row.format === kind)),
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  /** Le menu se place du côté où il TIENT, et ne dépasse jamais la place de ce
   * côté-là : au-delà, il DÉFILE en lui-même — jamais il ne recouvre la
   * capsule qui l'ouvre (leçon #7683), jamais il ne sort de l'écran. */
  const place = (menuHeight: number) => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const roomBelow = window.innerHeight - anchor.bottom - MENU_GAP - MENU_MARGIN;
    const roomAbove = anchor.top - MENU_GAP - MENU_MARGIN;
    const maxHeight = Math.max(roomBelow, roomAbove);
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: Math.min(menuHeight, maxHeight),
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width, maxHeight });
  };
  const measure = () => place(PUBLICATION_KINDS.length * MENU_ITEM_HEIGHT + MENU_PADDING);

  useEffect(() => {
    if (!open) setExpanded(null);
  }, [open]);

  /** LA HAUTEUR RÉELLE, AVANT LA PEINTURE (revue-correction #7683) — remesurée
   * à l'OUVERTURE et à chaque dépliage : cinq lignes de plus rendaient le menu
   * plus haut que sa place, et il recouvrait la capsule (#7684). La hauteur
   * lue est celle du CONTENU (`scrollHeight`), pas celle déjà bornée. */
  useLayoutEffect(() => {
    if (!open) return;
    const height = menuHeightOf(menuRef.current);
    if (height > 0) place(height);
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    setActiveIndex(target);
    itemRefs.current[target]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expanded]);

  /** ET CE QUI ARRIVE APRÈS LE COMMIT — le glyphe d'un agencement se charge
   * à la demande et, peint, fait passer un libellé sur deux lignes : mesuré au
   * navigateur, le menu déplié débordait alors de 9 px sur sa capsule. Tant
   * que le menu est ouvert, tout changement de sa taille le REPLACE. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!open || menu === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const height = menuHeightOf(menu);
      if (height > 0) place(height);
    });
    observer.observe(menu, { box: 'border-box' });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const expand = (format: PublicationKind, index: number) => {
    pendingFocus.current = index + 1;
    setExpanded(format);
  };
  const collapse = (format: PublicationKind) => {
    pendingFocus.current = rows.findIndex((row) => row.type === 'format' && row.format === format);
    setExpanded(null);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const row = rows[activeIndex];
    if (event.key === 'ArrowRight' && row?.type === 'format' && row.expandable && expanded !== row.format) {
      event.preventDefault();
      expand(row.format, activeIndex);
      return;
    }
    if (event.key === 'ArrowLeft' && row !== undefined && expanded === row.format) {
      event.preventDefault();
      collapse(row.format);
      return;
    }
    onMenuKeyDown(event);
  };

  const choose = (choice: PublishChoice) => {
    setOpen(false);
    onChoose(choice);
  };

  const menuLabel = translate(language, 'story.studio.publish.menu');
  const layoutSection = translate(language, 'story.studio.layout.title');

  const renderRow = (row: MenuRow, index: number) => {
    const focusProps = {
      ref: (element: HTMLButtonElement | null) => {
        itemRefs.current[index] = element;
      },
      tabIndex: index === activeIndex ? 0 : -1,
    };
    if (row.type === 'layout') {
      return (
        <button
          key={`${row.format}:${row.mode}`}
          type="button"
          role="menuitem"
          data-publish-layout-choice={row.mode}
          {...focusProps}
          onClick={() => choose({ kind: row.format, layout: row.mode })}
          className="flex w-full items-center gap-3 px-4 text-left text-body"
          style={{ minHeight: LAYOUT_ITEM_HEIGHT, color: 'var(--color-ios-ink)' }}
        >
          <Suspense fallback={<span aria-hidden="true" className="shrink-0" style={{ width: LAYOUT_MARK_SIZE, height: LAYOUT_MARK_SIZE }} />}>
            <LayoutMark mode={row.mode} size={LAYOUT_MARK_SIZE} />
          </Suspense>
          {translate(language, publicationLayoutLabelKey(row.mode))}
        </button>
      );
    }
    const isExpanded = expanded === row.format;
    return (
      <button
        key={row.format}
        type="button"
        role="menuitem"
        data-publish-kind-choice={row.format}
        aria-disabled={row.refusal !== null}
        aria-current={row.format === kind ? 'true' : undefined}
        {...(row.expandable ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': isExpanded } : {})}
        {...focusProps}
        onClick={() => {
          if (row.refusal !== null) return;
          if (!row.expandable) {
            choose({ kind: row.format, layout: null });
            return;
          }
          if (isExpanded) collapse(row.format);
          else expand(row.format, index);
        }}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        style={{ minHeight: 44, color: row.refusal === null ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-3)' }}
      >
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span className="flex items-center gap-2 text-title font-medium">
            {translate(language, `story.studio.kind.${KIND_KEY[row.format]}`)}
            {row.format === kind ? <Glyph name="check" size={14} /> : null}
          </span>
          {audienceLabelOf === undefined ? null : (
            <span data-publish-kind-audience className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
              {audienceLabelOf(row.format)}
            </span>
          )}
          {row.refusal === null ? null : <span className="text-mini">{row.refusal}</span>}
        </span>
        {row.expandable ? (
          <span aria-hidden="true" className="shrink-0" style={{ color: 'var(--color-ios-ink-2)' }}>
            <Glyph name="caretDown" size={14} {...(isExpanded ? { style: { transform: 'rotate(180deg)' } } : {})} />
          </span>
        ) : null}
      </button>
    );
  };

  /** Les lignes d'agencement vivent dans un GROUPE nommé « Disposition des
   * scènes » (`ComposerMosaicChoice.sectionTitle`), juste sous leur format ;
   * les index restent ceux de `rows`, l'ordre du parcours au clavier. */
  const layoutStart = rows.findIndex((row) => row.type === 'layout');
  const layoutEnd = layoutStart === -1 ? -1 : layoutStart + PUBLICATION_LAYOUT_ORDER.length;
  const menuBody =
    layoutStart === -1
      ? rows.map(renderRow)
      : [
          ...rows.slice(0, layoutStart).map((row, offset) => renderRow(row, offset)),
          <div key="layouts" role="group" aria-label={layoutSection} data-publish-layout-group className="pb-1">
            <p aria-hidden="true" className="px-4 pt-1 pb-0.5 text-mini font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
              {layoutSection}
            </p>
            {rows.slice(layoutStart, layoutEnd).map((row, offset) => renderRow(row, layoutStart + offset))}
          </div>,
          ...rows.slice(layoutEnd).map((row, offset) => renderRow(row, layoutEnd + offset)),
        ];

  return (
    <div
      data-publish-split
      className="flex shrink-0 items-center overflow-hidden rounded-chip text-white"
      style={{ backgroundColor: 'var(--color-ios-brand)', opacity: disabled && menuDisabled ? 0.4 : 1 }}
    >
      <button
        type="button"
        data-story-publish
        data-publish-kind={kind}
        onClick={onPrimary}
        disabled={disabled}
        aria-busy={busy}
        className="grid place-items-center px-4 text-body font-semibold focus-visible:outline-2 disabled:opacity-60"
        style={{ minHeight: 44, outlineColor: '#fff', outlineOffset: -4 }}
      >
        {label}
      </button>
      <span aria-hidden="true" style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.4)' }} />
      <button
        ref={buttonRef}
        type="button"
        data-publish-kind-toggle
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={menuDisabled}
        onClick={() => {
          if (!open) measure();
          setOpen((value) => !value);
        }}
        className="grid place-items-center focus-visible:outline-2 disabled:opacity-60"
        style={{ minHeight: 44, minWidth: 44, outlineColor: '#fff', outlineOffset: -4 }}
      >
        <Glyph name="caretDown" size={16} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              data-publish-kind-menu
              onKeyDown={onKeyDown}
              className="fixed z-30 overflow-y-auto overscroll-contain rounded-card py-1 shadow-cast"
              style={{
                top: box.top,
                right: box.right,
                width: box.width,
                ...(box.maxHeight > 0 ? { maxHeight: box.maxHeight } : {}),
                backgroundColor: 'var(--color-ios-card)',
                border: '1px solid var(--color-edge)',
              }}
            >
              <p className="px-3 pt-1.5 pb-1 text-mini font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
                {menuLabel}
              </p>
              {menuBody}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
