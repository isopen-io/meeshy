import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { Link } from '@/routes/route-table';

import { Glyph, GlyphSvg } from './glyph';
import { FEED_GLYPHS } from './glyphs-feed';

/**
 * **LA PORTE DE CRÉATION DU FLUX** (#7449) — « Publication » ou « Réel »,
 * deux adresses sous un seul contrôle.
 *
 * ## Pourquoi un MENU et pas deux boutons
 *
 * L'en-tête du Flux tient déjà un retour et « Lancer les Réels ». À 320 px,
 * une quatrième cible de 44 px mange le titre. Le menu ramène la création à UN
 * contrôle et garde le chemin nominal à deux gestes (dimension 7) — et le
 * format choisi ici reste RÉVERSIBLE dans le composer unique (#7497), dont la
 * capsule `[Publier … | ▾]` publie au format de la porte ou, par son chevron,
 * en story, post ou réel : le menu pose une intention, il ne l'enferme pas.
 *
 * ## Pourquoi elle se pose À GAUCHE de « Lancer les Réels »
 *
 * Ce n'est pas une préférence : `check-reels.mjs` mesure que le bouton des
 * Réels touche le bord droit (`innerWidth - right <= 16`) et `check-feed-disc.mjs`
 * qu'il vit dans les 64 derniers pixels — deux gates qui disent la MÊME chose,
 * « la première action de l'en-tête d'iOS, en haut à droite » (#6457). Insérer
 * la création à sa droite l'aurait déplacée sans qu'aucune décision ne l'ait
 * demandé. La porte se glisse donc avant lui.
 *
 * ## Des LIENS, jamais des boutons
 *
 * Les deux lignes ouvrent des adresses : elles restent des `<a>` (ouverture en
 * nouvel onglet, menu contextuel, survol qui montre la cible), ce que
 * `useRovingMenu` admet explicitement (`itemRefs` en `HTMLElement`) et ce que
 * `Link` sert par `anchorRef`.
 */

const MENU_WIDTH = 220;
const MENU_MARGIN = 8;
const MENU_GAP = 6;
const MENU_ITEM_HEIGHT = 48;
const MENU_PADDING = 8;

type Choice = {
  readonly id: 'post' | 'reel';
  readonly label: string;
  readonly icon: ReactNode;
  readonly search?: Record<string, string>;
};

export function FeedCreateDoor({ language }: { readonly language: InterfaceLanguage }) {
  const choices: readonly Choice[] = [
    { id: 'post', label: translate(language, 'feed.create.post'), icon: <Glyph name="image" size={18} /> },
    { id: 'reel', label: translate(language, 'feed.create.reel'), icon: <GlyphSvg glyph={FEED_GLYPHS.monitorPlay} size={18} />, search: { type: 'reel' } },
  ];
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });

  const { open, setOpen, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: choices.length,
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
      estimatedHeight: choices.length * MENU_ITEM_HEIGHT + MENU_PADDING,
      gap: MENU_GAP,
      margin: MENU_MARGIN,
    });
    setBox({ top: vertical.top, right: window.innerWidth - anchor.right + placement.right, width: placement.width });
  };

  const label = translate(language, 'feed.header.create');

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-feed-create
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (!open) measure();
          setOpen((value) => !value);
        }}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="plus" size={22} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label={label}
              data-feed-create-menu
              onKeyDown={onMenuKeyDown}
              className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
              style={{ top: box.top, right: box.right, width: box.width, backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)' }}
            >
              {choices.map((choice, index) => (
                <Link
                  key={choice.id}
                  to="postCompose"
                  {...(choice.search === undefined ? {} : { search: choice.search })}
                  role="menuitem"
                  data-feed-create-choice={choice.id}
                  anchorRef={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => {
                    /* Le menu se referme sur le CHOIX, pas sur la navigation :
                       un `<a>` peut être ouvert dans un onglet (Cmd+clic) sans
                       que l'écran change, et un menu resté ouvert derrière
                       serait une couche orpheline. */
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-title font-medium"
                  style={{ color: 'var(--color-ios-ink)', minHeight: MENU_ITEM_HEIGHT }}
                >
                  <span className="grid place-items-center" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {choice.icon}
                  </span>
                  {choice.label}
                </Link>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
