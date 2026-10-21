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
  requestedBy: z.string(),
  requestedAt: isoInstant,
  startedAt: isoInstant.nullable(),
  finishedAt: isoInstant.nullable(),
  reclaimedBytes: byteCount.nullable(),
  code: z.string().max(64).nullable(),
});

const runsByOperation = z.record(serverOperationSchema, serverOperationRunSchema.nullable());
const instantByOperation = z.record(serverOperationSchema, isoInstant.nullable());

export const serverOperationStatusSchema = z.object({
  environment: opsEnvironmentSchema,
  relayInstalled: z.boolean(),
  runs: runsByOperation,
  availableAt: instantByOperation,
});

export const OPS_REQUEST_FILE_MAX_BYTES = 1024;

export const opsRequestFileSchema = z
  .object({
    v: z.literal(1),
    id: z.uuid(),
    action: serverOperationSchema,
    environment: opsEnvironmentSchema,
    requestedBy: z.string(),
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
export type ServerOperationRequestBody = z.infer<typeof serverOperationRequestBodySchema>;
export type ServerOperationAccepted = z.infer<typeof serverOperationAcceptedSchema>;
export type OpsRequestFile = z.infer<typeof opsRequestFileSchema>;
export type ServerOperationStateFile = z.infer<typeof serverOperationStateFileSchema>;

export type AdminMetricsSubscribeAck =
  | { readonly ok: true; readonly snapshot: HostMetricsSnapshot }
  | { readonly ok: false; readonly code: 'FORBIDDEN' };
