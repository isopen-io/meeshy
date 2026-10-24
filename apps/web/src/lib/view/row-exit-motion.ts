import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand/react';

import { prefersReducedMotion } from './reduced-motion';

/**
 * **UN MESSAGE MASQUÉ « POUR MOI » SORT DU FIL EN SE REPLIANT** (#12634).
 *
 * « Supprimer pour moi » retirait la rangée du cache dans l'image même du
 * geste : le virtualiseur la démontait, les rangées suivantes SAUTAIENT de sa
 * hauteur, et un refus la faisait reparaître d'un coup. La rangée reste
 * désormais montée le temps de son repli (`ROW_EXIT_MS`) avant de quitter le
 * cache, et une rangée rendue se déplie à sa place.
 *
 * Ce module ne porte que l'ÉTAT de la sortie — les rangées qui sortent, celles
 * qui reviennent — et l'instant où le geste peut retirer la rangée du cache.
 * La RÈGLE du retrait reste à `delete-message.ts` ; la PEINTURE à
 * `thread-scene.css` (`.thread-row-leaving`, `.thread-row-returning`,
 * `[data-rows-settling]`), posée par `thread-modes.tsx`.
 *
 * ## LE REPLI PASSE PAR `transform` ET `opacity`, JAMAIS PAR LA HAUTEUR
 *
 * Le cliquet #11314 (`scripts/check-animated-properties.mjs`) refuse toute
 * nouvelle animation de géométrie. La rangée qui sort QUITTE LE FLUX
 * (`position: absolute`, à sa place) : la hauteur mesurée de son `<li>` tombe,
 * le virtualiseur remonte les suivantes, et c'est leur `transform` qui glisse
 * vers sa nouvelle valeur pendant que la sortante s'efface sur place. Au
 * retour, l'inverse : elle reprend sa hauteur, les suivantes redescendent en
 * glissant, et elle apparaît.
 *
 * ## « RÉDUIRE LES ANIMATIONS » : RIEN N'EST PUBLIÉ
 *
 * Sortie et retour sont immédiats : `collapse` rend `null` (le geste retire la
 * rangée tout de suite), `unfold` ne publie rien. La feuille coupe aussi ses
 * animations sous la même préférence, ceinture et bretelles.
 */

/** La durée du repli et du dépliage — celle que la feuille joue. */
export const ROW_EXIT_MS = 200;

/** La courbe du repli : la même que l'arrivée (`ARRIVAL_MOTION_CURVE`), sans rebond. */
export const ROW_EXIT_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Le retour est tenu au-delà de l'animation : la rangée paraît à la notification du cache, une tâche plus tard. */
const RETURN_HOLD_MS = ROW_EXIT_MS + 100;

export type RowExitState = { readonly leaving: ReadonlySet<string>; readonly returning: ReadonlySet<string> };

export type RowExitSchedule = (run: () => void, ms: number) => void;

/**
 * Le contrat que le geste consomme. `collapse` publie la sortie et rend la
 * promesse de sa fin — `null` quand il n'y a rien à jouer, et le geste retire
 * alors la rangée sur-le-champ. `unfold` déplie des rangées rendues au cache.
 */
export type RowExit = {
  readonly collapse: (ids: ReadonlySet<string>) => Promise<void> | null;
  readonly unfold: (ids: ReadonlySet<string>) => void;
};

const EMPTY: ReadonlySet<string> = new Set();

export const createRowExitStore = (): StoreApi<RowExitState> => createStore<RowExitState>(() => ({ leaving: EMPTY, returning: EMPTY }));

/** L'état partagé par le geste et le fil — des identifiants de messages, uniques d'une conversation à l'autre. */
export const rowExitStore = createRowExitStore();

const union = (set: ReadonlySet<string>, ids: ReadonlySet<string>): ReadonlySet<string> => new Set([...set, ...ids]);

const without = (set: ReadonlySet<string>, ids: ReadonlySet<string>): ReadonlySet<string> =>
  [...set].some((id) => ids.has(id)) ? new Set([...set].filter((id) => !ids.has(id))) : set;

const timeoutSchedule: RowExitSchedule = (run, ms) => {
  setTimeout(run, ms);
};

export function rowExitOf(params: {
  readonly store: StoreApi<RowExitState>;
  readonly reduceMotion: () => boolean;
  readonly schedule?: RowExitSchedule;
}): RowExit {
  const { store, reduceMotion } = params;
  const schedule = params.schedule ?? timeoutSchedule;
  const forget = (key: keyof RowExitState, ids: ReadonlySet<string>): void => {
    store.setState((state) => ({ ...state, [key]: without(state[key], ids) }));
  };
  return {
    collapse: (ids) => {
      if (ids.size === 0 || reduceMotion()) return null;
      store.setState((state) => ({ ...state, leaving: union(state.leaving, ids) }));
      return new Promise<void>((resolve) => {
        schedule(() => {
          resolve();
          /* La rangée quitte le cache maintenant ; elle reste NOTÉE sortante le
             temps que le fil le voie (le cache notifie une tâche plus tard), puis
             l'état s'efface — il ne garde jamais plus que les gestes en cours. */
          schedule(() => forget('leaving', ids), ROW_EXIT_MS);
        }, ROW_EXIT_MS);
      });
    },
    unfold: (ids) => {
      if (ids.size === 0) return;
      if (reduceMotion()) {
        forget('leaving', ids);
        return;
      }
      store.setState((state) => ({ leaving: without(state.leaving, ids), returning: union(state.returning, ids) }));
      schedule(() => forget('returning', ids), RETURN_HOLD_MS);
    },
  };
}

/** La sortie du fil de l'application — « Réduire les animations » lu à l'instant du geste. */
export const threadRowExit: RowExit = rowExitOf({ store: rowExitStore, reduceMotion: prefersReducedMotion });

/** Ce que le fil peint : les rangées qui sortent et celles qui reviennent. */
export function useRowExit(): RowExitState {
  return useStore(rowExitStore);
}
