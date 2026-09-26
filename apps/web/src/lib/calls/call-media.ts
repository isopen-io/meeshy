/**
 * **LE MICRO ET LA CAMÉRA** (#6382) — contraintes reprises de l'ancien web
 * (`call-media-constraints.ts`, tag `legacy-web-final`) : écho, bruit et gain
 * traités par le navigateur, caméra 640×480 visée (720p au plus), 24 i/s,
 * caméra avant par défaut comme iOS (§ 7.7 : caméra avant sur iPhone).
 */

export type Facing = 'user' | 'environment';

export type MediaDevicesLike = Pick<MediaDevices, 'getUserMedia'>;

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function videoConstraints(facing: Facing): MediaTrackConstraints {
  return {
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: facing,
  };
}

export type MediaFailure = 'permission' | 'unavailable';

export function mediaFailureOf(error: unknown): MediaFailure {
  const name = error instanceof Error || (typeof error === 'object' && error !== null && 'name' in error) ? String((error as { name: unknown }).name) : '';
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError' ? 'permission' : 'unavailable';
}

function devices(): MediaDevicesLike | null {
  return typeof navigator === 'undefined' || navigator.mediaDevices === undefined ? null : navigator.mediaDevices;
}

/**
 * Le micro est EXIGÉ ; la caméra, si elle est refusée, rend un appel audio
 * (iOS répond en audio quand la caméra est refusée — `IncomingCallView`).
 */
export async function acquireCallMedia(options: { readonly video: boolean; readonly facing: Facing; readonly mediaDevices?: MediaDevicesLike | null }): Promise<MediaStream> {
  const source = options.mediaDevices === undefined ? devices() : options.mediaDevices;
  if (source === null) throw Object.assign(new Error('media-devices-missing'), { name: 'NotFoundError' });
  if (!options.video) return source.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
  try {
    return await source.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: videoConstraints(options.facing) });
  } catch {
    return source.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: false });
  }
}

export async function acquireCamera(options: { readonly facing: Facing; readonly mediaDevices?: MediaDevicesLike | null }): Promise<MediaStreamTrack> {
  const source = options.mediaDevices === undefined ? devices() : options.mediaDevices;
  if (source === null) throw Object.assign(new Error('media-devices-missing'), { name: 'NotFoundError' });
  const stream = await source.getUserMedia({ audio: false, video: videoConstraints(options.facing) });
  const track = stream.getVideoTracks()[0];
  if (track === undefined) throw Object.assign(new Error('no-camera'), { name: 'NotFoundError' });
  return track;
}

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
