import type { ActiveCall } from './call-store';
import { callLayout, type CallLayout } from './call-view';

/**
 * **LES COMMANDES DE L'APPEL EN « C ADAPTÉ »** (#8391) — les règles de la vue,
 * sans DOM : ce que la pilule de verre porte, ce que le `(…)` en sort, où ça
 * sort, et ce qui range tout pendant une vidéo.
 *
 * La pilule est la MÊME en audio, vidéo et groupe : `(…)` · Micro · Sortie ·
 * Fin. Les actions qu'elle cache se rangent en deux familles, et l'ordre de
 * chaque famille est celui de la planche :
 *
 * - **mon image** — ce que JE montre : Caméra (qui fait aussi passer d'audio à
 *   vidéo), Retourner (caméra allumée, et une AUTRE caméra où se retourner —
 *   sur un ordinateur à une webcam, le bouton n'aurait aucun effet, #8432), Effets (caméra allumée, hors
 *   partage d'écran, là où le navigateur sait les faire — #8442), Écran (là où
 *   le navigateur sait partager, ou pour arrêter un partage en cours) ;
 * - **l'appel** — ce qui concerne tout le monde : Sous-titres, Enregistrer
 *   (appel connecté et identifié), Capturer (une vidéo connectée — #8552),
 *   Ajouter des personnes (#8433) et Réagir (#8439), en duo comme en groupe
 *   dès qu'un appel identifié est rejoint. La conversation de l'appel n'est
 *   PAS une action : un seul chemin y mène, « Conversation » dans l'en-tête
 *   (#8436).
 *
 * En duo comme en groupe, la pilule GRANDIT vers le haut et monte chaque
 * famille en une RANGÉE légendée qui défile à l'horizontale (#8550).
 */

export type MineAction = 'camera' | 'flip' | 'effects' | 'screen';

export type CallAction = 'captions' | 'journal' | 'record' | 'capture' | 'invite' | 'react';

export type CallControlSet = { readonly mine: readonly MineAction[]; readonly call: readonly CallAction[] };

type ControlsContext = Pick<ActiveCall, 'phase' | 'callId' | 'cameraOn' | 'screenSharing'> & {
  /** Le navigateur sait émettre un écran (`getDisplayMedia`). */
  readonly canShare: boolean;
  /** Le navigateur sait traiter ma vidéo, ou la caméra offre son flou (#8442). */
  readonly canEffect: boolean;
  /** L'appareil a une autre caméra où se retourner. */
  readonly canFlip: boolean;
  /** La scène montre au moins une image (`isVideoScene`). */
  readonly videoScene: boolean;
};

const joined = (phase: ActiveCall['phase']['kind']): boolean => phase === 'connected' || phase === 'reconnecting';

/** Les actions que `(…)` sort, famille par famille, dans l'ordre de la planche. */
export function callControlSet(context: ControlsContext): CallControlSet {
  const inCall = joined(context.phase.kind);
  const mine: readonly MineAction[] = [
    'camera',
    ...(context.cameraOn && context.canFlip ? (['flip'] as const) : []),
    ...(context.cameraOn && context.canEffect && !context.screenSharing ? (['effects'] as const) : []),
    ...((context.canShare && inCall) || context.screenSharing ? (['screen'] as const) : []),
  ];
  const call: readonly CallAction[] = [
    ...(inCall ? (['captions', 'journal'] as const) : []),
    ...(context.callId !== null && context.phase.kind === 'connected' ? (['record'] as const) : []),
    ...(context.videoScene && context.phase.kind === 'connected' ? (['capture'] as const) : []),
    ...(context.callId !== null && inCall ? (['invite', 'react'] as const) : []),
  ];
  return { mine, call };
}

/**
 * Une autre caméra où se retourner ? Une liste vide (énumération pas encore
 * rendue) ne retire rien : seule UNE caméra connue le fait.
 */
export const flipOffered = (devices: readonly Pick<MediaDeviceInfo, 'kind'>[]): boolean => devices.filter((device) => device.kind === 'videoinput').length !== 1;

/**
 * La scène est-elle VIDÉO ? Seule une scène vidéo range ses commandes : en
 * audio, il n'y a rien à dégager.
 */
export function isVideoScene(call: Pick<ActiveCall, 'members' | 'cameraOn' | 'remoteStreams' | 'isGroup' | 'phase'>): boolean {
  if (!joined(call.phase.kind)) return false;
  const layout: CallLayout = callLayout(call);
  if (layout === 'video-duo' || layout === 'screen') return true;
  if (layout !== 'grid') return false;
  return call.cameraOn || Object.values(call.members).some((member) => member.cameraOn || member.screenSharing);
}

/**
 * Ce que montrent les commandes d'une vidéo (#8550, #8988) : `shown`, ou
 * `dismissed` — rangées d'un toucher. Toucher la scène les range ou les rend,
 * TOUTES ; le clavier les rend toujours. Rien d'autre ne les range, ni
 * l'attente ni la souris (directive porteur du 2026-10-01 : « On cache les
 * contrôleurs quand on touche l'écran et on les remet quand on retouche »).
 */
export type ChromeVisibility = 'shown' | 'dismissed';

export type ChromeCue = 'tap' | 'key';

export function chromeAfter(current: ChromeVisibility, cue: ChromeCue): ChromeVisibility {
  if (cue === 'key') return 'shown';
  return current === 'shown' ? 'dismissed' : 'shown';
}
