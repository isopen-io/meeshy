import { acquireCamera, videoConstraints, type MediaDevicesLike } from './call-media';
import type { DataProfile } from './call-data-profile';

/**
 * **LA CAMÉRA ARRIÈRE QUI ZOOME LE PLUS LOIN** (#8441) — un téléphone a
 * souvent plusieurs objectifs à l'arrière (grand-angle, principal,
 * téléobjectif). Se retourner ouvre celui dont le zoom va le plus loin
 * (`getCapabilities().zoom.max` de chaque appareil énuméré) : c'est lui qui
 * porte le zoom optique de l'appareil, dans la coque Android comme dans
 * Chrome. Rien de connu (permission pas encore donnée, capacités muettes) :
 * le navigateur choisit, par l'orientation seule.
 */

export type CameraCandidate = { readonly deviceId: string; readonly facing: string | null; readonly zoomMax: number | null };

export function widestRearCamera(candidates: readonly CameraCandidate[]): string | null {
  const rear = candidates.filter((candidate): candidate is CameraCandidate & { readonly zoomMax: number } => candidate.facing === 'environment' && candidate.zoomMax !== null);
  const best = rear.reduce<(CameraCandidate & { readonly zoomMax: number }) | null>((widest, candidate) => (widest === null || candidate.zoomMax > widest.zoomMax ? candidate : widest), null);
  return best?.deviceId ?? null;
}

type Capabilities = { readonly facingMode?: unknown; readonly zoom?: { readonly max?: unknown } };

const candidateOf = (device: MediaDeviceInfo): CameraCandidate | null => {
  const probe = (device as MediaDeviceInfo & { readonly getCapabilities?: () => Capabilities }).getCapabilities;
  if (device.kind !== 'videoinput' || typeof probe !== 'function') return null;
  const capabilities = probe.call(device);
  const facing = Array.isArray(capabilities.facingMode) && typeof capabilities.facingMode[0] === 'string' ? capabilities.facingMode[0] : null;
  const max = capabilities.zoom?.max;
  return { deviceId: device.deviceId, facing, zoomMax: typeof max === 'number' && Number.isFinite(max) ? max : null };
};

type Enumerator = { readonly enumerateDevices: () => Promise<MediaDeviceInfo[]> };

export async function rearCameraOf(devices: Enumerator | null): Promise<string | null> {
  if (devices === null) return null;
  try {
    const list = await devices.enumerateDevices();
    return widestRearCamera(list.map(candidateOf).filter((candidate): candidate is CameraCandidate => candidate !== null));
  } catch {
    return null;
  }
}

/** La caméra arrière choisie, demandée par son identifiant (`ideal` : jamais un échec) ; sinon l'orientation. */
export function rearVideoConstraints(deviceId: string | null, profile?: DataProfile): MediaTrackConstraints {
  if (deviceId === null) return videoConstraints('environment', profile);
  const { facingMode: _facing, ...rest } = videoConstraints('environment', profile);
  return { ...rest, deviceId: { ideal: deviceId } };
}

type RearDevices = MediaDevicesLike & Enumerator;

const browserDevices = (): RearDevices | null => (typeof navigator === 'undefined' || navigator.mediaDevices === undefined ? null : navigator.mediaDevices);

/** Se retourner vers l'arrière : la caméra qui zoome le plus loin, sinon celle que le navigateur choisit. */
export async function acquireRearCamera({ mediaDevices = browserDevices(), profile }: { readonly mediaDevices?: RearDevices | null; readonly profile?: DataProfile } = {}): Promise<MediaStreamTrack> {
  const deviceId = await rearCameraOf(mediaDevices);
  return acquireCamera({ facing: 'environment', mediaDevices, video: rearVideoConstraints(deviceId, profile) });
}
