import { useState } from 'react';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';
import { Glyph } from './glyph';
import type { MenuRow } from '@/lib/reading-mode/catalog';
import { placePopover } from '@/lib/view/popover';
import { findFocusableIndex, useRovingMenu } from '@/lib/view/roving-menu';

/**
 * LE CHIP DE MODE — capsule teintée à l'accent, miroir de `ReadingModeChip`
 * (iOS, `Focal/Lens/`). ÉCART ASSUMÉ (§1.7 de la spécification #5566) : iOS
 * fait TAP = cycle, appui long = menu (`.contextMenu`) ; le web n'a pas
 * d'équivalent accessible à l'appui long (clic droit hostile, longpress
 * inatteignable au clavier), et le menu EST le livrable de ce lot — il prend
 * donc le geste primaire : **clic = ouvre le menu**.
 *
 * Le préfixe « AUTO » marque une décision venue de l'orchestrateur
 * (`reason !== 'sticky'`) — encoche distincte d'un choix manuel figé, même
 * règle que `ReadingModeChipModel.isAuto` côté iOS.
 *
 * LA MÉCANIQUE CLAVIER/FOCUS/FERMETURE (roving tabindex, Échap, clic
 * hors-menu) vient de `useRovingMenu` (`lib/view/roving-menu.ts`), PARTAGÉE
 * avec `RowActions` depuis #5559 défaut 4 : les deux seuls menus du dépôt
 * écrivaient la même mécanique deux fois, un motif qui se serait copié à
 * chacun des trente écrans restants. ICI seuls survivent : le rendu propre
 * à ce menu (icône+titre+sous-titre+coche, lignes désactivées MOTIVÉES,
 * D-8), et le placement — ce chip n'est pas porté (`position: absolute`,
 * ancré à son propre conteneur), donc il REMESURE au redimensionnement
 * plutôt que de fermer comme le fait `RowActions` (porté, `position: fixed`).
 */
/** Largeur SOUHAITÉE du menu ; `placePopover` le rétrécit sur un écran plus étroit. */
const MENU_WIDTH = 256;
/** Marge minimale entre le menu et les deux bords de l'écran. */
const MENU_MARGIN = 8;

export function ReadingModeChip({
  label,
  isAuto,
  rows,
  onSelect,
  onAuto,
}: {
  label: string;
  isAuto: boolean;
  /** Les cinq lignes de `menuRows()` — jamais une seconde résolution. */
  rows: readonly MenuRow[];
  onSelect: (mode: ConversationReadingMode) => void;
  onAuto: () => void;
}) {
  const [box, setBox] = useState<{ right: number; width: number }>({ right: 0, width: MENU_WIDTH });

  /**
   * Mesuré AVANT le premier rendu du menu : il ne se replace pas sous l'œil.
   * La LOI de placement est pure et vit dans `lib/view/popover.ts` — ce
   * composant ne fait que lui donner l'ancre et la largeur d'écran.
   */
  const measure = () => {
    const anchor = buttonRef.current?.getBoundingClientRect();
    if (anchor) {
      setBox(
        placePopover({
          anchorRight: anchor.right,
          viewportWidth: window.innerWidth,
          preferredWidth: MENU_WIDTH,
          margin: MENU_MARGIN,
        }),
      );
    }
  };

  /**
   * `itemRefs[rows.length]` est le bouton « Automatique », qui participe au
   * même parcours au clavier que les cinq lignes (`total`, ci-dessous). Un
   * bouton `disabled` (Résumé, Rivière — D-8) est HORS du parcours clavier
   * par construction : le navigateur ne peut PAS lui donner le focus, quel
   * que soit son `tabIndex` — `findFocusableIndex` (partagé,
   * `roving-menu.ts`) avance dans la DIRECTION donnée jusqu'à la prochaine
   * ligne ATTEIGNABLE plutôt que de s'arrêter dessus.
   */
  const total = rows.length + 1;
  const isDisabledAt = (index: number): boolean => (index < rows.length ? !rows[index]!.isAvailable : false);

  const { open, setOpen, closeAndFocusButton, activeIndex, setActiveIndex, buttonRef, menuRef, itemRefs, onMenuKeyDown } =
    useRovingMenu({
      itemCount: total,
      isDisabledAt,
      /**
       * LE FOCUS ENTRE DANS LE MENU À L'OUVERTURE (défaut #5566 §9 : il
       * restait sur le chip, et les flèches ne pouvaient donc rien
       * déplacer). Il se pose sur la ligne COURANTE quand elle existe —
       * c'est celle que l'utilisateur cherche en premier — sinon sur la
       * première ligne ATTEIGNABLE.
       */
      computeInitialIndex: () => {
        const current = rows.findIndex((row) => row.isCurrent && row.isAvailable);
        return current === -1 ? findFocusableIndex(total, -1, 1, isDisabledAt) : current;
      },
      onResize: measure,
    });

  const choose = (mode: ConversationReadingMode) => {
    onSelect(mode);
    closeAndFocusButton();
  };

  const chooseAuto = () => {
    onAuto();
    closeAndFocusButton();
  };

  return (
    /* `min-w-0 shrink` : sur un écran de 320, la grappe d'action ne tient pas
       en entier (44 + chip + 44 + 44 + 44 + gouttières). C'est le CHIP qui
       cède et tronque son libellé — jamais les cibles voisines, qui tombaient
       sinon à 35 px, sous le plancher tactile. Même parti qu'iOS, qui tronque
       en amont (`lineLimit`) plutôt que de comprimer la capsule. */
    <div className="relative min-w-0 shrink">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!open) measure();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Mode de lecture : ${label}`}
        /* HAUTEUR 44 px, LARGEUR au contenu — et non `size-11` : la capsule
           « AUTO Focal » fait 81 px de large, elle DÉBORDAIT donc de 18 px de
           chaque côté d'une boîte de 44 et recouvrait le bouton « Appeler »,
           dont le centre renvoyait ce chip au clic (mesuré par
           `elementFromPoint`). Un contrôle voisin rendu inatteignable par le
           débord d'un autre est un contrôle inerte. */
        className="inline-grid h-11 w-full min-w-11 place-items-center px-1"
      >
        <span
          className="flex min-w-0 items-center gap-1 rounded-chip px-2.5 py-1"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
            border: '0.5px solid color-mix(in srgb, var(--accent) 50%, transparent)',
          }}
        >
          {isAuto ? (
            <span
              className="shrink-0 text-[9px] font-black tracking-wide opacity-65"
              style={{ color: 'var(--color-ios-ink)' }}
            >
              AUTO
            </span>
          ) : null}
          <span className="truncate text-check font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {label}
          </span>
        </span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Modes de lecture"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full z-20 mt-1 overflow-hidden rounded-card py-1 shadow-cast"
          style={{
            right: box.right,
            width: box.width,
            backgroundColor: 'var(--color-ios-card)',
            border: '1px solid var(--color-edge)',
          }}
        >
          {rows.map((row, index) => {
            /* SEULE l'indisponibilité désactive une ligne (défaut #5566 §9) :
               le mode COURANT reste un bouton normal, focalisable et
               cliquable — le re-choisir est un NO-OP inoffensif (même
               préférence réécrite). Le range dans `disabled` le rendait
               inatteignable au clavier alors qu'il porte la SEULE coche du
               menu, exactement ce qu'un lecteur d'écran cherche en premier. */
            const disabled = !row.isAvailable;
            return (
              <button
                key={row.mode}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={row.isCurrent}
                tabIndex={index === activeIndex ? 0 : -1}
                disabled={disabled}
                onFocus={() => setActiveIndex(index)}
                onClick={() => choose(row.mode)}
                /* PAS de `disabled:opacity-40` sur la LIGNE, et c'est le point
                   de D-8 : un mode indisponible reste listé pour DIRE
                   pourquoi. Voilée avec la ligne, cette raison tombait à
                   1,49:1 en schéma clair (mesuré) — affichée, illisible. Le
                   TITRE porte l'indisponibilité ; la raison garde l'encre
                   secondaire de toutes les autres lignes. */
                className="flex w-full items-start gap-2 px-3 py-2 text-left"
              >
                <span className="mt-0.5 w-4 shrink-0" aria-hidden>
                  {row.isCurrent ? <Glyph name="check" size={14} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-title font-semibold"
                    style={{ color: 'var(--color-ios-ink)', opacity: row.isAvailable ? 1 : 0.55 }}
                  >
                    {row.title}
                  </span>
                  <span className="block text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {row.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="my-1 h-px" style={{ backgroundColor: 'var(--color-edge)' }} aria-hidden />
          <button
            type="button"
            role="menuitem"
            ref={(el) => {
              itemRefs.current[rows.length] = el;
            }}
            tabIndex={rows.length === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(rows.length)}
            onClick={chooseAuto}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-title font-semibold"
            style={{ color: 'var(--accent)' }}
          >
            Automatique
          </button>
        </div>
      ) : null}
    </div>
  );
}
