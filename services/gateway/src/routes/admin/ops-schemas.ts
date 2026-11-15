/**
 * Les schémas de RÉPONSE des opérations serveur (#10384–#10386), écrits contre
 * leurs producteurs : `HostMetricsSnapshot`, `ServerOperationStatus` et
 * `ServerOperationAccepted` (`@meeshy/shared/types/admin-ops`). Chaque objet
 * nomme ses `properties` : sous fast-json-stringify, un champ non déclaré est
 * supprimé, et un objet nu sort `{}`.
 */
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { backupsSchema } from './monitoring';
import { booleen, chaine, chaineNulle, dateNulle, dateServie, nombre, nombreNul } from './oversight-schemas';

const sampleSchema = {
  type: 'object',
  properties: {
    at: dateServie,
    cpu: {
      type: 'object',
      properties: { usedPercent: nombre, cores: nombre, load1: nombre, load5: nombre, load15: nombre },
    },
    memory: { type: 'object', properties: { totalBytes: nombre, availableBytes: nombre, usedBytes: nombre } },
    swap: { type: 'object', properties: { totalBytes: nombre, usedBytes: nombre } },
    disk: { type: 'object', properties: { mount: chaine, totalBytes: nombre, freeBytes: nombre, usedBytes: nombre } },
  },
} as const;

const gpuSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['absent', 'present'] },
    reason: { type: 'string', enum: ['no-compute-gpu', 'not-visible-from-container'] },
    name: chaine,
    usedPercent: nombreNul,
    memoryUsedBytes: nombreNul,
    memoryTotalBytes: nombreNul,
  },
} as const;

const dockerSchema = {
  type: 'object',
  nullable: true,
  properties: {
    measuredAt: dateServie,
    images: { type: 'object', properties: { count: nombre, activeCount: nombre, totalBytes: nombre, reclaimableBytes: nombre } },
    buildCache: { type: 'object', properties: { totalBytes: nombre, reclaimableBytes: nombre } },
    volumes: { type: 'object', properties: { count: nombre, totalBytes: nombre, reclaimableBytes: nombre } },
  },
} as const;

export const hostMetricsSnapshotResponseSchema = {
  type: 'object',
  properties: {
    source: { type: 'string', enum: ['host-proc', 'container-cgroup'] },
    hostname: chaine,
    sharedHost: booleen,
    environment: { type: 'string', enum: ['staging', 'production', 'local'] },
    intervalMs: nombre,
    gpu: gpuSchema,
    samples: { type: 'array', items: sampleSchema },
    docker: dockerSchema,
  },
} as const;

const operationName = { type: 'string', enum: ['backup', 'image-prune'] } as const;

const runSchema = {
  type: 'object',
  nullable: true,
  properties: {
    requestId: chaine,
    operation: operationName,
    status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed', 'rejected', 'throttled'] },
    requestedBy: chaine,
    requestedAt: dateServie,
    startedAt: dateNulle,
    finishedAt: dateNulle,
    reclaimedBytes: nombreNul,
    code: chaineNulle,
  },
} as const;

/** La fenêtre horaire d'une opération (#11452), `null` pour celle qui n'en a pas (la sauvegarde). */
const windowSchema = {
  type: 'object',
  nullable: true,
  properties: { timeZone: chaine, startHour: nombre, endHour: nombre, open: booleen },
} as const;

export const serverOperationStatusResponseSchema = {
  type: 'object',
  properties: {
    environment: { type: 'string', enum: ['staging', 'production', 'local'] },
    relayInstalled: booleen,
    runs: { type: 'object', properties: { backup: runSchema, 'image-prune': runSchema } },
    availableAt: { type: 'object', properties: { backup: dateNulle, 'image-prune': dateNulle } },
    windows: { type: 'object', properties: { backup: windowSchema, 'image-prune': windowSchema } },
    backup: backupsSchema,
  },
} as const;

export const serverOperationAcceptedResponseSchema = {
  type: 'object',
  properties: {
    requestId: chaine,
    operation: operationName,
    status: { type: 'string', enum: ['queued'] },
    queuedAt: dateServie,
  },
} as const;

/** Le refus 409 porte `data.availableAt` quand c'est le délai ou la fenêtre (#11452) qui refuse. */
export const operationConflictResponseSchema = {
  type: 'object',
  properties: {
    ...errorResponseSchema.properties,
    data: { type: 'object', properties: { availableAt: dateServie } },
  },
} as const;

/** Un conteneur de l'environnement (#11441), écrit contre `opsContainerSchema` (`@meeshy/shared/types/admin-ops-containers`). */
const containerSchema = {
  type: 'object',
  properties: {
    name: chaine,
    service: chaineNulle,
    image: chaine,
    imageId: chaineNulle,
    imageCreatedAt: dateNulle,
    state: { type: 'string', enum: ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'] },
    health: { type: 'string', enum: ['healthy', 'unhealthy', 'starting', 'none'] },
    startedAt: dateNulle,
    finishedAt: dateNulle,
    restartCount: nombre,
    exitCode: nombreNul,
    stats: {
      type: 'object',
      nullable: true,
      properties: {
        cpuPercent: nombre,
        memoryUsedBytes: nombre,
        memoryLimitBytes: nombreNul,
        netRxBytes: nombre,
        netTxBytes: nombre,
        blockReadBytes: nombre,
        blockWriteBytes: nombre,
        pids: nombre,
      },
    },
    networks: { type: 'array', items: { type: 'object', properties: { name: chaine, ipAddress: chaine } } },
    ports: {
      type: 'array',
      items: { type: 'object', properties: { containerPort: nombre, protocol: chaine, hostIp: chaineNulle, hostPort: nombreNul } },
    },
  },
} as const;

export const containersViewResponseSchema = {
  type: 'object',
  properties: {
    environment: { type: 'string', enum: ['staging', 'production', 'local'] },
    measuredAt: dateNulle,
    containers: { type: 'array', items: containerSchema },
  },
} as const;
