import type { CameraFacing } from '@/lib/stories/studio-quick-capture';

/**
 * **L'ACQUISITION DU FLUX DE LA CAMÉRA DU COMPOSER** (#10307, #10308) — ce que
 * `createBrowserCameraEngine().open` demande au navigateur, séparé de lui
 * pour être interrogé sans navigateur :
 *
 *  - la PREMIÈRE ouverture demande l'optique voulue (préférence : un portable
 *    sans caméra arrière ouvre la sienne) et le micro, d'un seul geste ;
 *  - une BASCULE avant ↔ arrière arrête d'abord la piste vidéo en cours — un
 *    téléphone n'ouvre pas deux capteurs à la fois, et la demande suivante
 *    échouait ou rendait l'image figée de l'ancien —, demande l'autre optique
 *    EXACTEMENT (une préférence pouvait rendre la même), et GARDE le micro
 *    déjà ouvert : le son ne se renégocie pas à chaque bascule.
 */

export type CameraTrackLike = { readonly kind: string; readonly stop: () => void };
export type CameraStreamLike<T extends CameraTrackLike = CameraTrackLike> = {
  readonly getVideoTracks: () => readonly T[];
  readonly getAudioTracks: () => readonly T[];
};

const SIZE = { width: { ideal: 1080 }, height: { ideal: 1920 } } as const;

function constraints(facing: CameraFacing, { exact, audio }: { readonly exact: boolean; readonly audio: boolean }): MediaStreamConstraints {
  return { video: { facingMode: exact ? { exact: facing } : facing, ...SIZE }, audio };
}

/** `OverconstrainedError` n'hérite pas d'`Error` partout (un `DOMException`
 * ailleurs) : seul son nom fait foi. */
function overconstrained(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'OverconstrainedError';
}

export async function acquireCamera<T extends CameraTrackLike, S extends CameraStreamLike<T>>({
  facing,
  previous,
  request,
  assemble,
}: {
  readonly facing: CameraFacing;
  /** Le flux en cours, à la bascule : sa vidéo s'arrête, son micro reste. */
  readonly previous?: S;
  readonly request: (constraints: MediaStreamConstraints) => Promise<S>;
  /** Assemble la nouvelle vidéo et le micro gardé en un flux. */
  readonly assemble: (tracks: readonly T[]) => S;
}): Promise<S> {
  if (previous === undefined) return request(constraints(facing, { exact: false, audio: true }));
  previous.getVideoTracks().forEach((track) => track.stop());
  const video = await request(constraints(facing, { exact: true, audio: false })).catch((error: unknown) => {
    if (!overconstrained(error)) throw error;
    return request(constraints(facing, { exact: false, audio: false }));
  });
  return assemble([...video.getVideoTracks(), ...previous.getAudioTracks()]);
}
