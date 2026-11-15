/**
 * **LES PÉRIPHÉRIQUES D'UN APPEL** (#8046, D5) — la caméra, le micro et la
 * sortie audio choisis pendant un appel, retenus PAR APPAREIL (le stockage du
 * navigateur est déjà par appareil : c'est exactement la portée voulue — un
 * casque choisi sur l'ordinateur ne doit pas être cherché sur le téléphone).
 *
 * Un choix est une PRÉFÉRENCE, jamais une exigence : les contraintes le
 * demandent en `ideal`, donc un micro débranché depuis retombe sur le défaut
 * du système au lieu de faire échouer l'appel. Aucun DOM ici : l'écran des
 * périphériques (`call-devices-sheet.tsx`) et le moteur (`engine.ts`) lisent
 * les mêmes règles.
 */

export type CallDeviceRole = 'camera' | 'microphone' | 'speaker';

export type CallDevice = { readonly deviceId: string; readonly label: string };

export type CallDeviceGroups = Readonly<Record<CallDeviceRole, readonly CallDevice[]>>;

export type CallDevicePreferences = Readonly<Record<CallDeviceRole, string | null>>;

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const CALL_DEVICES_KEY = 'meeshy.call.devices.v1';

export const CALL_DEVICE_ROLES: readonly CallDeviceRole[] = ['camera', 'microphone', 'speaker'];

const KIND_ROLE: Readonly<Record<MediaDeviceKind, CallDeviceRole>> = {
  videoinput: 'camera',
  audioinput: 'microphone',
  audiooutput: 'speaker',
};

/* Chrome double l'appareil par défaut sous deux pseudo-identifiants : les
   lister ferait apparaître deux fois le même micro. « Par défaut » est déjà
   l'entrée `null` du sélecteur. */
const ALIASES: ReadonlySet<string> = new Set(['default', 'communications', '']);

const NO_PREFERENCES: CallDevicePreferences = { camera: null, microphone: null, speaker: null };

export function groupCallDevices(devices: readonly MediaDeviceInfo[], unnamed: Readonly<Record<CallDeviceRole, string>>): CallDeviceGroups {
  const byRole = (role: CallDeviceRole): readonly CallDevice[] =>
    devices
      .filter((device) => KIND_ROLE[device.kind] === role && !ALIASES.has(device.deviceId))
      .map((device, index) => ({ deviceId: device.deviceId, label: device.label.trim() === '' ? `${unnamed[role]} ${index + 1}` : device.label }));
  return { camera: byRole('camera'), microphone: byRole('microphone'), speaker: byRole('speaker') };
}

const idOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function readDevicePreferences(storage: Pick<Storage, 'getItem'> | null): CallDevicePreferences {
  try {
    const raw = storage?.getItem(CALL_DEVICES_KEY) ?? null;
    if (raw === null) return NO_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return NO_PREFERENCES;
    const record = parsed as Record<string, unknown>;
    return { camera: idOrNull(record.camera), microphone: idOrNull(record.microphone), speaker: idOrNull(record.speaker) };
  } catch {
    return NO_PREFERENCES;
  }
}

export function writeDevicePreference(storage: PreferenceStorage | null, role: CallDeviceRole, deviceId: string | null): CallDevicePreferences {
  const next = { ...readDevicePreferences(storage), [role]: deviceId };
  try {
    storage?.setItem(CALL_DEVICES_KEY, JSON.stringify(next));
  } catch {
    /* Stockage bloqué (navigation privée) : le choix vaut pour l'appel en cours. */
  }
  return next;
}

/** L'identifiant à appliquer : la préférence si l'appareil est toujours là, sinon le défaut (`null`). */
export function preferredDevice(devices: readonly CallDevice[], preference: string | null): string | null {
  return preference !== null && devices.some((device) => device.deviceId === preference) ? preference : null;
}

/** `setSinkId` : Chromium et Firefox récents ; absent de Safari iOS et de la WebView Android. */
export function sinkSelectionSupported(mediaElement: { readonly prototype: object } | undefined): boolean {
  return mediaElement !== undefined && 'setSinkId' in mediaElement.prototype;
}

export function browserPreferenceStorage(): PreferenceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Les entrées retenues sur CET appareil, que le moteur demande à l'acquisition. */
export function preferredInputs(storage: Pick<Storage, 'getItem'> | null = browserPreferenceStorage()): { readonly microphoneId: string | null; readonly cameraId: string | null } {
  const preferences = readDevicePreferences(storage);
  return { microphoneId: preferences.microphone, cameraId: preferences.camera };
}
