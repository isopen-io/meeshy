/**
 * **UNE CHOSE À LA FOIS** (#8578) — la couche de l'écran d'appel, en loi pure.
 * L'écran est dans UN seul de ces états, jamais deux empilés :
 *
 * - `idle` : la scène, l'en-tête et la ligne de base (`(…)` · Micro · Sortie ·
 *   Fin) ;
 * - `menu` : `(…)` ouvert, les rangées « Mon image » et « L'appel » au-dessus
 *   de la ligne de base ;
 * - `panel` : un sous-menu (Réagir, Enregistrer, Ajouter, Journal) qui
 *   REMPLACE les rangées — ‹ revient au menu, ✕ ferme tout ;
 * - `mode` : Effets ou Montage — tout le chrome d'appel s'efface (en-tête,
 *   pilule, rangées, commandes de ma caméra) et seul reste le mode : son
 *   carrousel centré, son déclencheur, ✕ pour en sortir. Les sous-titres
 *   restent.
 *
 * L'auto-masquage (4 s sans geste) ne vaut qu'au repos et dans le menu : on
 * ne retire pas un panneau qu'on lit, ni un mode où l'on choisit.
 */

export type CallPanelKind = 'react' | 'record' | 'people' | 'journal';

export type CallModeKind = 'effects' | 'montage';

export type CallScreenLayer =
  | { readonly kind: 'idle' }
  | { readonly kind: 'menu' }
  | { readonly kind: 'panel'; readonly panel: CallPanelKind }
  | { readonly kind: 'mode'; readonly mode: CallModeKind };

export type CallLayerEvent =
  | { readonly type: 'toggle-menu' }
  | { readonly type: 'open-panel'; readonly panel: CallPanelKind }
  | { readonly type: 'back' }
  | { readonly type: 'close' }
  | { readonly type: 'enter-mode'; readonly mode: CallModeKind }
  | { readonly type: 'exit-mode' }
  | { readonly type: 'ended' };

export const IDLE: CallScreenLayer = { kind: 'idle' };

/** L'identifiant des rangées d'actions, que le `(…)` contrôle (`aria-controls`). */
export const CALL_ACTIONS_ID = 'call-actions';

/** L'identifiant de chaque panneau, que son bouton contrôle. */
export const CALL_PANEL_ID: Readonly<Record<CallPanelKind, string>> = {
  people: 'call-people-panel',
  react: 'call-react-panel',
  record: 'call-record-panel',
  journal: 'call-journal-panel',
};

/** Ce que les rangées ouvrent : un panneau (qui les remplace) ou un mode (qui libère l'écran). */
export type CallPanels = { readonly open: CallPanelKind | null; readonly toggle: (panel: CallPanelKind) => void; readonly enter: (mode: CallModeKind) => void };

const MENU: CallScreenLayer = { kind: 'menu' };

export function nextLayer(layer: CallScreenLayer, event: CallLayerEvent): CallScreenLayer {
  if (event.type === 'ended' || event.type === 'exit-mode' || event.type === 'close') return IDLE;
  if (event.type === 'enter-mode') return { kind: 'mode', mode: event.mode };
  if (layer.kind === 'mode') return event.type === 'back' ? IDLE : layer;
  if (event.type === 'toggle-menu') return layer.kind === 'idle' ? MENU : IDLE;
  if (event.type === 'back') return layer.kind === 'panel' ? MENU : IDLE;
  return layer.kind === 'panel' && layer.panel === event.panel ? MENU : { kind: 'panel', panel: event.panel };
}

export type LayerOffer = Readonly<Record<CallPanelKind | CallModeKind, boolean>>;

/** Une action qui n'est plus offerte (la vidéo perdue, l'appel qui se reconnecte) ferme ce qu'elle avait ouvert. */
export function layerOffered(layer: CallScreenLayer, offer: LayerOffer): CallScreenLayer {
  if (layer.kind === 'mode') return offer[layer.mode] ? layer : IDLE;
  if (layer.kind === 'panel') return offer[layer.panel] ? layer : MENU;
  return layer;
}

export type LayerChrome = {
  readonly header: boolean;
  readonly pill: boolean;
  readonly rows: boolean;
  readonly panel: CallPanelKind | null;
  readonly mode: CallModeKind | null;
  /** Les commandes de ma caméra (rail plein écran, capsule du zoom). */
  readonly selfControls: boolean;
  readonly autoHide: boolean;
};

export function layerChrome(layer: CallScreenLayer): LayerChrome {
  if (layer.kind === 'mode') return { header: false, pill: false, rows: false, panel: null, mode: layer.mode, selfControls: false, autoHide: false };
  return {
    header: true,
    pill: true,
    rows: layer.kind === 'menu',
    panel: layer.kind === 'panel' ? layer.panel : null,
    mode: null,
    selfControls: true,
    autoHide: layer.kind !== 'panel',
  };
}
