/**
 * LE TEMPS DES EFFETS (#9381) — fonctions PURES : ni horloge, ni canvas, ni
 * événement. Le moteur (`effect-runner.ts`) leur passe le temps ÉCOULÉ visible
 * et peint ce qu'elles rendent ; ce qui s'y teste, c'est le rythme.
 */

/** Trois passages de 3,6 s, comme le repli CSS (`@keyframes gameSheen`) : le trait attend 55 % du passage, puis balaie. */
export const SHEEN_PASSES = 3;
export const SHEEN_PASS_MS = 3600;
const SHEEN_REST = 0.55;
/** Où le trait commence à balayer dans un passage : le reflet « immédiat » (le passage d'un niveau) part d'ici et saute le repos. */
export const SHEEN_SWEEP_START_MS = SHEEN_PASS_MS * SHEEN_REST;

/** L'onde de frappe : une fois, 0,9 s, comme le repli CSS. */
export const SHOCKWAVE_MS = 900;

/** Une dérive d'irisation sans capteur : quatre secondes par aller-retour, trois fois. */
export const DRIFT_PERIOD_MS = 4000;
const DRIFT_CYCLES = 3;

const elapsed = (ms: number): number => (Number.isFinite(ms) && ms > 0 ? ms : 0);
const unit = (value: number): number => Math.min(1, Math.max(-1, value)) + 0;

export type SheenState = { readonly progress: number; readonly pass: number; readonly done: boolean };

export const sheenState = (elapsedMs: number, passes: number = SHEEN_PASSES): SheenState => {
  const t = elapsed(elapsedMs);
  if (t >= passes * SHEEN_PASS_MS) return { progress: 0, pass: passes, done: true };
  const phase = (t % SHEEN_PASS_MS) / SHEEN_PASS_MS;
  return { progress: phase < SHEEN_REST ? 0 : (phase - SHEEN_REST) / (1 - SHEEN_REST), pass: Math.floor(t / SHEEN_PASS_MS), done: false };
};

export type ShockwaveState = { readonly progress: number; readonly done: boolean };

export const shockwaveState = (elapsedMs: number): ShockwaveState => {
  const progress = Math.min(1, elapsed(elapsedMs) / SHOCKWAVE_MS);
  return { progress, done: progress >= 1 };
};

export type Tilt = readonly [x: number, y: number];

/**
 * `DeviceOrientationEvent` → inclinaison [-1, 1] sur chaque axe. Un téléphone
 * tenu en main est à ~45° d'inclinaison avant-arrière (`beta`) : c'est le
 * centre. ±45° d'écart donne la pleine course. Un capteur muet (`null`, `NaN`)
 * est le centre, jamais une erreur.
 */
export const tiltFromOrientation = ({ beta, gamma }: { readonly beta: number | null; readonly gamma: number | null }): Tilt => [
  gamma !== null && Number.isFinite(gamma) ? unit(gamma / 45) : 0,
  beta !== null && Number.isFinite(beta) ? unit((beta - 45) / 45) : 0,
];

export const driftTilt = (elapsedMs: number): { readonly tilt: Tilt; readonly done: boolean } => {
  const t = elapsed(elapsedMs);
  if (t >= DRIFT_PERIOD_MS * DRIFT_CYCLES) return { tilt: [0, 0], done: true };
  const angle = (t / DRIFT_PERIOD_MS) * Math.PI * 2;
  return { tilt: [Math.sin(angle), Math.cos(angle) * 0.6], done: false };
};
