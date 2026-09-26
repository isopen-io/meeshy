import { writeDevicePreference, type CallDeviceRole, type PreferenceStorage } from './call-devices';
import type { CallOutputStore } from './call-output';

/**
 * **CHOISIR UN PÉRIPHÉRIQUE PENDANT L'APPEL** (#8046, D5) — l'appareil est
 * OUVERT d'abord, remis au moteur ensuite, et RETENU en dernier : une
 * préférence n'est écrite que pour un appareil qui a répondu. Une sortie
 * audio ne s'acquiert pas — elle se pose sur le magasin que les `<audio>`
 * des pairs lisent.
 */

export type DeviceChoiceDeps = {
  readonly storage: PreferenceStorage | null;
  readonly output: CallOutputStore;
  readonly acquireMicrophone: (deviceId: string | null) => Promise<MediaStreamTrack>;
  readonly acquireCamera: (deviceId: string | null) => Promise<MediaStreamTrack>;
  readonly replaceInput: (kind: 'camera' | 'microphone', track: MediaStreamTrack) => Promise<void>;
};

export async function chooseCallDevice(deps: DeviceChoiceDeps, role: CallDeviceRole, deviceId: string | null): Promise<boolean> {
  if (role === 'speaker') {
    deps.output.setState({ sinkId: deviceId });
    writeDevicePreference(deps.storage, role, deviceId);
    return true;
  }
  const acquire = role === 'microphone' ? deps.acquireMicrophone : deps.acquireCamera;
  const track = await acquire(deviceId).catch(() => null);
  if (track === null) return false;
  await deps.replaceInput(role, track);
  writeDevicePreference(deps.storage, role, deviceId);
  return true;
}
