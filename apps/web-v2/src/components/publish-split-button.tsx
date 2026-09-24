import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { MosaicLayoutMode } from '@/lib/feed/mosaic-layout';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { PUBLICATION_KINDS, type PublicationKind } from '@/lib/stories/publication-kind';
import { layoutIsServed } from '@/lib/stories/publication-layout';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';

import { Glyph } from './glyph';

/** CHARGÉ À LA DEMANDE (revue-correction du poids, #7684) — voir le
 * doc-commentaire de `publication-layout.ts` : ce sous-menu ne pèse sur le
 * chunk du studio QUE si l'auteur le déplie effectivement. */
const PublishLayoutMenu = lazy(() => import('./publish-layout-menu').then((m) => ({ default: m.PublishLayoutMenu })));

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
  pageCount,
  layoutValue = 'carousel',
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
  /** **LE NOMBRE DE PAGES DU DOCUMENT** (#7684) — gouverne le sous-menu de
   * disposition sur la ligne « Post » (`layoutIsServed`). `undefined` pour un
   * appelant sans notion de pages : aucun sous-menu ne se propose alors,
   * exactement comme avant #7684. */
  readonly pageCount?: number;
  /** LA DISPOSITION EN COURS — coche la ligne choisie dans le sous-menu ;
   * défaut `'carousel'` (`ComposerMosaicChoice.fallback`), le mode qu'obtient
   * l'auteur qui ne touche jamais le chevron. */
  readonly layoutValue?: MosaicLayoutMode;
  /** `layout` n'est fourni QUE lorsque l'auteur a choisi une ligne du
   * sous-menu de disposition ; `undefined` sur un geste ordinaire (la partie
   * principale, ou une ligne de format SANS sous-menu) — le repli du modèle
   * s'applique alors (`ComposerPublishChoice(format, layout: nil)`). */
  readonly onPublish: (kind: PublicationKind, layout?: MosaicLayoutMode) => void;
}) {
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });
  /** **LE SOUS-MENU DES AGENCEMENTS EST DÉPLIÉ EN PLACE** (#7684) — jamais un
   * second `<Menu>` imbriqué (qui n'existe pas au navigateur) : la ligne
   * « Post » porte un second bouton (`aria-haspopup="menu"`/`aria-expanded`)
   * qui déplie ses cinq lignes DANS LE MÊME `role="menu"`, sous elle. Fermé à
   * chaque (ré)ouverture du menu parent. */
  const [layoutOpen, setLayoutOpen] = useState(false);
  const layoutServed = pageCount !== undefined && layoutIsServed({ pageCount, kind: 'POST' });
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
  /** Cinq lignes de disposition estimées SANS importer leur ordre (poids,
   * #7684) — la mesure RÉELLE post-montage (`useLayoutEffect` ci-dessous)
   * corrige tout écart, comme elle le fait déjà pour l'audience et les
   * raisons de refus. */
  const LAYOUT_ROWS = 5;
  const measure = () => place(PUBLICATION_KINDS.length * MENU_ITEM_HEIGHT + MENU_PADDING + (layoutOpen ? LAYOUT_ROWS * MENU_ITEM_HEIGHT : 0));

  /** LA HAUTEUR RÉELLE, AVANT LA PEINTURE (revue-correction #7683) — l'estimé
   * ne sait pas combien de lignes porte chaque format : la ligne d'audience
   * (#7683) et une raison de refus qui passe sur deux lignes rendaient le
   * menu plus haut que prévu, et il RECOUVRAIT la capsule qui l'ouvre. Mesuré
   * une fois monté, replacé dans la même image. */
  useEffect(() => {
    if (!open) setLayoutOpen(false);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const height = menuRef.current?.getBoundingClientRect().height ?? 0;
    if (height > 0) place(height);
    // `place` lit des refs et la fenêtre : l'OUVERTURE et le dépliage du
    // sous-menu de disposition (qui change la hauteur du menu) redéclenchent
    // la mesure — sans quoi le sous-menu déplié RECOUVRIRAIT la capsule.
  }, [open, layoutOpen]);

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
          else setLayoutOpen(false);
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
                const layoutsHere = choice === 'POST' && layoutServed;
                return (
                  <div key={choice}>
                    <div className="flex w-full items-stretch">
                      <button
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
                        className="flex min-w-0 flex-1 flex-col items-start px-3 py-2 text-left"
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
                      {layoutsHere ? (
                        <button
                          type="button"
                          data-publish-layout-toggle
                          aria-label={translate(language, 'story.studio.layout.menu')}
                          aria-haspopup="menu"
                          aria-expanded={layoutOpen}
                          onClick={() => setLayoutOpen((value) => !value)}
                          className="grid shrink-0 place-items-center"
                          style={{ width: 44, minHeight: 44, color: 'var(--color-ios-ink-2)' }}
                        >
                          <Glyph name="caretDown" size={14} {...(layoutOpen ? { style: { transform: 'rotate(180deg)' } } : {})} />
                        </button>
                      ) : null}
                    </div>
                    {layoutsHere && layoutOpen ? (
                      <Suspense fallback={null}>
                        <PublishLayoutMenu
                          language={language}
                          value={layoutValue}
                          onChoose={(mode) => {
                            setOpen(false);
                            setLayoutOpen(false);
                            onPublish('POST', mode);
                          }}
                        />
                      </Suspense>
                    ) : null}
                  </div>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
