import type { ActiveCall } from './call-store';
import { callLayout, type CallLayout } from './call-view';

/**
 * **LES COMMANDES DE L'APPEL EN « C ADAPTÉ »** (#8391) — les règles de la vue,
 * sans DOM : ce que la pilule de verre porte, ce que le `(…)` en sort, où ça
 * sort, et quand tout s'efface pendant une vidéo.
 *
 * La pilule est la MÊME en audio, vidéo et groupe : `(…)` · Micro · Sortie ·
 * Fin. Les actions qu'elle cache se rangent en deux familles, et l'ordre de
 * chaque famille est celui de la planche :
 *
 * - **mon image** — ce que JE montre : Caméra (qui fait aussi passer d'audio à
 *   vidéo), Retourner (seulement caméra allumée), Écran (là où le navigateur
 *   sait partager, ou pour arrêter un partage en cours) ;
 * - **l'appel** — ce qui concerne tout le monde : Sous-titres, Enregistrer
 *   (appel connecté et identifié). La conversation de l'appel n'est PAS une
 *   action : un seul chemin y mène, « Conversation » dans l'en-tête (#8436).
 *
 * En duo, les deux familles sortent en RAILS vers les bords ; en groupe, la
 * pilule grandit et les monte en RANGÉES légendées.
 */

export type MineAction = 'camera' | 'flip' | 'screen';

export type CallAction = 'captions' | 'record';

export type CallControlSet = { readonly mine: readonly MineAction[]; readonly call: readonly CallAction[] };

export type ControlsArrangement = 'rails' | 'rows';

type ControlsContext = Pick<ActiveCall, 'phase' | 'callId' | 'cameraOn' | 'screenSharing'> & {
  /** Le navigateur sait émettre un écran (`getDisplayMedia`). */
  readonly canShare: boolean;
};

const joined = (phase: ActiveCall['phase']['kind']): boolean => phase === 'connected' || phase === 'reconnecting';

/** Les actions que `(…)` sort, famille par famille, dans l'ordre de la planche. */
export function callControlSet(context: ControlsContext): CallControlSet {
  const inCall = joined(context.phase.kind);
  const mine: readonly MineAction[] = ['camera', ...(context.cameraOn ? (['flip'] as const) : []), ...((context.canShare && inCall) || context.screenSharing ? (['screen'] as const) : [])];
  const call: readonly CallAction[] = [
    ...(inCall ? (['captions'] as const) : []),
    ...(context.callId !== null && context.phase.kind === 'connected' ? (['record'] as const) : []),
  ];
  return { mine, call };
}

/** Rails vers les bords en duo, rangées dans la pilule en groupe. */
export function controlsArrangement(call: Pick<ActiveCall, 'isGroup'>): ControlsArrangement {
  return call.isGroup ? 'rows' : 'rails';
}

/**
 * La scène est-elle VIDÉO ? Seule une scène vidéo efface ses commandes : en
 * audio, il n'y a rien à dégager.
 */
export function isVideoScene(call: Pick<ActiveCall, 'members' | 'cameraOn' | 'remoteStreams' | 'isGroup' | 'phase'>): boolean {
  if (!joined(call.phase.kind)) return false;
  const layout: CallLayout = callLayout(call);
  if (layout === 'video-duo' || layout === 'screen') return true;
  if (layout !== 'grid') return false;
  return call.cameraOn || Object.values(call.members).some((member) => member.cameraOn || member.screenSharing);
}

/** Le délai sans geste après lequel une vidéo efface pilule, rails et en-tête. */
export const CHROME_IDLE_MS = 4000;

/**
 * Les commandes s'effacent-elles ? Seulement sur une scène vidéo, après
 * `CHROME_IDLE_MS` sans geste, jamais quand le focus CLAVIER est dans les
 * commandes (on ne retire pas le sol sous les pieds de qui tabule), jamais
 * sous `prefers-reduced-motion` (rien n'apparaît ni ne disparaît de lui-même).
 */
export function chromeHidden(state: { readonly videoScene: boolean; readonly idleMs: number; readonly keyboardInside: boolean; readonly reducedMotion: boolean }): boolean {
  return state.videoScene && !state.keyboardInside && !state.reducedMotion && state.idleMs >= CHROME_IDLE_MS;
}
