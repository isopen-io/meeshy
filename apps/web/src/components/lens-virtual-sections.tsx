import { useSyncExternalStore, type ReactElement, type RefObject } from 'react';

import type { Conversation } from '@/lib/api/types';
import { SCENE_OVERSCAN_PX } from '@/lib/lens/scene';
import type { LensSection as LensSectionData } from '@/lib/lens/sections';
import { ExitPresence } from '@/lib/view/exit-presence';
import { keptRowIds, rowSlices, type RowRange } from '@/lib/view/row-window';
import { rowRoving } from '@/lib/view/row-roving';
import { ROW_ANCHOR_ATTRIBUTE, useRowWindows } from '@/lib/view/use-row-windows';

import { ROW_HEIGHT, type RowPlace } from './lens-row';
import { LensSection, type LensSectionFold } from './lens-sticker';

/**
 * LES SECTIONS DE LA LENTILLE, VIRTUALISÉES (#11228) — chaque section garde
 * son bloc, son en-tête collant et son pliage (`LensSection`) ; seules ses
 * RANGÉES passent par une fenêtre (`lib/view/row-window.ts`). Le bloc n'est
 * pas touché parce que c'est lui qui BORNE le collant : un en-tête chasse le
 * suivant parce que sa section a sa vraie hauteur — les cales la lui gardent.
 *
 * World Wide, posée au-dessus des sections (#10004), reste montée : une seule
 * rangée, toujours en tête.
 *
 * Ce qui ne régresse pas, et pourquoi :
 *  - la perspective et le glissement d'une remontée (`useScene`,
 *    `useListReorderFlip`) suivaient déjà les rangées par `[data-row]` et un
 *    `MutationObserver` : une rangée montée par la fenêtre y entre d'elle-même ;
 *  - le parcours au clavier (#11227) lit les rangées MONTÉES : la fenêtre
 *    retient l'arrêt, ses voisines et les deux bouts (`keptRowIds`) ;
 *  - l'aperçu d'un appui long (#11211) vit dans la rangée : son focus passe
 *    par elle, elle tient donc l'arrêt, donc elle reste montée ;
 *  - une conversation archivée ou supprimée se replie à SA place (#11574) :
 *    les rangées et les sections passent par `ExitPresence`, et une cale
 *    n'en sort jamais en scène (elle n'est pas une conversation) ;
 *  - ce que la liste PORTE reste dit, monté ou non : chaque rangée annonce sa
 *    place dans SA section (`aria-posinset` / `aria-setsize`, que les cales
 *    `aria-hidden` ne comptent plus pour le lecteur d'écran), et le défileur
 *    porte le total (`carriedRowCount`, posé en `data-row-count`) que les
 *    gardes lisent au lieu de compter des nœuds.
 */

/** La réserve de chaque côté, au-delà de la marge de la perspective — six rangées. */
export const WINDOW_RESERVE_ROWS = 6;

/** Qui a le droit de sortir en scène — `useListDepartures`, et la portée qui change sans sortie (filtre, recherche). */
export type LensExits = {
  readonly scope: string;
  readonly rowMayExit: (id: string) => boolean;
  readonly sectionMayExit: (id: string) => boolean;
};

const NO_EXITS: LensExits = { scope: '', rowMayExit: () => false, sectionMayExit: () => false };

type Props = {
  readonly frame: RefObject<HTMLElement | null>;
  readonly exits?: LensExits | undefined;
  readonly world?: Conversation | undefined;
  readonly sections: readonly LensSectionData[];
  readonly folds: readonly (LensSectionFold | undefined)[];
  readonly rowOf: (conversation: Conversation, place?: RowPlace) => ReactElement;
};

/** LES RANGÉES QUE LA LISTE PORTE — World Wide et les sections dépliées, montées ou tenues par une cale. */
export const carriedRowCount = (input: {
  readonly world?: Conversation | undefined;
  readonly sections: readonly LensSectionData[];
  readonly folds: readonly (LensSectionFold | undefined)[];
}): number =>
  (input.world === undefined ? 0 : 1) +
  input.sections.reduce((sum, section, i) => (input.folds[i]?.folded === true ? sum : sum + section.conversations.length), 0);

const GAP_PREFIX = 'gap:';
const gapKey = (at: number): string => `${GAP_PREFIX}${at}`;

function windowedRows(input: {
  readonly items: readonly Conversation[];
  readonly range: RowRange;
  readonly kept: ReadonlySet<string>;
  readonly anchor: string;
  readonly rowOf: (conversation: Conversation, place?: RowPlace) => ReactElement;
}): readonly ReactElement[] {
  const { items, range, kept, anchor, rowOf } = input;
  const keep = items.flatMap((conversation, index) => (kept.has(conversation.id) ? [index] : []));
  return rowSlices({ count: items.length, range, keep }).flatMap((slice) =>
    slice.kind === 'rows'
      ? items.slice(slice.from, slice.to).map((conversation, offset) => rowOf(conversation, { position: slice.from + offset + 1, size: items.length }))
      : [
          <li
            key={gapKey(slice.at)}
            {...(slice.at === 0 ? { [ROW_ANCHOR_ATTRIBUTE]: anchor } : {})}
            data-row-gap=""
            aria-hidden="true"
            style={{ height: slice.rows * ROW_HEIGHT, flexShrink: 0, transitionProperty: 'none' }}
          />,
        ],
  );
}

export function LensVirtualSections({ frame, world, sections, folds, rowOf, exits = NO_EXITS }: Props) {
  const rowMayExit = (key: string): boolean => !key.startsWith(GAP_PREFIX) && exits.rowMayExit(key);
  const open = sections.filter((_, i) => folds[i]?.folded !== true);
  const blocks = open.map((section) => ({ id: section.id, count: section.conversations.length }));
  const active = useSyncExternalStore(rowRoving.subscribe, rowRoving.snapshot, () => null);
  const order = [...(world === undefined ? [] : [world.id]), ...open.flatMap((section) => section.conversations.map((c) => c.id))];
  const kept = keptRowIds({ order, active });
  const rangeOf = useRowWindows({ frame, blocks, rowHeight: ROW_HEIGHT, marginPx: SCENE_OVERSCAN_PX, extraRows: WINDOW_RESERVE_ROWS });

  return (
    <>
      {world === undefined ? null : rowOf(world)}
      <ExitPresence scope={exits.scope} mayExit={exits.sectionMayExit}>
      {sections.map((section, i) => {
        const fold = folds[i];
        return (
          <LensSection
            key={section.id}
            id={section.id}
            {...(section.category === undefined ? {} : { category: section.category })}
            {...(fold === undefined ? {} : { fold })}
          >
            {fold?.folded === true ? null : (
              <ExitPresence scope={exits.scope} mayExit={rowMayExit}>
                {windowedRows({
                  items: section.conversations,
                  range: rangeOf({ id: section.id, count: section.conversations.length }),
                  kept,
                  anchor: section.id,
                  rowOf,
                })}
              </ExitPresence>
            )}
          </LensSection>
        );
      })}
      </ExitPresence>
    </>
  );
}
