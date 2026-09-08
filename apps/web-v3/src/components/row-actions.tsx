import { useState } from 'react';
import { createPortal } from 'react-dom';

import { placePopover, placePopoverVertical } from '@/lib/view/popover';
import { useRovingMenu } from '@/lib/view/roving-menu';
import { rowMenuItems, type RowActionId } from '@/lib/view/row-actions';
import type { ConversationFlags } from '@/lib/api/preferences';

import { Glyph } from './glyph';

/**
 * LES ACTIONS DE RANGÉE — bouton + popover (#5559 §5.6), l'ADAPTATION web du
 * couple swipe leading/trailing d'iOS (`ConversationListView.swift:945-1040`,
 * §1.5 de la spécification) : iOS sert déjà ces actions par MENU CONTEXTUEL
 * (`ConversationListView+Rows.swift:113-216`), un véhicule aussi conforme
 * que le swipe — celui-ci prend le geste primaire côté web, qui n'a pas de
 * vocabulaire swipe établi sans conflit avec le défilement de liste ni le
 * retour-geste Capacitor.
 *
 * Loi de PLACEMENT reprise de `ReadingModeChip` (`popover.ts`, le site
 * unique, y compris VERTICALEMENT — `placePopoverVertical`, #5559 défaut 7) ;
 * les LIBELLÉS et l'ID de chaque action viennent de `rowMenuItems`
 * (`lib/view/row-actions.ts`) — ce composant ne décide rien, il ROUTE le clic
 * vers `onAction`. La mécanique clavier/focus/fermeture (roving tabindex,
 * Échap, clic hors-menu) vient de `useRovingMenu` (`lib/view/roving-menu.ts`),
 * PARTAGÉE avec `ReadingModeChip` depuis #5559 défaut 4 — les deux menus du
 * dépôt écrivaient la même mécanique deux fois.
 *
 * POSITION DU BOUTON : SECOND enfant du `<li data-row>`, FRÈRE du `Link` —
 * jamais dedans (un élément interactif dans un lien est invalide, et la
 * scène de la Lentille n'anime QUE le `firstElementChild` de la rangée —
 * `scene.ts:104` — donc ce bouton échappe à la perspective par
 * construction). `position: absolute` retire le bouton du FLUX : aucune
 * propriété de mise en page n'est engagée, `check-lens.mjs` reste vert par
 * construction.
 *
 * LE MENU, LUI, EST UN PORTAIL (`createPortal`) — pas un enfant positionné du
 * bouton. Mesuré à la première version : une centaine de `<li>` SIBLINGS,
 * chacun `position: relative`, empilent leurs descendants absolus dans
 * l'ORDRE DU DOM — le menu ouvert sur une rangée du HAUT de la liste se
 * peignait donc SOUS le contenu des rangées qui la suivent (`z-index` ne
 * compare que dans le MÊME contexte d'empilement, et chaque `<li>` en ouvre
 * un). Le portail rend le menu enfant direct de `document.body`, en
 * `position: fixed`, aux coordonnées VIEWPORT du bouton
 * (`getBoundingClientRect()`) — indépendant de tout ancêtre, y compris de
 * l'opacité de sourdine (`opacity < 1` sur le `<li>` créerait sinon son
 * propre référentiel pour un `position: fixed` descendant).
 */
const MENU_WIDTH = 220;
const MENU_MARGIN = 8;
const MENU_GAP = 4;
/**
 * LA HAUTEUR ESTIMÉE DU PANNEAU, sans mesure DOM — #5559 défaut 7 : `measure()`
 * s'exécute AVANT le montage du portail (elle décide où le monter), donc
 * aucune vraie hauteur n'est disponible à cet instant. Chaque ligne fait 44
 * (le plancher tactile, posé en `minHeight` sur les boutons) et le panneau
 * porte `py-1` (4 + 4 = 8) de rembourrage vertical.
 */
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 8;

/**
 * LA TAILLE DESSINÉE, et pourquoi c'est 34 et non 32 : `tap-target-34`
 * (`app.css`) étend la zone tactile de 5 px sur chaque bord — 34 + 10 = 44,
 * le plancher du dépôt. Mesuré à 32 px de dessin, la cible réelle tombait à
 * 42×42, sous ce plancher, exactement comme le bouton de `message-blocks.tsx`
 * qui porte déjà `size-[34px]` pour la même raison.
 *
 * La RÉSERVE du `Link` voisin (`pr-12`, 48 px dans `lens-row.tsx`) est
 * dimensionnée sur ce débord : 8 (droite) + 34 (bouton) + 5 (débord) = 47 < 48
 * — le `::after` ne mord donc jamais sur le badge de non-lus, dont il volerait
 * sinon le clic (même défaut que le débord de `tap-target-22` corrigé en #5566).
 */
const BUTTON_SIZE = 34;

export function RowActions({
  flags,
  unread,
  magnified,
  onAction,
}: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  /** Élue par la bande de focus — seule rangée où le bouton reste visible
   * SANS survol ni focus (`status.magnified` de `LensRow`). */
  readonly magnified: boolean;
  readonly onAction: (id: RowActionId) => void;
}) {
  const items = rowMenuItems({ flags, unread });
  const [box, setBox] = useState<{ top: number; right: number; width: number }>({ top: 0, right: 0, width: MENU_WIDTH });

  /**
   * `placePopover` rend `right` dans le REPÈRE DE L'ANCRE (0 = bord droit du
   * panneau aligné sur celui du bouton ; négatif = poussé vers la droite —
   * doc-comment de `popover.ts`). `position: fixed` mesure depuis le bord
   * droit du VIEWPORT, un repère différent : `viewportWidth − anchor.right`
   * est le `right` CSS qui ALIGNE le panneau sur le bouton dans CE repère ;
   * lui AJOUTER le delta de `placePopover` (négatif quand un débord force le
   * décalage) applique le MÊME ajustement, translaté. Preuve par les deux
   * bornes : delta = 0 ⇒ panneau aligné sur le bouton ; delta au plus négatif
   * (`anchorRight − width − margin`) ⇒ le bord GAUCHE du panneau retombe
   * exactement sur `margin`, quel que soit `anchor.right`.
   *
   * VERTICALEMENT (#5559 défaut 7) : `placePopoverVertical` retourne le
   * panneau AU-DESSUS de l'ancre dès qu'il déborderait du bas — sans mesure
   * DOM de sa propre hauteur, puisque le portail n'est pas encore monté à cet
   * instant (`MENU_ITEM_HEIGHT × items.length + MENU_PADDING`, déduit des
   * cotes réellement dessinées).
   */
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

  /**
   * Le panneau est en `position: fixed`, donc ANCRÉ AU VIEWPORT : défiler la
   * liste ou redimensionner la fenêtre laisserait le menu immobile pendant
   * que sa rangée s'éloigne — un menu qui désigne alors une AUTRE
   * conversation que celle sur laquelle il agit. On le referme plutôt que de
   * le repositionner : rouvrir coûte un geste, agir sur la mauvaise rangée
   * coûte une archive qu'on n'a pas demandée. `capture: true` (dans le hook)
   * attrape le défilement du conteneur de liste, qui ne remonte pas jusqu'à
   * `window`.
   */
  const { open, setOpen, closeAndFocusButton, activeIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } = useRovingMenu({
    itemCount: items.length,
    onScroll: () => setOpen(false),
    onResize: () => setOpen(false),
  });

  const choose = (id: RowActionId) => {
    onAction(id);
    closeAndFocusButton();
  };

  return (
    /**
     * `pointer-events-none` — #5559 défaut 6 (bloquant), second volet : tant
     * que le BOUTON est invisible et non cliquable (pointer-events: none),
     * ce conteneur, lui, restait à `auto` par défaut et occupait la même
     * boîte que le bouton — un doigt ou une souris qui tombait dans ce carré
     * de 34×34 heurtait donc ce `<div>` et n'atteignait NI le bouton NI le
     * lien de la rangée sous lui (`elementFromPoint` mesuré : `{tag:'DIV'}`).
     * Le conteneur laisse maintenant TOUJOURS passer le pointeur ; seul le
     * bouton le reprend, à `pointer-events: auto`, quand il est réellement
     * actionnable.
     */
    <div className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Actions de conversation"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          // La rangée entière est un lien (`LensRow`) : sans ceci, le clic
          // navigue vers le fil AVANT que le menu n'ait pu s'ouvrir.
          event.preventDefault();
          event.stopPropagation();
          if (!open) measure();
          setOpen((v) => !v);
        }}
        /**
         * LE BOUTON EST TOUJOURS DANS L'ORDRE DE TABULATION ET JAMAIS
         * `aria-hidden` — c'était le défaut de la première forme : hors
         * magnification il portait `aria-hidden` et `tabIndex={-1}`, si bien
         * que le survol le rendait VISIBLE et CLIQUABLE tout en le laissant
         * invisible au clavier et au lecteur d'écran. Un contrôle qu'on voit
         * et qu'aucune technologie d'assistance ne peut atteindre est pire
         * qu'un contrôle absent : la magnification est élue par la POSITION DE
         * DÉFILEMENT, que personne ne pilote au clavier, donc les actions de
         * toutes les autres rangées n'existaient tout simplement pas pour qui
         * n'a pas de souris.
         *
         * Ce qui reste conditionnel est la seule APPARENCE : opacité 0 au
         * repos, 1 dès que la rangée est magnifiée, survolée, que le bouton a
         * le focus clavier, ou que son menu est ouvert. `pointer-events` suit
         * l'opacité pour qu'un bouton invisible ne vole pas au POINTEUR le
         * clic destiné à la rangée — le clavier, lui, active un bouton
         * `pointer-events: none` sans difficulté.
         *
         * `.row-action-button` (`app.css`) — #5559 défaut 6 (bloquant) : SUR
         * UN APPAREIL SANS SURVOL (`any-hover: none`, Android et Chromium
         * mobile mesurés), `group-hover` ne se déclenche JAMAIS — un doigt
         * n'a pas de position de survol à annoncer avant de taper. Le bouton
         * restait donc `opacity-0 pointer-events-none` en PERMANENCE sur
         * toute rangée non magnifiée : les actions de rangée n'existaient
         * tout simplement pas au doigt, alors que la place qu'elles occupent
         * est déjà réservée en permanence (`pr-12` constant, `lens-row.tsx`)
         * — les rendre visibles ne déplace donc rien. La règle vit HORS de
         * tout `@layer` (à la différence des `@utility` voisins) : un style
         * non calqué l'emporte toujours sur un style calqué, quels que soient
         * l'ordre et la spécificité — elle n'a donc pas à lutter avec les
         * classes Tailwind ci-dessous.
         */
        className={`row-action-button tap-target-34 grid place-items-center rounded-chip transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 ${
          magnified || open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          /* `--color-ios-card`, l'alias, comme le panneau douze lignes plus
             bas — et non `--ios-surface-card`, la variable brute qu'il
             enveloppe : deux noms pour une même valeur dans un même fichier
             est la plus petite forme de la jumelle. */
          backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 92%, transparent)',
          color: 'var(--color-ios-ink-2)',
        }}
      >
        <Glyph name="dotsThreeVertical" size={18} />
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Actions de conversation"
              onKeyDown={onMenuKeyDown}
              className="fixed z-30 overflow-hidden rounded-card py-1 shadow-cast"
              style={{
                top: box.top,
                right: box.right,
                width: box.width,
                backgroundColor: 'var(--color-ios-card)',
                border: '1px solid var(--color-edge)',
              }}
            >
              {items.map((item, index) => (
                <button
                  key={item.id}
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(item.id);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-title font-medium"
                  style={{ color: 'var(--color-ios-ink)', minHeight: 44 }}
                >
                  <Glyph name={item.glyph} size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
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
