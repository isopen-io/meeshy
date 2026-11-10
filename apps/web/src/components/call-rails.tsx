import { Suspense, useRef, type ComponentType } from 'react';

import type { CallActionRail, CallRowsKit } from '@/components/call-control-actions';
import type { RailSide, RailsBySide } from '@/lib/calls/call-controls-disposition';
import { railLength, railsClearance, type RailClearance } from '@/lib/calls/call-rails-clearance';
import type { CallPanels } from '@/lib/calls/call-screen-layer';
import type { TileFootprint, TileSize } from '@/lib/calls/call-self-tile';
import type { ActiveCall } from '@/lib/calls/call-store';
import { useRailPresence } from '@/lib/calls/use-rail-presence';
import { interfaceDirection } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES DEUX RAILS DU DUO** (#17327, miroir de `CallView+Rails.swift`) — à
 * deux, `(…)` fait sortir « Mon image » sur le bord de début et « L'appel »
 * sur le bord de fin, centrés verticalement, et la pilule ne grandit pas. Ils
 * s'arrêtent au-dessus de la pilule en portrait ; là où elle tient ENTRE eux
 * (35 rem et plus), ils descendent jusqu'au pied de l'écran et se centrent sur
 * toute la hauteur (paysage, tablette). Le journal en colonne (W1) laisse sa
 * place : `inset` retire à la scène la largeur de la colonne, et le rail de fin
 * s'arrête à elle.
 *
 * Ma vignette en coin n'est jamais recouverte (P2 la pose AU-DESSUS du rail
 * « l'appel ») : le rail de son côté se décale sous elle, au-dessus d'elle ou à
 * côté d'elle (`call-rails-clearance.ts`) ; l'autre ne bouge pas.
 *
 * Chaque rail ENTRE par son bord de l'écran et en SORT par lui — une
 * translation et l'opacité, rien d'autre, interruptible ; en écriture de
 * droite à gauche, les bords se retournent (`rtl:`) ; « Réduire les
 * animations » remplace la translation par un fondu court.
 *
 * Le cadre des rails porte l'identifiant que `(…)` désigne (`aria-controls`)
 * tant qu'il est demandé — pas pendant sa sortie, où les rangées d'un groupe
 * peuvent déjà l'avoir pris.
 *
 * Un rail qui repart est INERTE (ni focus, ni clic, ni lecteur d'écran) ; un
 * rail qui revient ne l'est plus dès sa demande, avant même d'avoir glissé : le
 * focus que `call-screen.tsx` lui rend en revenant d'un panneau doit l'atteindre.
 *
 * Ce cadre est un chunk à part (`budgets.json` › `call_rails`) qui n'importe
 * rien de l'écran d'appel (`dynamic_only`) : l'écran lui REMET ses rails par
 * bord, ma vignette, l'écran et le contenu d'un rail (`CallActionRail`, chunk
 * des actions), et précharge les deux chunks dès que l'appel vit.
 */

const AWAY: Readonly<Record<RailSide, string>> = {
  leading: '-translate-x-[calc(100%+1.5rem)] rtl:translate-x-[calc(100%+1.5rem)]',
  trailing: 'translate-x-[calc(100%+1.5rem)] rtl:-translate-x-[calc(100%+1.5rem)]',
};

const EDGE = 'max(0.75rem, env(safe-area-inset-left), env(safe-area-inset-right))';

type RailsProps = {
  readonly call: ActiveCall;
  /** Les rails demandés, par bord — vide dès qu'ils se referment : le dernier jeu non vide se rejoue à la sortie. */
  readonly rails: RailsBySide;
  /** Les rails sont demandés : `(…)` ouvert, les commandes visibles. */
  readonly open: boolean;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
  readonly kit: CallRowsKit;
  /** Le contenu d'un rail, que l'écran d'appel charge avec les actions (`CallActionRail`) : ce chunk n'importe rien de lui. */
  readonly Rail: ComponentType<Parameters<typeof CallActionRail>[0]>;
  /** L'écran, suivi par l'écran d'appel (`useCallViewport`). */
  readonly viewport: TileSize;
  /** Ce que la colonne du journal retire au bord de fin. */
  readonly inset?: number;
  /** Ma vignette en coin, telle que la scène la pose (`selfTileFootprint`), que le rail de son côté laisse visible. Absente : aucune. */
  readonly tile?: TileFootprint | null;
};

const slotStyle = (side: RailSide, { top, bottom, inline }: RailClearance) => ({
  ...(top === 0 ? {} : { paddingTop: `${top}px` }),
  ...(bottom === 0 ? {} : { paddingBottom: `${bottom}px` }),
  ...(inline === 0 ? {} : side === 'leading' ? { paddingInlineStart: `${inline}px` } : { paddingInlineEnd: `${inline}px` }),
});

/** Les rails qui sortent, retenus un instant après la demande de fermeture : leur sortie se joue encore. */
export function CallRails({ call, rails, open, language, panels, kit, Rail, viewport, inset = 0, tile = null }: RailsProps) {
  const { mounted, shown } = useRailPresence(open);
  const asked = Object.keys(rails).length > 0;
  const remembered = useRef(rails);
  if (asked) remembered.current = rails;
  if (!mounted) return null;
  const kept = asked ? rails : remembered.current;
  const rowOf = (side: RailSide) => kept[side];
  const clearance = railsClearance({
    tile,
    viewport,
    rtl: interfaceDirection(language) === 'rtl',
    lengths: { leading: railLength(rowOf('leading')?.actions.length ?? 0), trailing: railLength(rowOf('trailing')?.actions.length ?? 0) },
  });
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-14 bottom-[6.5rem] z-30 flex justify-between min-[35rem]:bottom-0"
      style={{ paddingInlineStart: EDGE, paddingInlineEnd: inset === 0 ? EDGE : `calc(${EDGE} + ${inset}px)` }}
      {...(open ? { id: kit.actionsId } : {})}
      data-call-rails={shown ? 'shown' : 'away'}
    >
      {(['leading', 'trailing'] as const).map((side) => {
        const row = rowOf(side);
        return (
          <div key={side} className="flex max-h-full items-center" style={slotStyle(side, clearance[side])} data-call-rail-slot={side}>
            {row === undefined ? null : (
              <div
                className={`flex max-h-full transition-[translate,opacity] duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:duration-150 ${shown ? 'translate-x-0 opacity-100' : `${AWAY[side]} opacity-0`}`}
                {...(open ? {} : { 'aria-hidden': true, inert: true })}
                data-call-rail-side={side}
              >
                <Suspense fallback={null}>
                  <Rail call={call} row={row} language={language} panels={panels} kit={kit} />
                </Suspense>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
