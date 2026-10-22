/**
 * LE RELAIS DES OPÉRATIONS SERVEUR (#10385, #10386).
 *
 * La passerelle n'a aucun pouvoir sur l'hôte : ni socket Docker, ni systemd. Un
 * geste d'administration (sauvegarde, purge des images) devient une DEMANDE —
 * un fichier `<uuid>.json` de moins d'1 Ko, validé par `opsRequestFileSchema`,
 * écrit par renommage atomique dans `OPS_REQUESTS_DIR`. Le runner de l'hôte
 * (`infrastructure/scripts/ops-runner/`) la revalide, ne connaît qu'une liste
 * blanche fixe d'actions, et publie son état dans `OPS_STATE_DIR` (monté en
 * lecture seule) : `ops.json`, `docker.json` et `containers.json` (#11441).
 *
 * Les deux fichiers lus sont une FRONTIÈRE DE CONFIANCE : bornés en taille et
 * validés à chaque lecture. Absents, illisibles ou hors schéma, ils valent
 * `null` — jamais une erreur qui remonte.
 */
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, open, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  OPS_CONTAINERS_FILE_MAX_BYTES,
  opsContainersFileSchema,
  type OpsContainersView,
} from '@meeshy/shared/types/admin-ops-containers';
import {
  OPS_ENVIRONMENTS,
  OPS_REQUEST_FILE_MAX_BYTES,
  SERVER_OPERATIONS,
  SERVER_OPERATION_COOLDOWN_MS,
  dockerUsageSchema,
  opsRequestFileSchema,
  serverOperationStateFileSchema,
  type DockerUsage,
  type OpsEnvironment,
  type OpsRequestFile,
  type ServerOperation,
  type ServerOperationAccepted,
  type ServerOperationRun,
  type ServerOperationStateFile,
  type ServerOperationStatus,
} from '@meeshy/shared/types/admin-ops';

export type OpsEnv = Readonly<Record<string, string | undefined>>;

export type OpsSettings = {
  readonly environment: OpsEnvironment;
  readonly sharedHost: boolean;
  readonly requestsDir: string | null;
  readonly stateDir: string | null;
  readonly diskProbePath: string;
};

const MAX_STATE_BYTES = 64 * 1024;
/** Un passage `queued`/`running` plus vieux que ça est tenu pour abandonné : il ne bloque plus. */
const IN_PROGRESS_HORIZON_MS = 2 * 60 * 60 * 1000;

const trimmed = (value: string | undefined): string | null => {
  const text = value?.trim();
  return text ? text : null;
};

const isEnvironment = (value: string | null): value is OpsEnvironment =>
  value !== null && (OPS_ENVIRONMENTS as readonly string[]).includes(value);

export function readOpsSettings(env: OpsEnv): OpsSettings {
  const environment = trimmed(env.OPS_ENVIRONMENT);
  return {
    environment: isEnvironment(environment) ? environment : 'local',
    sharedHost: trimmed(env.OPS_SHARED_HOST) === 'true',
    requestsDir: trimmed(env.OPS_REQUESTS_DIR),
    stateDir: trimmed(env.OPS_STATE_DIR),
    diskProbePath: trimmed(env.HOST_DISK_PROBE_PATH) ?? '/',
  };
}

/**
 * Une lecture BORNÉE par les octets lus, jamais par un `stat` préalable (#10459) : entre
 * le `stat` et la lecture, un fichier peut grossir, et seul ce qu'on a effectivement lu
 * dit sa taille. `maxBytes + 1` octets demandés : un de plus que le plafond suffit à
 * refuser. Un chemin qui n'est pas un fichier ordinaire (dossier, FIFO, socket) vaut
 * `null` avant toute lecture.
 */
async function readBoundedJson(file: string, maxBytes: number): Promise<unknown> {
  try {
    const handle = await open(file, 'r');
    try {
      if (!(await handle.stat()).isFile()) return null;
      const buffer = Buffer.alloc(maxBytes + 1);
      let total = 0;
      while (total <= maxBytes) {
        const { bytesRead } = await handle.read(buffer, total, maxBytes + 1 - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
      }
      if (total > maxBytes) return null;
      return JSON.parse(buffer.subarray(0, total).toString('utf8'));
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

export async function readOpsState(stateDir: string | null): Promise<ServerOperationStateFile | null> {
  if (!stateDir) return null;
  const parsed = serverOperationStateFileSchema.safeParse(await readBoundedJson(path.join(stateDir, 'ops.json'), MAX_STATE_BYTES));
  return parsed.success ? parsed.data : null;
}

export async function readDockerUsage(stateDir: string | null): Promise<DockerUsage | null> {
  if (!stateDir) return null;
  const parsed = dockerUsageSchema.safeParse(await readBoundedJson(path.join(stateDir, 'docker.json'), MAX_STATE_BYTES));
  return parsed.success ? parsed.data : null;
}

/**
 * Les conteneurs de l'environnement (#11441) — la même frontière que `docker.json` :
 * bornée (256 Ko), validée, et `null` hors contrat. Un fichier dont UN conteneur sort
 * du schéma est rejeté en entier : le runner normalise chaque champ pour que cela
 * n'arrive pas, et une liste à moitié crue serait pire qu'une liste absente.
 */
export async function readContainers(stateDir: string | null): Promise<Omit<OpsContainersView, 'environment'> | null> {
  if (!stateDir) return null;
  const parsed = opsContainersFileSchema.safeParse(
    await readBoundedJson(path.join(stateDir, 'containers.json'), OPS_CONTAINERS_FILE_MAX_BYTES),
  );
  return parsed.success ? parsed.data : null;
}

const isRequestFileName = (name: string): boolean => /^[0-9a-f-]{36}\.json$/.test(name);

async function pendingRequests(requestsDir: string): Promise<readonly OpsRequestFile[]> {
  const names = await readdir(requestsDir).catch(() => [] as string[]);
  const parsed = await Promise.all(
    names.filter(isRequestFileName).map(async (name) => {
      const result = opsRequestFileSchema.safeParse(await readBoundedJson(path.join(requestsDir, name), OPS_REQUEST_FILE_MAX_BYTES));
      return result.success ? result.data : null;
    }),
  );
  return parsed.filter((request): request is OpsRequestFile => request !== null);
}

async function isWritableDirectory(dir: string | null): Promise<boolean> {
  if (!dir) return false;
  return access(dir, constants.W_OK | constants.X_OK).then(() => true, () => false);
}

const queuedRunOf = (request: OpsRequestFile): ServerOperationRun => ({
  requestId: request.id,
  operation: request.action,
  status: 'queued',
  requestedBy: request.requestedBy,
  requestedAt: request.requestedAt,
  startedAt: null,
  finishedAt: null,
  reclaimedBytes: null,
  code: null,
});

const availableAtOf = (
  state: ServerOperationStateFile | null,
  operation: ServerOperation,
  now: Date,
): string | null => {
  const last = state?.lastAcceptedAt[operation];
  if (!last) return null;
  const available = Date.parse(last) + SERVER_OPERATION_COOLDOWN_MS[operation];
  return available > now.getTime() ? new Date(available).toISOString() : null;
};

const isLiveRun = (run: ServerOperationRun | null | undefined, now: Date): boolean =>
  !!run &&
  (run.status === 'queued' || run.status === 'running') &&
  now.getTime() - Date.parse(run.requestedAt) < IN_PROGRESS_HORIZON_MS;

export type SubmitResult =
  | { readonly kind: 'queued'; readonly accepted: ServerOperationAccepted }
  | { readonly kind: 'refused'; readonly status: 503; readonly code: 'OPS_RELAY_UNAVAILABLE' }
  | { readonly kind: 'refused'; readonly status: 503; readonly code: 'AUDIT_UNAVAILABLE' }
  | { readonly kind: 'refused'; readonly status: 409; readonly code: 'OPERATION_IN_PROGRESS' }
  | { readonly kind: 'refused'; readonly status: 409; readonly code: 'OPERATION_COOLDOWN'; readonly availableAt: string };

export type OpsRelay = {
  readonly settings: OpsSettings;
  /**
   * `beforeDeposit` (#11441, #10459 point 3) — appelé une fois les délais et la file vérifiés,
   * JUSTE AVANT le dépôt, dans la section sérialisée : la trace d'une demande acceptée est
   * écrite AVANT qu'elle n'existe, et un `false` (journal indisponible) n'en dépose aucune.
   * Obligatoire : aucun appelant ne dépose sans trace.
   */
  readonly submit: (input: {
    readonly operation: ServerOperation;
    readonly requestedBy: string;
    readonly beforeDeposit: (requestId: string) => Promise<boolean>;
  }) => Promise<SubmitResult>;
  readonly status: () => Promise<ServerOperationStatus>;
  readonly containers: () => Promise<OpsContainersView>;
};

export type OpsRelayOptions = {
  readonly env: OpsEnv;
  readonly now: () => Date;
  readonly newId?: () => string;
};

export function createOpsRelay(options: OpsRelayOptions): OpsRelay {
  const settings = readOpsSettings(options.env);
  const newId = options.newId ?? randomUUID;
  let queue: Promise<unknown> = Promise.resolve();

  const serialized = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };

  const submitNow = async (
    operation: ServerOperation,
    requestedBy: string,
    beforeDeposit: (requestId: string) => Promise<boolean>,
  ): Promise<SubmitResult> => {
    const requestsDir = settings.requestsDir;
    if (!requestsDir || !(await isWritableDirectory(requestsDir))) {
      return { kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' };
    }
    const now = options.now();
    const state = await readOpsState(settings.stateDir);
    const availableAt = availableAtOf(state, operation, now);
    if (availableAt) return { kind: 'refused', status: 409, code: 'OPERATION_COOLDOWN', availableAt };

    const pending = await pendingRequests(requestsDir);
    if (isLiveRun(state?.runs[operation], now) || pending.some((request) => request.action === operation)) {
      return { kind: 'refused', status: 409, code: 'OPERATION_IN_PROGRESS' };
    }

    const request = opsRequestFileSchema.parse({
      v: 1,
      id: newId(),
      action: operation,
      environment: settings.environment,
      requestedBy,
      requestedAt: now.toISOString(),
    });
    const body = JSON.stringify(request);
    if (Buffer.byteLength(body) > OPS_REQUEST_FILE_MAX_BYTES) {
      return { kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' };
    }
    if (!(await beforeDeposit(request.id))) {
      return { kind: 'refused', status: 503, code: 'AUDIT_UNAVAILABLE' };
    }
    const temporary = path.join(requestsDir, `.${request.id}.json.tmp`);
    try {
      await writeFile(temporary, body, { mode: 0o600, flag: 'wx' });
      await rename(temporary, path.join(requestsDir, `${request.id}.json`));
    } catch {
      return { kind: 'refused', status: 503, code: 'OPS_RELAY_UNAVAILABLE' };
    }
    return {
      kind: 'queued',
      accepted: { requestId: request.id, operation, status: 'queued', queuedAt: request.requestedAt },
    };
  };

  const status = async (): Promise<ServerOperationStatus> => {
    const now = options.now();
    const [state, writable] = await Promise.all([readOpsState(settings.stateDir), isWritableDirectory(settings.requestsDir)]);
    const pending = settings.requestsDir ? await pendingRequests(settings.requestsDir) : [];
    const runOf = (operation: ServerOperation): ServerOperationRun | null => {
      const waiting = pending.find((request) => request.action === operation);
      return waiting ? queuedRunOf(waiting) : state?.runs[operation] ?? null;
    };
    const [backup, imagePrune] = SERVER_OPERATIONS;
    return {
      environment: settings.environment,
      relayInstalled: writable && state !== null,
      runs: { [backup]: runOf(backup), [imagePrune]: runOf(imagePrune) },
      availableAt: { [backup]: availableAtOf(state, backup, now), [imagePrune]: availableAtOf(state, imagePrune, now) },
    };
  };

  return {
    settings,
    submit: ({ operation, requestedBy, beforeDeposit }) => serialized(() => submitNow(operation, requestedBy, beforeDeposit)),
    status,
    containers: async () => {
      const published = await readContainers(settings.stateDir);
      return { environment: settings.environment, measuredAt: published?.measuredAt ?? null, containers: published?.containers ?? [] };
    },
  };
}
