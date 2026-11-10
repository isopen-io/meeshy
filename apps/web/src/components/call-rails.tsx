import { lazy, Suspense, useRef } from 'react';

import type { CallRowsKit } from '@/components/call-control-actions';
import { RAIL_SIDE, type CallFamilyRow, type RailSide } from '@/lib/calls/call-controls-disposition';
import type { CallPanels } from '@/lib/calls/call-screen-layer';
import type { ActiveCall } from '@/lib/calls/call-store';
import { useRailPresence } from '@/lib/calls/use-rail-presence';
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
 * Chaque rail ENTRE par son bord de l'écran et en SORT par lui — une
 * translation et l'opacité, rien d'autre, interruptible ; en écriture de
 * droite à gauche, les bords se retournent (`rtl:`) ; « Réduire les
 * animations » remplace la translation par un fondu court.
 *
 * Un rail qui repart est INERTE (ni focus, ni clic, ni lecteur d'écran) ; un
 * rail qui revient ne l'est plus dès sa demande, avant même d'avoir glissé : le
 * focus que `call-screen.tsx` lui rend en revenant d'un panneau doit l'atteindre.
 *
 * Le contenu d'un rail (`CallActionRail`) vit dans le chunk des actions, que
 * l'écran d'appel précharge dès que l'appel vit : seul ce cadre est dans
 * `call_overlay`.
 */

const CallActionRail = lazy(() => import('./call-control-actions').then((module) => ({ default: module.CallActionRail })));

const AWAY: Readonly<Record<RailSide, string>> = {
  leading: '-translate-x-[calc(100%+1.5rem)] rtl:translate-x-[calc(100%+1.5rem)]',
  trailing: 'translate-x-[calc(100%+1.5rem)] rtl:-translate-x-[calc(100%+1.5rem)]',
};

const EDGE = 'max(0.75rem, env(safe-area-inset-left), env(safe-area-inset-right))';

type RailsProps = {
  readonly call: ActiveCall;
  /** Les rails demandés — vide dès qu'ils se referment : le dernier jeu non vide se rejoue à la sortie. */
  readonly rows: readonly CallFamilyRow[];
  /** Les rails sont demandés : `(…)` ouvert, les commandes visibles. */
  readonly open: boolean;
  readonly language: InterfaceLanguage;
  readonly panels: CallPanels;
  readonly kit: CallRowsKit;
  /** Ce que la colonne du journal retire au bord de fin. */
  readonly inset?: number;
};

/** Les rails qui sortent, retenus un instant après la demande de fermeture : leur sortie se joue encore. */
export function CallRails({ call, rows, open, language, panels, kit, inset = 0 }: RailsProps) {
  const { mounted, shown } = useRailPresence(open);
  const remembered = useRef(rows);
  if (rows.length > 0) remembered.current = rows;
  if (!mounted) return null;
  const kept = rows.length > 0 ? rows : remembered.current;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-14 bottom-[6.5rem] z-30 flex justify-between min-[35rem]:bottom-0"
      style={{ paddingInlineStart: EDGE, paddingInlineEnd: inset === 0 ? EDGE : `calc(${EDGE} + ${inset}px)` }}
      data-call-rails={shown ? 'shown' : 'away'}
    >
      {(['leading', 'trailing'] as const).map((side) => {
        const row = kept.find((candidate) => RAIL_SIDE[candidate.family] === side);
        return (
          <div key={side} className="flex max-h-full items-center">
            {row === undefined ? null : (
              <div
                className={`flex max-h-full transition-[translate,opacity] duration-300 ease-out motion-reduce:translate-x-0 motion-reduce:duration-150 ${shown ? 'translate-x-0 opacity-100' : `${AWAY[side]} opacity-0`}`}
                {...(open ? {} : { 'aria-hidden': true, inert: true })}
                data-call-rail-side={side}
              >
                <Suspense fallback={null}>
                  <CallActionRail call={call} row={row} language={language} panels={panels} kit={kit} />
                </Suspense>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
