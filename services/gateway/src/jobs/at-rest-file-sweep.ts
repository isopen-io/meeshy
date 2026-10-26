/**
 * #13100 — le BALAYAGE du scellement au repos, toutes les dix minutes :
 *
 * 1. les pièces des conversations `server` / `hybrid` des dernières 48 h
 *    restées en clair (scellement échoué à l'envoi, rendu différé dont
 *    l'événement de fin s'est perdu, verrou occupé) sont scellées ;
 * 2. les clairs remplacés depuis sept jours sont effacés dès qu'aucune ligne
 *    ne les désigne plus, et toute ligne retardataire est repointée sur le
 *    scellé (`finishPendingErasures`) ;
 * 3. les temporaires du scellement (`.at-rest-tmp/`, et les anciennes
 *    `translated/.track-*`) — du clair pour une piste ou une réouverture —
 *    laissés par un processus tué sont effacés après une heure.
 *
 * Les effacements en attente se traitent par lots de
 * `PENDING_ERASURE_CONCURRENCY`, au plus `PENDING_ERASURE_PER_PASS` par passage.
 *
 * Sans accès aux fichiers scellés configuré, rien ne tourne. Le point 1 ne
 * remonte JAMAIS avant l'activation de ce code sur l'instance (marqueur Redis
 * `at-rest:files:activated-at`, posé une fois) : les pièces d'avant relèvent
 * de la migration de rattrapage, jouée sur feu vert après sauvegarde — le
 * déploiement seul ne scelle rien d'ancien. Sans marqueur lisible, sans clé de
 * signature des adresses, ou scellement suspendu (`AT_REST_FILE_SEALING=off`),
 * le point 1 ne tourne pas.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';
import { AT_REST_TEMPORARY_DIR, atRestFileSealingEnabled, processAtRestFileAccess } from '../services/attachments/atRest/atRestFiles';
import { readerFileUrlSignerFromEnv } from '../services/attachments/readerFileSignature';
import { sealLockRedis } from '../services/attachments/atRest/atRestFileAccessFor';
import { clearSealingDeferred, sealingDeferredSince } from '../services/attachments/atRest/sealLock';
import { backfillAtRestAttachments } from '../services/attachments/atRest/atRestBackfill';
import { finishPendingErasures, type PendingErasureOutcome } from '../services/attachments/atRest/sealAttachmentFiles';
import { gatewaySealDeps } from '../services/messaging/sealMessageAttachments';

const logger = enhancedLogger.child({ module: 'AtRestFileSweep' });

export const AT_REST_SWEEP_EVERY_MS = 10 * 60 * 1000;
const RECENT_PIECES_MS = 48 * 60 * 60 * 1000;
const PENDING_ERASURE_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TRACK_MS = 60 * 60 * 1000;
export const PENDING_ERASURE_CONCURRENCY = 10;
export const PENDING_ERASURE_PER_PASS = 500;

export const AT_REST_ACTIVATED_AT_KEY = 'at-rest:files:activated-at';

type MarkerClient = {
  set(key: string, value: string, nx: 'NX'): Promise<unknown>;
  get(key: string): Promise<string | null>;
};

/** Pose une fois, puis relit, l'instant d'activation du scellement sur l'instance. */
export async function atRestActivation(client: MarkerClient | null, now: Date): Promise<Date | null> {
  if (!client) return null;
  try {
    await client.set(AT_REST_ACTIVATED_AT_KEY, String(now.getTime()), 'NX');
    const raw = await client.get(AT_REST_ACTIVATED_AT_KEY);
    const at = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(at) ? new Date(at) : null;
  } catch {
    return null;
  }
}

/** Depuis quand le balayage rattrape les pièces restées en clair — ou `null` : il ne rattrape rien. */
export function sweepSealingSince(input: {
  readonly activatedAt: Date | null;
  readonly now: Date;
  readonly signerReady: boolean;
  readonly sealingEnabled: boolean;
  /** Depuis quand un verrou injoignable a laissé des pièces en clair : le rattrapage remonte jusque-là, même au-delà de 48 h. */
  readonly deferredSince?: Date | null;
}): Date | null {
  if (!input.activatedAt || !input.signerReady || !input.sealingEnabled) return null;
  const window = Math.min(input.now.getTime() - RECENT_PIECES_MS, input.deferredSince?.getTime() ?? Number.POSITIVE_INFINITY);
  return new Date(Math.max(input.activatedAt.getTime(), window));
}

export async function sweepStaleTrackTemporaries(uploadRoot: string, now: number): Promise<number> {
  const [legacy, current] = await Promise.all([
    staleIn(path.join(uploadRoot, 'translated'), (name) => name.startsWith('.track-'), now),
    staleIn(path.join(uploadRoot, AT_REST_TEMPORARY_DIR), (name) => name.startsWith('.'), now),
  ]);
  return legacy + current;
}

/** Traite les identifiants par lots bornés, jamais tous à la fois. */
export async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<readonly R[]> {
  const batches = Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
  return batches.reduce<Promise<readonly R[]>>(
    async (done, batch) => [...(await done), ...(await Promise.all(batch.map(work)))],
    Promise.resolve([])
  );
}

async function staleIn(directory: string, isTemporary: (name: string) => boolean, now: number): Promise<number> {
  const names = await fs.readdir(directory).catch(() => [] as string[]);
  const stale = await Promise.all(
    names.filter(isTemporary).map(async (name) => {
      const absolute = path.join(directory, name);
      const stats = await fs.stat(absolute).catch(() => null);
      return stats && now - stats.mtimeMs > STALE_TRACK_MS ? absolute : null;
    })
  );
  const doomed = stale.filter((absolute): absolute is string => absolute !== null);
  await Promise.all(doomed.map((absolute) => fs.unlink(absolute).catch(() => undefined)));
  return doomed.length;
}

const NO_BACKFILL = { sealed: 0, failed: 0 } as const;

/**
 * Un passage sur les effacements en attente : les plus anciens NON TERMINÉS
 * d'abord (`replacingSince` écarte ceux dont l'effacement est marqué fait),
 * au plus `PENDING_ERASURE_PER_PASS`, par lots bornés.
 */
export async function finishPendingErasuresPass(
  deps: Parameters<typeof finishPendingErasures>[0],
  since: Date
): Promise<readonly PendingErasureOutcome[]> {
  const replacing = await deps.access.store.replacingSince(since);
  return inBatches(replacing.slice(0, PENDING_ERASURE_PER_PASS), PENDING_ERASURE_CONCURRENCY, (attachmentId) =>
    finishPendingErasures(deps, attachmentId).catch((): PendingErasureOutcome => ({ erased: 0, repointed: 0 }))
  );
}

export async function runAtRestFileSweep(prisma: PrismaClient, now: Date = new Date(), activatedAt: Date | null = null): Promise<void> {
  const access = processAtRestFileAccess();
  if (!access) return;
  const deps = { ...gatewaySealDeps(prisma, access), prisma };
  const since = sweepSealingSince({
    activatedAt,
    now,
    signerReady: readerFileUrlSignerFromEnv(now) !== null,
    sealingEnabled: atRestFileSealingEnabled(),
    deferredSince: sealingDeferredSince(),
  });
  const report = since ? await backfillAtRestAttachments(deps, { dryRun: false, log: () => undefined, since }) : NO_BACKFILL;
  // Rattrapé sans pièce occupée ni échec : ce qui avait été différé est scellé.
  const caughtUp = since !== null && 'skipped' in report && (report.skipped.busy ?? 0) === 0 && report.failed === 0;
  if (caughtUp) clearSealingDeferred(now);
  const finished = await finishPendingErasuresPass(deps, new Date(now.getTime() - PENDING_ERASURE_MS));
  const tracks = await sweepStaleTrackTemporaries(deps.uploadRoot, now.getTime());
  const erased = finished.reduce((sum, outcome) => sum + outcome.erased, 0);
  const repointed = finished.reduce((sum, outcome) => sum + outcome.repointed, 0);
  if (report.sealed + report.failed + erased + repointed + tracks > 0) {
    logger.info('balayage du scellement au repos', { sealed: report.sealed, failed: report.failed, erased, repointed, staleTracks: tracks });
  }
}

export function startAtRestFileSweep(prisma: PrismaClient): { stop(): void } {
  // Relu tant qu'il manque (Redis absent au démarrage) : posé plus tard, il
  // n'en est que plus prudent.
  const activation: { at: Date | null } = { at: null };
  const marker = () => sealLockRedis() as MarkerClient | null;
  void atRestActivation(marker(), new Date())
    .then((at) => { activation.at = activation.at ?? at; })
    .catch(() => undefined);
  const timer = guardedInterval({
    name: 'at-rest-file-sweep',
    everyMs: AT_REST_SWEEP_EVERY_MS,
    logger,
    run: async () => {
      activation.at = activation.at ?? (await atRestActivation(marker(), new Date()));
      await runAtRestFileSweep(prisma, new Date(), activation.at);
    },
  });
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}
