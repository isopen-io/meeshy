import { hasVideo } from './call-view';
import type { ActiveCall } from './call-store';

/**
 * **L'IMAGE DANS L'IMAGE D'UN APPEL** (#8046, D10) — les règles de
 * `PiPCallController.swift` pour le web, sans DOM. Deux mécanismes :
 *
 * - **Document Picture-in-Picture** (Chromium 116+) : une vraie fenêtre, qui
 *   porte la vidéo ET les boutons de l'appel (micro, raccrocher, revenir) —
 *   c'est l'équivalent le plus proche de la PiP d'iOS ;
 * - **`requestPictureInPicture`** d'une `<video>` : la vidéo seule, partout
 *   où la première manque (Safari, Firefox).
 *
 * La coque Android (WebView) n'offre ni l'un ni l'autre : le bouton n'y est
 * pas dessiné. La bascule AUTOMATIQUE quand l'onglet se masque passe par
 * l'action Media Session `enterpictureinpicture` : un navigateur refuse toute
 * image dans l'image sans geste, sauf par ce chemin.
 */

export type PipSupport = 'document' | 'video' | 'none';

export type PipEnvironment = { readonly documentPictureInPicture?: unknown; readonly pictureInPictureEnabled?: boolean | undefined };

export function pipSupport(env: PipEnvironment): PipSupport {
  if (env.documentPictureInPicture !== undefined && env.documentPictureInPicture !== null) return 'document';
  return env.pictureInPictureEnabled === true ? 'video' : 'none';
}

/** Ce que CE navigateur sait — lu hors de la fenêtre PiP, pour que l'écran et la bulle décident sans charger son chunk. */
export function browserPipSupport(): PipSupport {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 'none';
  const env = window as unknown as { readonly documentPictureInPicture?: unknown };
  return pipSupport({ documentPictureInPicture: env.documentPictureInPicture, pictureInPictureEnabled: (document as { readonly pictureInPictureEnabled?: boolean }).pictureInPictureEnabled });
}

let opener: (() => Promise<boolean>) | null = null;

/**
 * La fenêtre PiP s'enregistre ici en montant (`call-pip-window.tsx`) : le
 * bouton l'appelle SYNCHRONEMENT, dans le geste. Passer par un `import()` au
 * clic laissait filer l'activation de l'utilisateur, et le navigateur
 * refusait la fenêtre (mesuré par `check-calls-during.mjs`).
 */
export function registerPipOpener(next: () => Promise<boolean>): () => void {
  opener = next;
  return () => {
    if (opener === next) opener = null;
  };
}

export function requestCallPip(): void {
  void opener?.();
}

export type PipSource = { readonly stream: MediaStream; readonly mirrored: boolean };

type PipCall = Pick<ActiveCall, 'members' | 'remoteStreams' | 'localStream' | 'cameraOn' | 'phase'>;

/** Ce qui flotte : la vidéo du premier pair qui en envoie, sinon ma caméra (en miroir, comme la vignette). */
export function pipSource(call: PipCall): PipSource | null {
  const remote = Object.values(call.members)
    .filter((member) => member.cameraOn)
    .map((member) => call.remoteStreams[member.userId])
    .find((stream) => hasVideo(stream));
  if (remote !== undefined) return { stream: remote, mirrored: false };
  return call.cameraOn && call.localStream !== null && hasVideo(call.localStream) ? { stream: call.localStream, mirrored: true } : null;
}

export function shouldOfferPip(call: PipCall, support: PipSupport): boolean {
  return support !== 'none' && call.phase.kind !== 'ended' && call.phase.kind !== 'incoming' && pipSource(call) !== null;
}

export type AutoPipSession = { readonly setActionHandler: (action: string, handler: (() => void) | null) => void };

/**
 * Arme la bascule automatique ; rend ce qui la désarme. Une action inconnue
 * lève un `TypeError` (Firefox, Safari) : la bascule manque, l'appel non.
 */
export function armAutoPip(session: AutoPipSession | undefined, enter: () => void): () => void {
  const set = (handler: (() => void) | null): boolean => {
    try {
      session?.setActionHandler('enterpictureinpicture', handler);
      return session !== undefined;
    } catch {
      return false;
    }
  };
  const armed = set(enter);
  return () => {
    if (armed) set(null);
  };
}
