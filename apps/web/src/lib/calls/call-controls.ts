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
 *   sur un ordinateur à une webcam, le bouton n'aurait aucun effet, #8432) ou,
 *   sur un ordinateur à plusieurs webcams sans avant ni arrière, le CHOIX de
 *   la caméra (#9094, `.cameraPicker` d'iOS), Effets (caméra allumée, hors
 *   partage d'écran, là où le navigateur sait les faire — #8442), Écran (là où
 *   le navigateur sait partager, ou pour arrêter un partage en cours) ;
 * - **l'appel** — ce qui concerne tout le monde : Sous-titres, Enregistrer
 *   (appel connecté et identifié), Capturer (une vidéo connectée — #8552),
 *   Ajouter des personnes (#8433) et Réagir (#8439), en duo comme en groupe
 *   dès qu'un appel identifié est rejoint, puis l'image dans l'image là où une
 *   vidéo peut flotter — à la dernière place, comme iOS (#9095). La conversation de l'appel n'est
 *   PAS une action : un seul chemin y mène, « Conversation » dans l'en-tête
 *   (#8436).
 *
 * En duo comme en groupe, la pilule GRANDIT vers le haut et monte chaque
 * famille en une RANGÉE légendée qui défile à l'horizontale (#8550).
 */

export type MineAction = 'camera' | 'flip' | 'camera-picker' | 'effects' | 'screen';

export type CallAction = 'captions' | 'journal' | 'record' | 'capture' | 'invite' | 'react' | 'pip';

/** Ce que propose l'appareil pour changer de caméra (#9094). */
export type CameraSwitch = 'flip' | 'picker' | 'none';

export type CallControlSet = { readonly mine: readonly MineAction[]; readonly call: readonly CallAction[] };

type ControlsContext = Pick<ActiveCall, 'phase' | 'callId' | 'cameraOn' | 'screenSharing'> & {
  /** Le navigateur sait émettre un écran (`getDisplayMedia`). */
  readonly canShare: boolean;
  /** Le navigateur sait traiter ma vidéo, ou la caméra offre son flou (#8442). */
  readonly canEffect: boolean;
  /** Retourner (avant/arrière), choisir parmi des webcams, ou rien. */
  readonly cameraSwitch: CameraSwitch;
  /** Une vidéo peut flotter dans l'image dans l'image (`shouldOfferPip`). */
  readonly canPip: boolean;
  /** La scène montre au moins une image (`isVideoScene`). */
  readonly videoScene: boolean;
};

const joined = (phase: ActiveCall['phase']['kind']): boolean => phase === 'connected' || phase === 'reconnecting';

/** Les actions que `(…)` sort, famille par famille, dans l'ordre de la planche. */
export function callControlSet(context: ControlsContext): CallControlSet {
  const inCall = joined(context.phase.kind);
  const mine: readonly MineAction[] = [
    'camera',
    ...(context.cameraOn && context.cameraSwitch === 'flip' ? (['flip'] as const) : []),
    ...(context.cameraOn && context.cameraSwitch === 'picker' ? (['camera-picker'] as const) : []),
    ...(context.cameraOn && context.canEffect && !context.screenSharing ? (['effects'] as const) : []),
    ...((context.canShare && inCall) || context.screenSharing ? (['screen'] as const) : []),
  ];
  const call: readonly CallAction[] = [
    ...(inCall ? (['captions', 'journal'] as const) : []),
    ...(context.callId !== null && context.phase.kind === 'connected' ? (['record'] as const) : []),
    ...(context.videoScene && context.phase.kind === 'connected' ? (['capture'] as const) : []),
    ...(context.callId !== null && inCall ? (['invite', 'react'] as const) : []),
    ...(context.canPip ? (['pip'] as const) : []),
  ];
  return { mine, call };
}

export type CameraDevice = Pick<MediaDeviceInfo, 'kind' | 'label'> & { readonly getCapabilities?: () => { readonly facingMode?: unknown } };

const REAR_LABEL = /back|rear|environment|arri[eè]re|tras|poster|r[uü]ck|hinten|خلف/i;

const rearFacing = (device: CameraDevice): boolean => {
  const facing = typeof device.getCapabilities === 'function' ? device.getCapabilities().facingMode : undefined;
  return (Array.isArray(facing) && facing.includes('environment')) || REAR_LABEL.test(device.label);
};

/**
 * Retourner, ou choisir sa caméra (#8432, #9094) ? Un appareil qui a une
 * caméra ARRIÈRE (ses capacités ou son nom le disent) se retourne ; plusieurs
 * webcams sans avant ni arrière se CHOISISSENT — `facingMode` ne les
 * départagerait pas, la même caméra se rouvrirait. Une liste vide
 * (énumération pas encore rendue) ne retire rien : seule UNE caméra connue le
 * fait.
 */
export function cameraSwitchOf(devices: readonly CameraDevice[]): CameraSwitch {
  const cameras = devices.filter((device) => device.kind === 'videoinput');
  if (cameras.length === 0) return 'flip';
  if (cameras.length === 1) return 'none';
  return cameras.some(rearFacing) ? 'flip' : 'picker';
}

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
