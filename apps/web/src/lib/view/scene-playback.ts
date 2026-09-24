/**
 * LA LECTURE D'UNE PAGE SCÈNE EN PLEIN ÉCRAN (revue-correction #6902) — trois
 * états qui se lisent ENSEMBLE, et la seule raison qu'ils forment une loi
 * PURE plutôt qu'un `useState` de plus : leur composition est ce qui décide
 * si un bouton a un EFFET, et un effet se prouve par un témoin.
 *
 * `run` — LA REMISE À ZÉRO. `mode="story"` ne boucle pas, et `useSceneClock`
 * garde son `elapsed` d'une pause à l'autre (c'est sa loi : « la pause NE
 * remet PAS à zéro »). Remettre `playing` à `true` sur une scène TERMINÉE la
 * fait donc atteindre sa durée à la trame suivante, sans rien rejouer : le
 * bouton de lecture serait un contrôle SANS EFFET dans cet état précis
 * (loi 4). Incrémenter `run` REMONTE le player (`key`) — la seule remise à
 * zéro qui n'exige pas de toucher l'horloge, partagée par le lecteur de
 * story, les cartes du fil et le studio.
 */
export type ScenePlaybackState = {
  readonly paused: boolean;
  readonly ended: boolean;
  /** Change ⇒ le player est REMONTÉ, donc l'horloge repart de zéro. */
  readonly run: number;
};

export const initialScenePlayback = (pausedOnEntry: boolean): ScenePlaybackState => ({ paused: pausedOnEntry, ended: false, run: 0 });

/** La scène a atteint sa durée (`ScenePlayer.onEnded`) : elle ne joue plus, et
 * le bouton doit MONTRER la lecture — jamais la pause d'une scène arrêtée. */
export const scenePlaybackEnded = (state: ScenePlaybackState): ScenePlaybackState => ({ ...state, ended: true });

/**
 * LE SEUL geste de lecture, quelle que soit sa porte (le bouton, la barre
 * d'espace) : sur une scène TERMINÉE il REJOUE (nouveau `run`, plus terminée,
 * plus en pause) ; partout ailleurs il bascule la pause.
 */
export function scenePlaybackToggled(state: ScenePlaybackState): ScenePlaybackState {
  if (state.ended) return { paused: false, ended: false, run: state.run + 1 };
  return { ...state, paused: !state.paused };
}

/** Un appui long entre en plein cadre EN PAUSE (`stageAfter`) — il ne remet
 * rien à zéro, il ARRÊTE. */
export const scenePlaybackPaused = (state: ScenePlaybackState): ScenePlaybackState => ({ ...state, paused: true });

/** Ce que le moteur reçoit : une scène ne joue que si elle est la page ACTIVE,
 * qu'elle BOUGE, qu'on ne l'a pas mise en pause et qu'elle n'est pas finie. */
export const scenePlays = (params: { readonly state: ScenePlaybackState; readonly isActive: boolean; readonly moves: boolean }): boolean =>
  params.isActive && params.moves && !params.state.paused && !params.state.ended;

/** Le bouton MONTRE la lecture dès que la scène ne joue pas — en pause comme
 * terminée : deux causes, un seul glyphe, et le libellé SUIT. */
export const scenePlaybackShowsPlay = (state: ScenePlaybackState): boolean => state.paused || state.ended;
