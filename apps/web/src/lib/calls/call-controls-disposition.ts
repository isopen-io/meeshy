import type { CallAction, CallControlSet, MineAction } from './call-controls';
import { panelInThePill, type CallScreenLayer } from './call-screen-layer';
import type { ActiveCall } from './call-store';
import type { CallLayout } from './call-view';

/**
 * **OÙ SE RANGENT LES ACTIONS DU `(…)`** (#17327, miroir de
 * `CallControlsDisposition` d'iOS, `CallControlsLayout.swift`) — selon le
 * nombre de participants, jamais selon un état :
 *
 * - `rails` : À DEUX, un rail vertical par famille sur les bords de l'écran —
 *   « mon image » au début, « l'appel » à la fin, centrés verticalement — et la
 *   pilule ne grandit pas ;
 * - `rows` : À PLUSIEURS, deux rangées légendées DANS la pilule, qui grandit.
 *   Aucun rail ne se pose par-dessus la grille : il masquerait des vignettes.
 *
 * Le passage de deux à trois en cours d'appel change la forme, pas l'état du
 * `(…)` (`call-screen-layer.ts`). Une option (Réagir, Enregistrer, Journal)
 * est dessinée DANS la pilule et REMPLACE les actions (#8578), rails compris ;
 * Ajouter s'ouvre en feuille et les laisse en place (G3.5). Les règles de l'ordre et de
 * l'offre sont dans `call-controls.ts`.
 */

export type CallControlsDisposition = 'rails' | 'rows';

export const MAX_PARTICIPANTS_ON_RAILS = 2;

type DispositionInput = {
  readonly participantCount: number;
  /** La grille de groupe est à l'écran : des rails masqueraient ses vignettes, même à deux. */
  readonly showsGroupGrid?: boolean;
};

export function controlsDisposition({ participantCount, showsGroupGrid = false }: DispositionInput): CallControlsDisposition {
  return showsGroupGrid || participantCount > MAX_PARTICIPANTS_ON_RAILS ? 'rows' : 'rails';
}

/**
 * Les participants de l'appel, moi compris (`callParticipantCount` d'iOS) : la
 * grille compte ses pairs arrivés — un invité qui sonne encore n'en est pas un,
 * comme `GroupCallRoster` qui n'admet que les arrivées —, tout le reste est un duo.
 */
export function participantCountOf(call: Pick<ActiveCall, 'members'>, layout: CallLayout): number {
  return layout === 'grid' ? Object.values(call.members).filter((member) => member.link !== 'ringing').length + 1 : 2;
}

export type CallFamily = 'mine' | 'call';

export type CallFamilyRow = { readonly family: CallFamily; readonly actions: readonly (MineAction | CallAction)[] };

/** Le bord de l'écran où se pose le rail d'une famille : « mon image » ouvre la marche, « l'appel » la ferme. */
export type RailSide = 'leading' | 'trailing';

export const RAIL_SIDE: Readonly<Record<CallFamily, RailSide>> = { mine: 'leading', call: 'trailing' };

/** Les rails à poser, rangés par bord : le chunk des rails n'a qu'à les lire. */
export type RailsBySide = Readonly<Partial<Record<RailSide, CallFamilyRow>>>;

export const railsBySide = (rows: readonly CallFamilyRow[]): RailsBySide => Object.fromEntries(rows.map((row) => [RAIL_SIDE[row.family], row]));

const familyRows = (set: CallControlSet): readonly CallFamilyRow[] =>
  ([
    { family: 'mine', actions: set.mine },
    { family: 'call', actions: set.call },
  ] as const).filter((row) => row.actions.length > 0);

/** Le menu ouvert, ou la feuille des personnes (G3.5), montrent les rangées ; une option de la pilule les remplace. */
const showsFamilyRows = (layer: CallScreenLayer): boolean => layer.kind === 'menu' || (layer.kind === 'panel' && !panelInThePill(layer.panel));

/** Les rails à l'écran : ceux que le `(…)` ouvert fait sortir, à deux seulement. */
export function railRows(disposition: CallControlsDisposition, set: CallControlSet, layer: CallScreenLayer): readonly CallFamilyRow[] {
  return disposition === 'rails' && showsFamilyRows(layer) ? familyRows(set) : [];
}

/** Les rangées légendées que le `(…)` ouvert déplie dans la pilule, à plusieurs seulement. */
export function pillRows(disposition: CallControlsDisposition, set: CallControlSet, layer: CallScreenLayer): readonly CallFamilyRow[] {
  return disposition === 'rows' && showsFamilyRows(layer) ? familyRows(set) : [];
}

/** La pilule grandit pour le panneau qu'elle contient, et, à plusieurs, pour ses rangées. À deux, `(…)` seul ne la fait pas grandir. */
export function unfoldsPill(disposition: CallControlsDisposition, layer: CallScreenLayer): boolean {
  return (layer.kind === 'panel' && panelInThePill(layer.panel)) || (disposition === 'rows' && showsFamilyRows(layer));
}
