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
 */
export type FloatableVideo = { readonly requestFullscreen: () => Promise<void> };

export type FullscreenExit = { readonly exitFullscreen?: () => Promise<void> };

export type VideoFloat = (video: FloatableVideo) => void;

export function shellVideoFloat(
  coque: CoqueNative | undefined = coqueCourante(),
  doc: FullscreenExit | undefined = typeof document === 'undefined' ? undefined : document,
): VideoFloat | null {
  const flotter = appelNatifMethode(coque, 'MeeshyPlayback', 'floatVideo');
  if (flotter === null) return null;
  return (video) => {
    void video
      .requestFullscreen()
      .then(() =>
        flotter({}).then((reponse) => {
          if ((reponse as { readonly floated?: unknown } | null)?.floated !== true) return doc?.exitFullscreen?.();
          return undefined;
        }),
      )
      .catch(() => {});
  };
}
