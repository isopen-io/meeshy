/**
 * LES CONSTANTES DE LA BATTERIE DES PROCHES (#14147) — phases, annonces, canaux,
 * configuration et codes. Hors de `./battery.ts` pour qu'un client léger (le web)
 * les lise sans Zod. Spec : `docs/superpowers/specs/2026-11-15-batterie-proches-design.md`.
 */

/**
 * La phase de l'ÉPISODE de l'émetteur. `normal` = hors épisode : rien n'est servi,
 * l'icône est cachée. `charging` n'existe qu'APRÈS une phase critique ou une extinction
 * (veille de recharge) : un branchement hors critique clôt l'épisode.
 */
export const BATTERY_PHASES = ['normal', 'low', 'critical', 'off', 'charging'] as const;
export type BatteryPhase = (typeof BATTERY_PHASES)[number];

/**
 * Ce qu'un pas d'épisode ANNONCE — jamais un message de conversation : la SyncPill
 * (socket) ou un push, selon `batteryReaderChannel`.
 *
 * - `low` : premier relevé ≤ seuil (30 %) non branché ;
 * - `threshold` : un palier 25/20/15/10 franchi, une seule fois par épisode ;
 * - `critical` : entrée en critique (≤ 5 %) ; `critical-drop` : chaque point perdu ensuite ;
 * - `probably-off` : en critique, aucun relevé ni connexion depuis 10 min (serveur) ;
 * - `charging` : branchement après critique ou extinction ;
 * - `back-on` : premier relevé après une extinction probable ;
 * - `recharged` : 100 %, ou débranché au-dessus de 80 %, après une phase critique ;
 * - `ended` : l'épisode se clôt sans recharge (branchement hors critique, retour > 35 %).
 */
export const BATTERY_ANNOUNCEMENT_KINDS = [
  'low',
  'threshold',
  'critical',
  'critical-drop',
  'probably-off',
  'charging',
  'back-on',
  'recharged',
  'ended',
] as const;
export type BatteryAnnouncementKind = (typeof BATTERY_ANNOUNCEMENT_KINDS)[number];

/** Comment une annonce atteint UN lecteur : SyncPill (socket), push dédié, ou rien. */
export const BATTERY_READER_CHANNELS = ['socket', 'push', 'none'] as const;
export type BatteryReaderChannel = (typeof BATTERY_READER_CHANNELS)[number];

export type BatteryConfig = {
  /** Premier relevé à ce niveau ou dessous, non branché : l'épisode s'ouvre. */
  readonly lowThreshold: number;
  /** Les paliers annoncés une seule fois par épisode, sous le seuil. */
  readonly steps: readonly number[];
  /** À ce niveau ou dessous : critique, chaque point perdu est annoncé. */
  readonly criticalThreshold: number;
  /** Hystérésis : l'épisode ne se clôt qu'au-DESSUS de ce niveau (ou au branchement). */
  readonly closeAbove: number;
  /** Débranché au-dessus de ce niveau après une phase critique : rechargé. */
  readonly rechargedUnpluggedAbove: number;
  /** Ce niveau, branché après une phase critique : rechargé. */
  readonly fullLevel: number;
  /** En critique, sans relevé ni connexion depuis ce délai : probablement éteint. */
  readonly offAfterMinutes: number;
  /** Un épisode rouvert avant ce délai reprend où le précédent s'était arrêté. */
  readonly resumeWithinMinutes: number;
  /** Un message échangé dans ce délai met le lecteur « en conversation ». */
  readonly conversationWindowMinutes: number;
  /** Un relevé à la demande au plus toutes les N minutes, par paire. */
  readonly pullCooldownMinutes: number;
  /** Durée de vie de l'état en Redis : aucun historique au-delà. */
  readonly stateTtlSeconds: number;
};

export const BATTERY_CONFIG: BatteryConfig = {
  lowThreshold: 30,
  steps: [25, 20, 15, 10],
  criticalThreshold: 5,
  closeAbove: 35,
  rechargedUnpluggedAbove: 80,
  fullLevel: 100,
  offAfterMinutes: 10,
  resumeWithinMinutes: 30,
  conversationWindowMinutes: 15,
  pullCooldownMinutes: 5,
  stateTtlSeconds: 86_400,
};

export const BATTERY_DEVICE_LABEL_MAX = 60;

export const BATTERY_ERROR_CODES = {
  /** Charge illisible (niveau hors 0..100, date invalide, champ en trop). */
  INVALID: 'BATTERY_INVALID',
  /** Trop de relevés : un relevé par changement, pas un flux. */
  RATE_LIMITED: 'BATTERY_RATE_LIMITED',
  /** Le serveur ne peut pas ranger l'état : rien ne part. */
  UNAVAILABLE: 'BATTERY_UNAVAILABLE',
  /** La loi refuse le relevé à la demande (sous Sang, consentement retiré, bloqué, soi). */
  PULL_FORBIDDEN: 'BATTERY_PULL_FORBIDDEN',
  /** Un relevé à la demande a déjà été demandé pour cette paire il y a moins de 5 min. */
  PULL_TOO_SOON: 'BATTERY_PULL_TOO_SOON',
} as const;
export type BatteryErrorCode = (typeof BATTERY_ERROR_CODES)[keyof typeof BATTERY_ERROR_CODES];
