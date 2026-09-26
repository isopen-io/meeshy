/**
 * **LE MICRO ET LA CAMÉRA** (#6382) — contraintes reprises de l'ancien web
 * (`call-media-constraints.ts`, tag `legacy-web-final`) : écho, bruit et gain
 * traités par le navigateur, caméra 640×480 visée (720p au plus), 24 i/s,
 * caméra avant par défaut comme iOS (§ 7.7 : caméra avant sur iPhone).
 */

export type Facing = 'user' | 'environment';

export type MediaDevicesLike = Pick<MediaDevices, 'getUserMedia'>;

export type DisplayDevicesLike = { readonly getDisplayMedia?: MediaDevices['getDisplayMedia'] };

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

export function audioInputConstraints(microphoneId: string | null): MediaTrackConstraints {
  return microphoneId === null ? AUDIO_CONSTRAINTS : { ...AUDIO_CONSTRAINTS, deviceId: { ideal: microphoneId } };
}

/**
 * La caméra choisie (#8046) tient lieu de caméra « de face » ; le bouton de bascule
 * (`switchCamera`) cherche l'AUTRE face, sans identifiant. Garder les deux
 * dans une même contrainte laisserait le navigateur arbitrer entre elles.
 */
export function videoInputConstraints(facing: Facing, cameraId: string | null): MediaTrackConstraints {
  if (cameraId === null || facing !== 'user') return videoConstraints(facing);
  const { facingMode: _facing, ...rest } = videoConstraints(facing);
  return { ...rest, deviceId: { ideal: cameraId } };
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
export type InputChoice = { readonly microphoneId?: string | null; readonly cameraId?: string | null };

export async function acquireCallMedia(options: { readonly video: boolean; readonly facing: Facing; readonly mediaDevices?: MediaDevicesLike | null } & InputChoice): Promise<MediaStream> {
  const source = options.mediaDevices === undefined ? devices() : options.mediaDevices;
  if (source === null) throw Object.assign(new Error('media-devices-missing'), { name: 'NotFoundError' });
  const audio = audioInputConstraints(options.microphoneId ?? null);
  if (!options.video) return source.getUserMedia({ audio, video: false });
  try {
    return await source.getUserMedia({ audio, video: videoInputConstraints(options.facing, options.cameraId ?? null) });
  } catch {
    return source.getUserMedia({ audio, video: false });
  }
}

export async function acquireCamera(options: { readonly facing: Facing; readonly mediaDevices?: MediaDevicesLike | null; readonly cameraId?: string | null }): Promise<MediaStreamTrack> {
  const source = options.mediaDevices === undefined ? devices() : options.mediaDevices;
  if (source === null) throw Object.assign(new Error('media-devices-missing'), { name: 'NotFoundError' });
  const stream = await source.getUserMedia({ audio: false, video: videoInputConstraints(options.facing, options.cameraId ?? null) });
  const track = stream.getVideoTracks()[0];
  if (track === undefined) throw Object.assign(new Error('no-camera'), { name: 'NotFoundError' });
  return track;
}

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

/**
 * Un appareil choisi au sélecteur (#8046), EXIGÉ (`exact`) : c'est un geste
 * explicite, pas une préférence de démarrage — un appareil occupé doit
 * échouer ici, pas ouvrir silencieusement son voisin. `null` rouvre le défaut
 * du système.
 */
export async function acquireChosenInput(options: { readonly kind: 'camera' | 'microphone'; readonly deviceId: string | null; readonly mediaDevices?: MediaDevicesLike | null }): Promise<MediaStreamTrack> {
  const source = options.mediaDevices === undefined ? devices() : options.mediaDevices;
  if (source === null) throw Object.assign(new Error('media-devices-missing'), { name: 'NotFoundError' });
  const exact = options.deviceId === null ? {} : { deviceId: { exact: options.deviceId } };
  const stream =
    options.kind === 'microphone'
      ? await source.getUserMedia({ audio: { ...AUDIO_CONSTRAINTS, ...exact }, video: false })
      : await source.getUserMedia({ audio: false, video: { ...videoInputConstraints('user', options.deviceId), ...exact } });
  const track = (options.kind === 'microphone' ? stream.getAudioTracks() : stream.getVideoTracks())[0];
  if (track === undefined) throw Object.assign(new Error('no-device'), { name: 'NotFoundError' });
  return track;
}

/**
 * L'écran, la fenêtre ou l'onglet que l'utilisateur choisit (#8063) — le
 * sélecteur est celui du navigateur. Vidéo seule : le son de l'appel reste
 * celui du micro. `contentHint: 'detail'` dit à l'encodeur de garder le texte
 * net plutôt que la fluidité, comme ReplayKit côté iOS.
 */
export async function acquireDisplay(options: { readonly mediaDevices?: DisplayDevicesLike | null } = {}): Promise<MediaStreamTrack> {
  const source = options.mediaDevices === undefined ? (devices() as DisplayDevicesLike | null) : options.mediaDevices;
  if (source === null || typeof source.getDisplayMedia !== 'function') throw Object.assign(new Error('display-media-missing'), { name: 'NotSupportedError' });
  const stream = await source.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
  const track = stream.getVideoTracks()[0];
  if (track === undefined) throw Object.assign(new Error('no-display'), { name: 'NotFoundError' });
  track.contentHint = 'detail';
  return track;
}
