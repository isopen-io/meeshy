import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PUBLICATION_KINDS, type PublicationKind } from '@/lib/stories/publication-kind';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { Glyph } from './glyph';

/**
 * **LA CAPSULE PUBLIER, SCINDÉE** — `[Publier la story | ▾]` (#7497,
 * directive porteur 2026-09-22).
 *
 * La partie principale publie au format du POINT D'ENTRÉE, qu'elle NOMME ;
 * le chevron ouvre « Publier comme » et publie au format choisi — un geste,
 * une publication, comme le menu de la flèche iOS (`ComposerPublishMenu`).
 * Sans toucher au chevron, la publication part comme indiqué.
 *
 * Un format que la composition ne sert pas (un réel sans média qualifiant)
 * reste AU MENU, grisé AVEC sa raison — il ne saute pas de place sous le
 * doigt, et il dit quoi faire plutôt que « non » (`ComposerFormatAvailability`).
 */

const MENU_WIDTH = 260;
const MENU_MARGIN = 8;
const MENU_GAP = 6;
const MENU_ITEM_HEIGHT = 56;
const MENU_PADDING = 40;

const KIND_KEY = { STORY: 'story', POST: 'post', REEL: 'reel' } as const;

export const publishTitleKey = (kind: PublicationKind) => `story.studio.publish.as.${KIND_KEY[kind]}` as const;

export function PublishSplitButton({
  language,
  kind,
  label,
  disabled,
  menuDisabled,
  busy,
  refusalOf,
  audienceLabelOf,
  onPublish,
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
  /** **CE QUE CE FORMAT PARTIRAIT COMME AUDIENCE** (#7683) — optionnel : les
   * appelants qui n'ont pas d'audience (aucun aujourd'hui hors le studio) ne
   * rendent aucune ligne, un menu qui n'a rien à dire ne le dit pas. */
  readonly audienceLabelOf?: (kind: PublicationKind) => string;
  readonly onPublish: (kind: PublicationKind) => void;
}) {
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });
  const { open, setOpen, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: PUBLICATION_KINDS.length,
    isDisabledAt: (index) => refusalOf(PUBLICATION_KINDS[index]!) !== null,
    computeInitialIndex: () => Math.max(0, PUBLICATION_KINDS.indexOf(kind)),
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  const place = (menuHeight: number) => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor === undefined) return;
    const placement = placePopover({ anchorRight: anchor.right, viewportWidth: window.innerWidth, preferredWidth: MENU_WIDTH, margin: MENU_MARGIN });
    const vertical = placePopoverVertical({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom,
      viewportHeight: window.innerHeight,
      estimatedHeight: menuHeight,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width });
  };
  const measure = () => place(PUBLICATION_KINDS.length * MENU_ITEM_HEIGHT + MENU_PADDING);

  /** LA HAUTEUR RÉELLE, AVANT LA PEINTURE (revue-correction #7683) — l'estimé
   * ne sait pas combien de lignes porte chaque format : la ligne d'audience
   * (#7683) et une raison de refus qui passe sur deux lignes rendaient le
   * menu plus haut que prévu, et il RECOUVRAIT la capsule qui l'ouvre. Mesuré
   * une fois monté, replacé dans la même image. */
  useLayoutEffect(() => {
    if (!open) return;
    const height = menuRef.current?.getBoundingClientRect().height ?? 0;
    if (height > 0) place(height);
    // `place` lit des refs et la fenêtre : seule l'OUVERTURE redéclenche la mesure.
  }, [open]);

  const menuLabel = translate(language, 'story.studio.publish.menu');

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
        onClick={() => onPublish(kind)}
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
              onKeyDown={onMenuKeyDown}
              className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
              style={{ top: box.top, right: box.right, width: box.width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
            >
              <p className="px-3 pt-1.5 pb-1 text-mini font-semibold" style={{ color: 'var(--color-ios-ink-3)' }}>
                {menuLabel}
              </p>
              {PUBLICATION_KINDS.map((choice, index) => {
                const refusal = refusalOf(choice);
                return (
                  <button
                    key={choice}
                    type="button"
                    role="menuitem"
                    data-publish-kind-choice={choice}
                    aria-disabled={refusal !== null}
                    aria-current={choice === kind ? 'true' : undefined}
                    ref={(element) => {
                      itemRefs.current[index] = element;
                    }}
                    tabIndex={index === activeIndex ? 0 : -1}
                    onClick={() => {
                      if (refusal !== null) return;
                      setOpen(false);
                      onPublish(choice);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left"
                    style={{ minHeight: 44, color: refusal === null ? 'var(--color-ios-ink)' : 'var(--color-ios-ink-3)' }}
                  >
                    <span className="flex items-center gap-2 text-title font-medium">
                      {translate(language, `story.studio.kind.${KIND_KEY[choice]}`)}
                      {choice === kind ? <Glyph name="check" size={14} /> : null}
                    </span>
                    {audienceLabelOf === undefined ? null : (
                      <span data-publish-kind-audience className="text-mini" style={{ color: 'var(--color-ios-ink-3)' }}>
                        {audienceLabelOf(choice)}
                      </span>
                    )}
                    {refusal === null ? null : <span className="text-mini">{refusal}</span>}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
