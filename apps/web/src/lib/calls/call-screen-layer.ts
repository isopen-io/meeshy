/**
 * **UNE CHOSE À LA FOIS** (#8578) — la couche de l'écran d'appel, en loi pure.
 * L'écran est dans UN seul de ces états, jamais deux empilés :
 *
 * - `idle` : la scène, l'en-tête et la ligne de base (`(…)` · Micro · Sortie ·
 *   Fin) ;
 * - `menu` : `(…)` ouvert, « Mon image » et « L'appel » déployés — en rails
 *   sur les bords à deux, en rangées au-dessus de la ligne de base à plusieurs
 *   (`call-controls-disposition.ts`, #17327). Ouvert PAR-DESSUS un journal
 *   (`stowed`), il le range : le journal n'est pas fermé, refermer les actions
 *   le rend (#17343) ;
 * - `panel` : un sous-menu (Réagir, Enregistrer, Ajouter, Journal) qui
 *   REMPLACE les rangées — ‹ revient au menu, ✕ ferme tout ;
 * - `mode` : Effets ou Montage — tout le chrome d'appel s'efface (en-tête,
 *   pilule, rails, rangées, zoom de ma caméra) et seul reste le mode : son
 *   carrousel centré (deux tapes : photo, appui long : vidéo — #8625), ✕
 *   pour en sortir. Les sous-titres restent.
 *
 * Aucune couche ne s'efface d'elle-même au bout d'une attente (#8988) : seul
 * un toucher sur la scène range les commandes (`use-call-chrome.ts`).
 */

export type CallPanelKind = 'react' | 'record' | 'people' | 'journal';

/**
 * Où se dessine une option (G3.5, loi 14, miroir de `isDrawnInThePill` d'iOS) :
 * Réagir, Enregistrer et le Journal DANS la pilule, qu'elles agrandissent et dont
 * elles remplacent les rangées ; Ajouter, qui présente la liste des amis, s'ouvre
 * en FEUILLE par-dessus l'écran et laisse les rangées (ou les rails) sous elle.
 */
export const panelInThePill = (panel: CallPanelKind): boolean => panel !== 'people';

export type CallModeKind = 'effects' | 'montage';

/** Ce que `(…)` a RANGÉ derrière le menu (#17343) : le journal n'est pas fermé, refermer les actions le rend. */
export type CallStowed = 'journal';

export type CallScreenLayer =
  | { readonly kind: 'idle' }
  | { readonly kind: 'menu'; readonly stowed?: CallStowed }
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

const MENU_OVER_JOURNAL: CallScreenLayer = { kind: 'menu', stowed: 'journal' };

const JOURNAL_PANEL: CallScreenLayer = { kind: 'panel', panel: 'journal' };

/** `(…)` : ouvre le menu, le referme — et RANGE le journal ouvert au lieu de le fermer, puis le rend (#17343). */
function toggledMenu(layer: CallScreenLayer): CallScreenLayer {
  if (layer.kind === 'idle') return MENU;
  if (layer.kind === 'panel') return layer.panel === 'journal' ? MENU_OVER_JOURNAL : IDLE;
  return layer.kind === 'menu' && layer.stowed !== undefined ? JOURNAL_PANEL : IDLE;
}

export function nextLayer(layer: CallScreenLayer, event: CallLayerEvent): CallScreenLayer {
  if (event.type === 'ended' || event.type === 'exit-mode' || event.type === 'close') return IDLE;
  if (event.type === 'enter-mode') return { kind: 'mode', mode: event.mode };
  if (layer.kind === 'mode') return event.type === 'back' ? IDLE : layer;
  if (event.type === 'toggle-menu') return toggledMenu(layer);
  if (event.type === 'back') return layer.kind === 'panel' ? MENU : layer.kind === 'menu' && layer.stowed !== undefined ? layer : IDLE;
  return layer.kind === 'panel' && layer.panel === event.panel ? MENU : { kind: 'panel', panel: event.panel };
}

export type LayerOffer = Readonly<Record<CallPanelKind | CallModeKind, boolean>>;

/** Une action qui n'est plus offerte (la vidéo perdue, l'appel qui se reconnecte) ferme ce qu'elle avait ouvert. */
export function layerOffered(layer: CallScreenLayer, offer: LayerOffer): CallScreenLayer {
  if (layer.kind === 'mode') return offer[layer.mode] ? layer : IDLE;
  if (layer.kind === 'panel') return offer[layer.panel] ? layer : MENU;
  if (layer.kind === 'menu' && layer.stowed !== undefined) return offer[layer.stowed] ? layer : MENU;
  return layer;
}

export type LayerChrome = {
  readonly header: boolean;
  readonly pill: boolean;
  readonly rows: boolean;
  readonly panel: CallPanelKind | null;
  readonly mode: CallModeKind | null;
  /** Le zoom de ma caméra (cran de ma vignette, capsule du plein écran) : ma vignette ne porte aucune commande (#17327). */
  readonly selfZoom: boolean;
};

export function layerChrome(layer: CallScreenLayer): LayerChrome {
  if (layer.kind === 'mode') return { header: false, pill: false, rows: false, panel: null, mode: layer.mode, selfZoom: false };
  return {
    header: true,
    pill: true,
    rows: layer.kind === 'menu' || (layer.kind === 'panel' && !panelInThePill(layer.panel)),
    panel: layer.kind === 'panel' ? layer.panel : null,
    mode: null,
    selfZoom: true,
  };
}
