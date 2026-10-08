/**
 * LA FENÊTRE DE PRÉCHARGEMENT DES RÉELS (#9702) — PURE, et jumelle de
 * `ReelPreloadWindow.swift` (iOS) : toute évolution touche les deux.
 *
 * Elle répond à deux questions, depuis l'USAGE observé et jamais depuis un
 * réglage : jusqu'où préparer devant et derrière le réel regardé, et jusqu'où
 * préparer chacun.
 *
 * - **Le plancher est N−2…N+2, toujours** (directive porteur 2026-10-08).
 *   Aucune contrainte ne le baisse : sous la contrainte, c'est l'AMORCE
 *   (`primeBytesOf`) qui maigrit, jamais la fenêtre.
 * - **Devant, la cadence élargit** : la MÉDIANE du temps passé par réel (un
 *   arrêt long isolé ne referme pas la fenêtre d'un balayeur) donne le nombre
 *   de réels qu'un lecteur traverse avant que le réseau ne les ait servis.
 * - **Derrière, les retours en arrière élargissent** : un lecteur qui ne
 *   revient jamais n'a besoin que du plancher.
 * - **La contrainte plafonne** : données économisées, 2G ou batterie faible
 *   rendent le plancher ; 3G ou peu de mémoire plafonnent à quatre.
 *
 * Les PALIERS (`preloadTierOf`) suivent la rareté de la ressource : un
 * décodeur matériel est cher et borné (N±1 seulement le tient), un élément
 * monté coûte peu (N±2), des octets de tête ne coûtent que du réseau.
 */
export const PRELOAD_MIN_RADIUS = 2;
export const PRELOAD_MAX_RADIUS = 10;

const HISTORY_LENGTH = 12;
/** Un réel traversé d'un trait par le défilement n'a pas été « regardé ». */
const TRAVERSAL_MS = 150;
const CONSTRAINED_RADIUS = 4;
const LOW_MEMORY_GB = 2;

export type VisitDirection = 'forward' | 'backward';

export type ReelVisit = { readonly dwellMs: number; readonly direction: VisitDirection };

export type EffectiveConnectionType = 'slow-2g' | '2g' | '3g' | '4g';

export type PreloadNetwork = { readonly effectiveType?: EffectiveConnectionType; readonly saveData?: boolean };

export type PreloadContext = {
  readonly visits: readonly ReelVisit[];
  readonly network: PreloadNetwork;
  readonly deviceMemoryGb?: number;
  readonly lowPower?: boolean;
};

export type PreloadWindow = { readonly ahead: number; readonly behind: number };

export type PreloadTier = 'play' | 'decode' | 'mount' | 'prime' | 'idle';

const clampRadius = (radius: number, cap: number): number => Math.max(PRELOAD_MIN_RADIUS, Math.min(cap, PRELOAD_MAX_RADIUS, radius));

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** Le rayon que la cadence réclame : 10 s par réel ou plus ⇒ le plancher,
 * moins d'une seconde ⇒ le plafond, et entre les deux une pente continue. */
function cadenceRadius(visits: readonly ReelVisit[]): number {
  if (visits.length === 0) return PRELOAD_MIN_RADIUS;
  const dwell = median(visits.map((v) => v.dwellMs));
  if (dwell <= 1_000) return PRELOAD_MAX_RADIUS;
  if (dwell >= 10_000) return PRELOAD_MIN_RADIUS;
  return Math.round(PRELOAD_MIN_RADIUS + ((10_000 - dwell) / 9_000) * (PRELOAD_MAX_RADIUS - PRELOAD_MIN_RADIUS));
}

function constraintCap(context: PreloadContext): number {
  const { network, deviceMemoryGb, lowPower } = context;
  if (lowPower === true || network.saveData === true) return PRELOAD_MIN_RADIUS;
  if (network.effectiveType === 'slow-2g' || network.effectiveType === '2g') return PRELOAD_MIN_RADIUS;
  if (network.effectiveType === '3g') return CONSTRAINED_RADIUS;
  if (deviceMemoryGb !== undefined && deviceMemoryGb <= LOW_MEMORY_GB) return CONSTRAINED_RADIUS;
  return PRELOAD_MAX_RADIUS;
}

export function preloadWindowOf(context: PreloadContext): PreloadWindow {
  const cap = constraintCap(context);
  const ahead = clampRadius(cadenceRadius(context.visits), cap);
  const backward = context.visits.filter((v) => v.direction === 'backward').length;
  const returning = context.visits.length > 0 && backward * 3 >= context.visits.length;
  return { ahead, behind: returning ? ahead : PRELOAD_MIN_RADIUS };
}

/** `offset` = index du réel − index du réel regardé (négatif : derrière). */
export function preloadTierOf(offset: number, window: PreloadWindow): PreloadTier {
  const distance = Math.abs(offset);
  if (distance === 0) return 'play';
  if (distance > (offset > 0 ? window.ahead : window.behind)) return 'idle';
  if (distance === 1) return 'decode';
  return distance === 2 ? 'mount' : 'prime';
}

const MOUNT_PRIME_BYTES = 1_536 * 1_024;
const NEAR_PRIME_BYTES = 768 * 1_024;
const FAR_PRIME_BYTES = 256 * 1_024;

/**
 * Les octets de TÊTE à amorcer — de quoi tenir l'atome `moov` et les
 * premières secondes d'un MP4 en démarrage rapide. Le réel monté (N±2) en
 * prend le plus, le premier amorcé un peu moins, les lointains de quoi
 * démarrer. Un réel qui joue ou décode se charge par son propre élément.
 */
export function primeBytesOf(params: { readonly tier: PreloadTier; readonly distance: number; readonly network: PreloadNetwork }): number {
  const { tier, distance, network } = params;
  if (tier !== 'mount' && tier !== 'prime') return 0;
  const base = tier === 'mount' ? MOUNT_PRIME_BYTES : distance <= 3 ? NEAR_PRIME_BYTES : FAR_PRIME_BYTES;
  const constrained = network.saveData === true || network.effectiveType === 'slow-2g' || network.effectiveType === '2g';
  return constrained ? Math.round(base / 4) : base;
}

export function recordVisit(history: readonly ReelVisit[], visit: ReelVisit): readonly ReelVisit[] {
  if (visit.dwellMs < TRAVERSAL_MS) return history;
  return [...history, visit].slice(-HISTORY_LENGTH);
}
