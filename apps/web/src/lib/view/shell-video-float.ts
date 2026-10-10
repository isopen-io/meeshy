import { appelNatifMethode, coqueCourante, type CoqueNative } from '@/lib/native-shell';

/**
 * L'image dans l'image d'une vidéo, dans la coque Android (#9410).
 *
 * La WebView n'expose pas l'API Picture-in-Picture (`pictureInPictureEnabled`
 * est faux) : sans relais, le bouton de la barre vidéo disparaissait là où
 * Chrome Android l'offre. La coque sait faire flotter une vidéo en plein écran
 * (#9242, `MainActivity`) : l'appui passe donc la vidéo en plein écran, puis
 * demande à la coque de flotter. Un système qui refuse (API < 26, PiP coupée
 * dans les réglages) rend la vidéo à la page.
 *
 * La coque reçoit la taille de la vidéo (#9845) : la fenêtre flottante prend sa
 * forme, comme dans Chrome Android, au lieu du paysage par défaut du système.
 *
 * Et son bouton lecture/pause (#9847), comme dans Chrome : la page dit à la
 * coque si la vidéo joue (`setFloatPlaying`), la coque remet l'appui du bouton
 * (`floatToggleRequested`). Le lien tient tant que la vidéo est en plein écran.
 */
export type FloatableVideo = {
  readonly requestFullscreen: () => Promise<void>;
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly paused: boolean;
  readonly play: () => Promise<void>;
  readonly pause: () => void;
  addEventListener(type: 'play' | 'pause', listener: () => void): void;
  removeEventListener(type: 'play' | 'pause', listener: () => void): void;
};

export type FullscreenExit = {
  readonly exitFullscreen?: () => Promise<void>;
  readonly fullscreenElement?: unknown;
  addEventListener?(type: 'fullscreenchange', listener: () => void): void;
  removeEventListener?(type: 'fullscreenchange', listener: () => void): void;
};

export type VideoFloat = (video: FloatableVideo) => void;

const PLUGIN = 'MeeshyPlayback';

function lierLeBouton(coque: CoqueNative | undefined, doc: FullscreenExit | undefined, video: FloatableVideo): void {
  const dire = appelNatifMethode(coque, PLUGIN, 'setFloatPlaying');
  const addListener = coque?.addListener;
  if (dire === null || typeof addListener !== 'function') return;
  const signaler = (): void => {
    void dire({ playing: !video.paused }).catch(() => {});
  };
  const basculer = (): void => {
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };
  const appui = addListener(PLUGIN, 'floatToggleRequested', basculer);
  const delier = (): void => {
    if (doc?.fullscreenElement) return;
    video.removeEventListener('play', signaler);
    video.removeEventListener('pause', signaler);
    doc?.removeEventListener?.('fullscreenchange', delier);
    void appui.remove().catch(() => {});
  };
  video.addEventListener('play', signaler);
  video.addEventListener('pause', signaler);
  doc?.addEventListener?.('fullscreenchange', delier);
  signaler();
}

export function shellVideoFloat(
  coque: CoqueNative | undefined = coqueCourante(),
  doc: FullscreenExit | undefined = typeof document === 'undefined' ? undefined : document,
): VideoFloat | null {
  const flotter = appelNatifMethode(coque, PLUGIN, 'floatVideo');
  if (flotter === null) return null;
  return (video) => {
    void video
      .requestFullscreen()
      .then(() => {
        lierLeBouton(coque, doc, video);
        return flotter({ width: video.videoWidth, height: video.videoHeight }).then((reponse) => {
          if ((reponse as { readonly floated?: unknown } | null)?.floated !== true) return doc?.exitFullscreen?.();
          return undefined;
        });
      })
      .catch(() => {});
  };
}
