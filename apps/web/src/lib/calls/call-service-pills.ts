import type { ActiveCall } from './call-store';
import type { SurvivalStage } from './call-survival';
import type { TopBanner } from './call-top-banners';

/**
 * **LES PASTILLES DE SERVICE** (#18227, planche E3 « En attente » · E4 « Vidéo réduite ») — miroir de
 * `CallServicePillLaw` d'Android (PR #18373), mêmes vecteurs nommés sur les trois plateformes :
 * - « En attente » : dès que l'appel est en attente, quel que soit l'écran (reconnexion, image dans
 *   l'image comprises) — c'est elle qui dit pourquoi on n'entend plus rien ;
 * - l'avis sur ma vidéo : seulement sur l'appel établi à l'écran, en vidéo, caméra allumée, hors image
 *   dans l'image (la fenêtre réduite n'a pas la place d'une phrase).
 *
 * La loi ne connaît pas les sortes d'avis (`'none'` = aucun) : Android dit la chaleur et la lumière, le
 * web dit la survie de ma vidéo sur un réseau faible (`videoNoticeOf`).
 */
export type ServicePillSignals<N extends string> = {
  readonly isConnectedLayout: boolean;
  readonly isPictureInPicture: boolean;
  readonly isOnHold: boolean;
  readonly isVideoCall: boolean;
  readonly isCameraOn: boolean;
  readonly videoNotice: N | 'none';
};

export type ServicePills<N extends string> = { readonly isHoldShown: boolean; readonly videoNotice: N | 'none' };

const showsVideoNotice = <N extends string>(signals: ServicePillSignals<N>): boolean =>
  signals.isConnectedLayout && !signals.isPictureInPicture && signals.isVideoCall && signals.isCameraOn;

export const callServicePills = <N extends string>(signals: ServicePillSignals<N>): ServicePills<N> => ({
  isHoldShown: signals.isOnHold,
  videoNotice: showsVideoNotice(signals) ? signals.videoNotice : 'none',
});

/** Les maillons qu'elles occupent dans la pile des bannières du haut, dans l'ordre de la pile. */
export const servicePillBanners = <N extends string>(pills: ServicePills<N>): readonly TopBanner[] => [
  ...(pills.isHoldShown ? (['hold'] as const) : []),
  ...(pills.videoNotice === 'none' ? [] : (['video-notice'] as const)),
];

/** Ce que le web sait dire de ma vidéo : gelée par un réseau faible (`reduced`), puis en pause (`paused`, l'audio continue). */
export type WebVideoNotice = 'reduced' | 'paused';

export const videoNoticeOf = (survival: SurvivalStage | undefined): WebVideoNotice | 'none' =>
  survival === 'frozen' ? 'reduced' : survival === 'suspended' ? 'paused' : 'none';

/**
 * Les signaux du web. Le moteur n'expose AUCUN état d'attente (ni l'interface téléphonique ni le focus
 * audio d'Android, ni CallKit) : `isOnHold` est faux, et « En attente » ne s'allume pas ici tant qu'il
 * ne le saura pas. L'appel établi l'est encore pendant une reconnexion APRÈS un média établi.
 */
export const servicePillSignalsOf = (
  call: Pick<ActiveCall, 'phase' | 'connectedAt' | 'media' | 'cameraOn' | 'quality'>,
  isPictureInPicture: boolean,
): ServicePillSignals<WebVideoNotice> => ({
  isConnectedLayout: call.phase.kind === 'connected' || (call.phase.kind === 'reconnecting' && call.connectedAt !== null),
  isPictureInPicture,
  isOnHold: false,
  isVideoCall: call.media === 'video',
  isCameraOn: call.cameraOn,
  videoNotice: videoNoticeOf(call.quality?.survival),
});
