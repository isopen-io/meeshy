/**
 * LA CAMÉRA AVANT (#9382) — `getUserMedia` pour l'aperçu et le déclencheur,
 * jamais d'enregistrement. Le résultat est une SOMME : une session qui sait
 * s'arrêter, ou le NOM du refus — réautoriser, choisir dans la galerie, garder
 * la carte seule : l'écran dit quoi faire, il ne tombe pas en échec muet.
 *
 * Aucun flux ne quitte l'appareil : l'image finale se compose sur `canvas`
 * (`compose.ts`) et ne part nulle part sans un geste de partage.
 */

export type CameraFailure = 'unsupported' | 'denied' | 'unavailable';

export type CameraSession = { readonly stream: MediaStream; readonly stop: () => void };

export type CameraResult =
  | { readonly ok: true; readonly session: CameraSession }
  | { readonly ok: false; readonly reason: CameraFailure };

type MediaSource = Pick<MediaDevices, 'getUserMedia'>;

const DENIED = new Set(['NotAllowedError', 'SecurityError', 'PermissionDeniedError']);

const failureOf = (error: unknown): CameraFailure =>
  error instanceof Error && DENIED.has(error.name) ? 'denied' : 'unavailable';

export async function openFrontCamera(media: MediaSource | undefined): Promise<CameraResult> {
  if (media === undefined || typeof media.getUserMedia !== 'function') return { ok: false, reason: 'unsupported' };
  try {
    const stream = await media.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
    });
    return { ok: true, session: { stream, stop: () => stream.getTracks().forEach((track) => track.stop()) } };
  } catch (error) {
    return { ok: false, reason: failureOf(error) };
  }
}
