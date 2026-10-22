/**
 * **LE TIER DE CAPACITE D'UN APPAREIL** (W10, #11316) - PUR, et jumeau de
 * `DeviceMediaTier.classify` (iOS, `packages/MeeshySDK/.../Media/DeviceMediaTier.swift`).
 * Les deux rejouent le MEME fichier de vecteurs,
 * `packages/shared/fixtures/device-tier-vectors.json` : la loi ne lit que des
 * entrees NEUTRES, et ne peut pas diverger d'un cote sans qu'un temoin rougisse.
 *
 * Chaque appareil est range en bas / moyen / haut / pro, depuis ce qu'il
 * DECLARE, et tous les consommateurs (fenetre des reels, films Lottie, cadence
 * de decoupe des effets d'appel, ceremonie de frappe) lisent ce rang au lieu de
 * reinventer chacun son seuil de memoire. Ce fichier est aussi le SEUL lecteur
 * de `deviceMemory`, `hardwareConcurrency` et `navigator.connection`
 * (`capability-guard.test.ts`).
 *
 * Le tier est ASYMETRIQUE : `high` est le comportement historique, `pro` ne le
 * depasse que la ou c'est gratuit, et seuls `low` et `mid` BAISSENT un plafond.
 * Un signal inconnu ne baisse rien (Safari ne sert ni memoire ni connexion).
 *
 * Ce que le web ne sait pas MESURER est declare par l'hote, jamais devine :
 * la cadence de l'ecran (60 par defaut), l'AV1 materiel (faux par defaut) et
 * la chaleur (toujours nominale). Le tier `pro` n'est donc atteint que si
 * l'hote a mesure 120 Hz ET l'AV1 materiel - le navigateur seul rend au plus `high`.
 *
 * Au-dela de la loi, le RESEAU plafonne (`networkCeiling`) : 2G ou moins rend
 * `low`, 3G, donnees economisees et `prefers-reduced-data` plafonnent a `mid`.
 */
export type DeviceTier = 'low' | 'mid' | 'high' | 'pro';

export type DeviceThermal = 'nominal' | 'fair' | 'serious' | 'critical';

export type DeviceTierInputs = {
  readonly memoryGB: number | null;
  readonly cores: number | null;
  readonly maxFps: number;
  readonly hwAV1: boolean;
  readonly hwHEVC: boolean;
  readonly lowPower: boolean;
  readonly thermal: DeviceThermal;
};

const TIER_ORDER: readonly DeviceTier[] = ['low', 'mid', 'high', 'pro'];

const MID_MEMORY_GB = 2.5;
const HIGH_MEMORY_GB = 3.5;
const PRO_MEMORY_GB = 5.5;
const HIGH_CORES = 4;
const PRO_CORES = 6;
const PRO_FRAMES_PER_SECOND = 120;

export const tierRank = (tier: DeviceTier): number => TIER_ORDER.indexOf(tier);

export const lowerTier = (a: DeviceTier, b: DeviceTier): DeviceTier => (tierRank(a) <= tierRank(b) ? a : b);

function hardwareTier(inputs: DeviceTierInputs): DeviceTier {
  const memoryAtLeast = (threshold: number): boolean => inputs.memoryGB === null || inputs.memoryGB >= threshold;
  const coresAtLeast = (threshold: number): boolean => inputs.cores === null || inputs.cores >= threshold;
  if (!inputs.hwHEVC || !memoryAtLeast(MID_MEMORY_GB)) return 'low';
  if (inputs.hwAV1 && inputs.maxFps >= PRO_FRAMES_PER_SECOND && memoryAtLeast(PRO_MEMORY_GB) && coresAtLeast(PRO_CORES)) return 'pro';
  if (memoryAtLeast(HIGH_MEMORY_GB) && coresAtLeast(HIGH_CORES)) return 'high';
  return 'mid';
}

export function classifyDeviceTier(inputs: DeviceTierInputs): DeviceTier {
  if (inputs.thermal === 'serious' || inputs.thermal === 'critical') return 'low';
  const hardware = hardwareTier(inputs);
  return inputs.lowPower ? lowerTier(hardware, 'mid') : hardware;
}

/** La connexion annoncee par `navigator.connection`, normalisee : une valeur de type inattendu est ignoree. */
export type NetworkConnection = { readonly type?: string; readonly effectiveType?: string; readonly saveData?: boolean };

/** Le sous-ensemble de `navigator` que la loi lit ; tout est optionnel (Safari, worker). */
export type DeviceNavigator = {
  readonly deviceMemory?: number;
  readonly hardwareConcurrency?: number;
  readonly connection?: NetworkConnection;
};

export type DeviceBattery = { readonly level: number; readonly charging: boolean };

export type DeviceHost = {
  readonly navigator?: DeviceNavigator | undefined;
  /** `(prefers-reduced-data: reduce)` ; absent hors fenetre. */
  readonly prefersReducedData?: boolean;
  readonly battery?: DeviceBattery | undefined;
  /** Cadence MESUREE de l'ecran ; 60 sans mesure. */
  readonly maxFps?: number;
  /** Decodage materiel MESURE ; AV1 faux et HEVC vrai sans mesure (l'inconnu ne baisse rien). */
  readonly hwAV1?: boolean;
  readonly hwHEVC?: boolean;
};

const LOW_BATTERY_LEVEL = 0.2;
const DEFAULT_FRAMES_PER_SECOND = 60;
const SLOW_NETWORKS: ReadonlySet<string> = new Set(['slow-2g', '2g']);

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

/** La batterie faible ne compte que debranchee. */
export const batteryIsLow = (battery: DeviceBattery | undefined): boolean | undefined =>
  battery === undefined ? undefined : !battery.charging && battery.level <= LOW_BATTERY_LEVEL;

export function connectionOf(navigator: DeviceNavigator | undefined): NetworkConnection {
  const connection: unknown = navigator?.connection;
  if (typeof connection !== 'object' || connection === null) return {};
  const type: unknown = Reflect.get(connection, 'type');
  const effectiveType: unknown = Reflect.get(connection, 'effectiveType');
  const saveData: unknown = Reflect.get(connection, 'saveData');
  return {
    ...(typeof type === 'string' ? { type } : {}),
    ...(typeof effectiveType === 'string' ? { effectiveType } : {}),
    ...(typeof saveData === 'boolean' ? { saveData } : {}),
  };
}

/** La mémoire rapportée en Gio, ou `undefined` quand l'appareil ne la dit pas. */
export const deviceMemoryOf = (navigator: DeviceNavigator | undefined): number | undefined => positive(navigator?.deviceMemory) ?? undefined;

export function deviceTierInputsOf(host: DeviceHost): DeviceTierInputs {
  return {
    memoryGB: deviceMemoryOf(host.navigator) ?? null,
    cores: positive(host.navigator?.hardwareConcurrency),
    maxFps: host.maxFps ?? DEFAULT_FRAMES_PER_SECOND,
    hwAV1: host.hwAV1 ?? false,
    hwHEVC: host.hwHEVC ?? true,
    lowPower: batteryIsLow(host.battery) === true,
    thermal: 'nominal',
  };
}

function networkCeiling(host: DeviceHost): DeviceTier {
  const connection = connectionOf(host.navigator);
  if (SLOW_NETWORKS.has(connection.effectiveType ?? '')) return 'low';
  const economical = connection.saveData === true || host.prefersReducedData === true || connection.effectiveType === '3g';
  return economical ? 'mid' : 'pro';
}

export function deviceTierOf(host: DeviceHost): DeviceTier {
  return lowerTier(classifyDeviceTier(deviceTierInputsOf(host)), networkCeiling(host));
}

const prefersReducedData = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-data: reduce)').matches;

/** L'hote vivant (fenetre ou worker) ; les signaux absents restent absents. */
export function browserDeviceHost(): DeviceHost {
  return {
    navigator: typeof navigator === 'object' ? (navigator as DeviceNavigator) : undefined,
    prefersReducedData: prefersReducedData(),
  };
}

/** Le tier de CET appareil, maintenant : quelques lectures, relues a chaque appel (le reseau change en cours de session). */
export const currentDeviceTier = (): DeviceTier => deviceTierOf(browserDeviceHost());

/** La connexion annoncee, ou `null` hors navigateur. */
export function browserConnection(): NetworkConnection | null {
  return typeof navigator === 'object' ? connectionOf(navigator as DeviceNavigator) : null;
}

/** Chaque changement du type de connexion, là où l'API existe ; rend le désabonnement. */
export function onConnectionChange(listener: () => void): () => void {
  const target: unknown = typeof navigator === 'object' ? Reflect.get(navigator, 'connection') : undefined;
  if (typeof EventTarget === 'undefined' || !(target instanceof EventTarget)) return () => undefined;
  target.addEventListener('change', listener);
  return () => target.removeEventListener('change', listener);
}
