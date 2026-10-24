/**
 * Les OPÉRATIONS SERVEUR de l'administration (#10384–#10387) : les métriques de
 * l'hôte vues en direct, et les deux gestes qu'un BIGBOSS peut déclencher sur
 * la machine (sauvegarde, purge des images Docker).
 *
 * La passerelle ne parle JAMAIS au démon Docker ni à systemd : elle dépose une
 * DEMANDE (`opsRequestFileSchema`, un fichier de moins d'1 Ko) dans un dossier
 * monté, et un runner de l'hôte (`infrastructure/scripts/ops-runner/`) la
 * valide, l'exécute et publie son état (`serverOperationStateFileSchema`,
 * `dockerUsageSchema`) dans un dossier monté en lecture seule. Le conteneur
 * n'obtient ainsi aucun pouvoir sur l'hôte au-delà d'une liste blanche fixe.
 *
 * @module @meeshy/shared/types/admin-ops
 */

import { z } from 'zod';

export const HOST_METRICS_SAMPLE_INTERVAL_MS = 5000;
export const HOST_METRICS_BUFFER_SIZE = 720;

const byteCount = z.number().int().nonnegative();
const isoInstant = z.iso.datetime();
/** Le demandeur, borné à l'identique du runner (`validate`, 1 à 128 caractères) : les deux validateurs du relais disent la même chose (#10459). */
export const OPS_REQUESTED_BY_MAX_LENGTH = 128;
const requestedBy = z.string().min(1).max(OPS_REQUESTED_BY_MAX_LENGTH);

export const OPS_ENVIRONMENTS = ['staging', 'production', 'local'] as const;
export const opsEnvironmentSchema = z.enum(OPS_ENVIRONMENTS);

export const hostMetricsSampleSchema = z.object({
  at: isoInstant,
  cpu: z.object({
    usedPercent: z.number().min(0).max(100),
    cores: z.number().int().positive(),
    load1: z.number().nonnegative(),
    load5: z.number().nonnegative(),
    load15: z.number().nonnegative(),
  }),
  memory: z.object({
    totalBytes: byteCount,
    availableBytes: byteCount,
    usedBytes: byteCount,
  }),
  swap: z.object({
    totalBytes: byteCount,
    usedBytes: byteCount,
  }),
  disk: z.object({
    mount: z.string(),
    totalBytes: byteCount,
    freeBytes: byteCount,
    usedBytes: byteCount,
  }),
});

export const hostGpuSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('absent'),
    reason: z.enum(['no-compute-gpu', 'not-visible-from-container']),
  }),
  z.object({
    kind: z.literal('present'),
    name: z.string(),
    usedPercent: z.number().min(0).max(100).nullable(),
    memoryUsedBytes: byteCount.nullable(),
    memoryTotalBytes: byteCount.nullable(),
  }),
]);

export const dockerUsageSchema = z.object({
  measuredAt: isoInstant,
  images: z.object({
    count: byteCount,
    activeCount: byteCount,
    totalBytes: byteCount,
    reclaimableBytes: byteCount,
  }),
  buildCache: z.object({
    totalBytes: byteCount,
    reclaimableBytes: byteCount,
  }),
  volumes: z.object({
    count: byteCount,
    totalBytes: byteCount,
    reclaimableBytes: byteCount,
  }),
});

export const hostMetricsSnapshotSchema = z.object({
  source: z.enum(['host-proc', 'container-cgroup']),
  hostname: z.string(),
  sharedHost: z.boolean(),
  environment: opsEnvironmentSchema,
  intervalMs: z.number().int().positive(),
  gpu: hostGpuSchema,
  samples: z.array(hostMetricsSampleSchema).max(HOST_METRICS_BUFFER_SIZE),
  docker: dockerUsageSchema.nullable(),
});

export const hostMetricsQuerySchema = z
  .object({ since: isoInstant.optional() })
  .strict();

export const SERVER_OPERATIONS = ['backup', 'image-prune'] as const;
export const serverOperationSchema = z.enum(SERVER_OPERATIONS);

export const SERVER_OPERATION_COOLDOWN_MS: Readonly<Record<(typeof SERVER_OPERATIONS)[number], number>> = {
  backup: 21_600_000,
  'image-prune': 3_600_000,
};

/**
 * LA FENÊTRE D'UNE OPÉRATION (#11452, tranché par le porteur le 2026-10-24) : le
 * nettoyage ne part qu'aux heures creuses de l'hôte partagé, de 02:00 inclus à 06:00
 * exclu, heure de Paris ; la sauvegarde n'a pas de fenêtre. L'heure locale se lit par
 * `Intl.DateTimeFormat` dans le fuseau NOMMÉ, jamais par un décalage fixe : la fenêtre
 * reste juste aux deux changements d'heure (dernier dimanche de mars, dernier dimanche
 * d'octobre). Le runner de l'hôte tient la même fenêtre (`WINDOWS`,
 * `infrastructure/scripts/ops-runner/meeshy-ops-runner.py`) et fait foi.
 */
export type ServerOperationWindow = {
  readonly timeZone: 'Europe/Paris';
  readonly startHour: number;
  readonly endHour: number;
};

export const SERVER_OPERATION_WINDOWS: Readonly<Record<(typeof SERVER_OPERATIONS)[number], ServerOperationWindow | null>> = {
  backup: null,
  'image-prune': { timeZone: 'Europe/Paris', startHour: 2, endHour: 6 },
};

type LocalClock = { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number };

const clockFormats = new Map<string, Intl.DateTimeFormat>();

const localClockOf = (timeZone: string, at: number): LocalClock => {
  const format =
    clockFormats.get(timeZone) ??
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  clockFormats.set(timeZone, format);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(format.formatToParts(at).find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day'), hour: part('hour'), minute: part('minute') };
};

/** Le décalage du fuseau à l'instant `at`, en millisecondes (Paris : +1 h l'hiver, +2 h l'été). */
const offsetAt = (timeZone: string, at: number): number => {
  const clock = localClockOf(timeZone, at);
  return Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute) - Math.floor(at / 60_000) * 60_000;
};

/**
 * Le premier instant du jour local `day` où l'horloge du fuseau marque `hour` ou plus.
 * Deux candidats, un par décalage du jour : un jour de changement d'heure en a deux. En
 * octobre, 02:00 se vit deux fois et la fenêtre s'ouvre à la première ; en mars, 02:00
 * n'existe pas et elle s'ouvre à 03:00 d'été, le même instant que 02:00 d'hiver.
 */
const firstInstantAtHour = (timeZone: string, day: { readonly year: number; readonly month: number; readonly day: number }, hour: number): number => {
  const wall = Date.UTC(day.year, day.month - 1, day.day, hour);
  const offsets = [offsetAt(timeZone, wall - 12 * 3_600_000), offsetAt(timeZone, wall + 12 * 3_600_000)];
  const reached = offsets
    .map((offset) => wall - offset)
    .filter((candidate) => {
      const clock = localClockOf(timeZone, candidate);
      return clock.year === day.year && clock.month === day.month && clock.day === day.day && clock.hour >= hour;
    });
  return Math.min(...reached);
};

export type ServerOperationWindowState = {
  /** L'instant tombe dans la fenêtre. */
  readonly open: boolean;
  /** La prochaine ouverture APRÈS l'instant, en ISO UTC (fenêtre ouverte : celle du lendemain). */
  readonly nextOpeningAt: string;
};

/** Pure : la fenêtre est-elle ouverte à `at`, et quand s'ouvre-t-elle ensuite ? */
export function serverOperationWindowAt(window: ServerOperationWindow, at: Date): ServerOperationWindowState {
  const clock = localClockOf(window.timeZone, at.getTime());
  const open = clock.hour >= window.startHour && clock.hour < window.endHour;
  const shift = clock.hour < window.startHour ? 0 : 1;
  const next = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + shift));
  const day = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  return { open, nextOpeningAt: new Date(firstInstantAtHour(window.timeZone, day, window.startHour)).toISOString() };
}

/**
 * Le premier instant, à partir de `now`, où l'opération est permise : le délai depuis le
 * dernier passage accepté écoulé ET la fenêtre ouverte. `null` : permise maintenant. Une
 * ouverture qui tombe PENDANT le délai ne compte pas : on part de la fin du délai, et si la
 * fenêtre est fermée à cet instant, c'est l'ouverture suivante qui répond.
 */
export function serverOperationAvailableAt({
  operation,
  lastAcceptedAt,
  now,
}: {
  readonly operation: (typeof SERVER_OPERATIONS)[number];
  readonly lastAcceptedAt: string | null | undefined;
  readonly now: Date;
}): string | null {
  const cooldownEnd = lastAcceptedAt ? Date.parse(lastAcceptedAt) + SERVER_OPERATION_COOLDOWN_MS[operation] : Number.NEGATIVE_INFINITY;
  const from = Math.max(now.getTime(), cooldownEnd);
  const window = SERVER_OPERATION_WINDOWS[operation];
  const state = window ? serverOperationWindowAt(window, new Date(from)) : null;
  const allowed = state === null || state.open ? from : Date.parse(state.nextOpeningAt);
  return allowed > now.getTime() ? new Date(allowed).toISOString() : null;
}

export const serverOperationRequestBodySchema = z
  .object({
    confirm: serverOperationSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const SERVER_OPERATION_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'rejected',
  'throttled',
] as const;
export const serverOperationRunStatusSchema = z.enum(SERVER_OPERATION_STATUSES);

export const serverOperationRunSchema = z.object({
  requestId: z.uuid(),
  operation: serverOperationSchema,
  status: serverOperationRunStatusSchema,
  requestedBy,
  requestedAt: isoInstant,
  startedAt: isoInstant.nullable(),
  finishedAt: isoInstant.nullable(),
  reclaimedBytes: byteCount.nullable(),
  code: z.string().max(64).nullable(),
});

const runsByOperation = z.record(serverOperationSchema, serverOperationRunSchema.nullable());
const instantByOperation = z.record(serverOperationSchema, isoInstant.nullable());

/** La fenêtre exposée (#11452) : l'écran la dit en mots sans la recopier ; `open` à l'instant servi. */
export const serverOperationWindowViewSchema = z.object({
  timeZone: z.literal('Europe/Paris'),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
  open: z.boolean(),
});

export const serverOperationStatusSchema = z.object({
  environment: opsEnvironmentSchema,
  relayInstalled: z.boolean(),
  runs: runsByOperation,
  /** La fin du délai ET de la fenêtre, le plus tardif (#11452). */
  availableAt: instantByOperation,
  windows: z.record(serverOperationSchema, serverOperationWindowViewSchema.nullable()),
});

export const OPS_REQUEST_FILE_MAX_BYTES = 1024;

export const opsRequestFileSchema = z
  .object({
    v: z.literal(1),
    id: z.uuid(),
    action: serverOperationSchema,
    environment: opsEnvironmentSchema,
    requestedBy,
    requestedAt: isoInstant,
  })
  .strict();

export const serverOperationStateFileSchema = z.object({
  v: z.literal(1),
  runs: runsByOperation,
  lastAcceptedAt: instantByOperation,
});

export const serverOperationAcceptedSchema = z.object({
  requestId: z.uuid(),
  operation: serverOperationSchema,
  status: z.literal('queued'),
  queuedAt: isoInstant,
});

export const SERVER_OPERATION_ERROR_CODES = [
  'VALIDATION_ERROR',
  'CONFIRMATION_MISMATCH',
  'FORBIDDEN',
  'UNKNOWN_OPERATION',
  'OPERATION_COOLDOWN',
  'OPERATION_OUTSIDE_WINDOW',
  'OPERATION_IN_PROGRESS',
  'OPS_RELAY_UNAVAILABLE',
  'AUDIT_UNAVAILABLE',
] as const;
export type ServerOperationErrorCode = (typeof SERVER_OPERATION_ERROR_CODES)[number];

export const ADMIN_HOST_METRICS_ROOM = 'admin:host-metrics';

export type HostMetricsSample = z.infer<typeof hostMetricsSampleSchema>;
export type HostMetricsSnapshot = z.infer<typeof hostMetricsSnapshotSchema>;
export type HostGpu = z.infer<typeof hostGpuSchema>;
export type DockerUsage = z.infer<typeof dockerUsageSchema>;
export type OpsEnvironment = z.infer<typeof opsEnvironmentSchema>;
export type ServerOperation = z.infer<typeof serverOperationSchema>;
export type ServerOperationRunStatus = z.infer<typeof serverOperationRunStatusSchema>;
export type ServerOperationRun = z.infer<typeof serverOperationRunSchema>;
export type ServerOperationStatus = z.infer<typeof serverOperationStatusSchema>;
export type ServerOperationWindowView = z.infer<typeof serverOperationWindowViewSchema>;
export type ServerOperationRequestBody = z.infer<typeof serverOperationRequestBodySchema>;
export type ServerOperationAccepted = z.infer<typeof serverOperationAcceptedSchema>;
export type OpsRequestFile = z.infer<typeof opsRequestFileSchema>;
export type ServerOperationStateFile = z.infer<typeof serverOperationStateFileSchema>;

export type AdminMetricsSubscribeAck =
  | { readonly ok: true; readonly snapshot: HostMetricsSnapshot }
  | { readonly ok: false; readonly code: 'FORBIDDEN' | 'RATE_LIMITED' };
