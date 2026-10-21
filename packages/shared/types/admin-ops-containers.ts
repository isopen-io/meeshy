/**
 * LES CONTENEURS DOCKER DE L'ENVIRONNEMENT, vus depuis l'administration (#11441).
 *
 * Même frontière que `admin-ops.ts` : la passerelle ne parle jamais au démon. Le
 * runner de l'hôte (`infrastructure/scripts/ops-runner/`) lit `docker inspect` et
 * `docker stats` pour les SEULS conteneurs du projet compose de son environnement,
 * et publie `state/containers.json` dans le dossier monté en lecture seule.
 *
 * Ce contrat dit ce qui traverse, et RIEN D'AUTRE : ni variables d'environnement,
 * ni labels, ni commande, ni montages — ils portent des secrets. Un champ inconnu
 * du fichier est retiré par le schéma (objet Zod non strict ⇒ clés retirées), et
 * le runner, lui, ne les écrit jamais.
 *
 * @module @meeshy/shared/types/admin-ops-containers
 */

import { z } from 'zod';

import { opsEnvironmentSchema } from './admin-ops.js';

const byteCount = z.number().int().nonnegative();
const isoInstant = z.iso.datetime();

export const OPS_CONTAINERS_MAX = 64;
/** Le plafond de lecture de `state/containers.json` : 64 conteneurs bien remplis tiennent sous 64 Ko. */
export const OPS_CONTAINERS_FILE_MAX_BYTES = 256 * 1024;

export const CONTAINER_STATES = ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'] as const;
export const CONTAINER_HEALTHS = ['healthy', 'unhealthy', 'starting', 'none'] as const;

export const opsContainerStatsSchema = z.object({
  /** En pourcentage d'UN cœur, comme `docker stats` : un conteneur sur huit cœurs peut dépasser 100. */
  cpuPercent: z.number().min(0),
  memoryUsedBytes: byteCount,
  /** `null` quand le conteneur n'a pas de limite propre (il voit la mémoire de l'hôte). */
  memoryLimitBytes: byteCount.nullable(),
  netRxBytes: byteCount,
  netTxBytes: byteCount,
  blockReadBytes: byteCount,
  blockWriteBytes: byteCount,
  pids: byteCount,
});

export const opsContainerNetworkSchema = z.object({
  name: z.string().min(1).max(128),
  /** Vide quand le conteneur n'a pas d'adresse sur ce réseau (arrêté). */
  ipAddress: z.string().max(64),
});

export const opsContainerPortSchema = z.object({
  containerPort: z.number().int().min(1).max(65535),
  protocol: z.enum(['tcp', 'udp', 'sctp']),
  /** `null` : le port est exposé au réseau Docker, pas publié sur l'hôte. */
  hostIp: z.string().max(64).nullable(),
  hostPort: z.number().int().min(1).max(65535).nullable(),
});

export const opsContainerSchema = z.object({
  name: z.string().min(1).max(128),
  /** Le service compose (`com.docker.compose.service`), `null` hors compose. */
  service: z.string().min(1).max(128).nullable(),
  image: z.string().min(1).max(256),
  /** Les douze premiers caractères de l'empreinte de l'image, ou `null` si l'image n'est plus inspectable. */
  imageId: z.string().regex(/^[0-9a-f]{12}$/).nullable(),
  imageCreatedAt: isoInstant.nullable(),
  state: z.enum(CONTAINER_STATES),
  health: z.enum(CONTAINER_HEALTHS),
  startedAt: isoInstant.nullable(),
  finishedAt: isoInstant.nullable(),
  restartCount: byteCount,
  exitCode: z.number().int().nullable(),
  /** `null` pour un conteneur qui ne tourne pas : il n'a pas de consommation. */
  stats: opsContainerStatsSchema.nullable(),
  networks: z.array(opsContainerNetworkSchema).max(16),
  ports: z.array(opsContainerPortSchema).max(32),
});

export const opsContainersFileSchema = z.object({
  measuredAt: isoInstant,
  containers: z.array(opsContainerSchema).max(OPS_CONTAINERS_MAX),
});

/** Ce que sert `GET /admin/ops/containers` : sans publication du runner, `measuredAt` est null et la liste vide. */
export const opsContainersViewSchema = z.object({
  environment: opsEnvironmentSchema,
  measuredAt: isoInstant.nullable(),
  containers: z.array(opsContainerSchema).max(OPS_CONTAINERS_MAX),
});

export type OpsContainerStats = z.infer<typeof opsContainerStatsSchema>;
export type OpsContainerNetwork = z.infer<typeof opsContainerNetworkSchema>;
export type OpsContainerPort = z.infer<typeof opsContainerPortSchema>;
export type OpsContainer = z.infer<typeof opsContainerSchema>;
export type OpsContainersFile = z.infer<typeof opsContainersFileSchema>;
export type OpsContainersView = z.infer<typeof opsContainersViewSchema>;
export type ContainerState = (typeof CONTAINER_STATES)[number];
export type ContainerHealth = (typeof CONTAINER_HEALTHS)[number];
