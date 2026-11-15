/**
 * LE CALENDRIER DES SAISONS SERVI (#10016) — la passerelle le lit en base
 * (`GameSeasonDefinition`), le garde en mémoire, et l'écrit sous la loi.
 *
 *  - **Lecture** : `seasonSchedule(prisma)` rend le calendrier normalisé
 *    (`normalizeSeasonSchedule`), relu au plus toutes les `SCHEDULE_TTL_MS` ; une
 *    base injoignable garde la dernière lecture, et sans lecture du tout rend la
 *    constante (`DEFAULT_SEASON_SCHEDULE`) — le Jeu ne s'arrête jamais faute de calendrier.
 *    `currentSeasonSchedule()` rend la dernière lecture sans attendre (calculs synchrones).
 *  - **Écriture** : `applyEdit` rejoue `applySeasonEdit` (futur seulement, un lundi,
 *    sans chevauchement, récompenses bornées) contre la révision ATTENDUE, puis écrit
 *    la définition en compare-and-set : la révision est unique, deux écritures
 *    concurrentes ne peuvent pas prendre la même.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  DEFAULT_SEASON_SCHEDULE,
  applySeasonEdit,
  normalizeSeasonSchedule,
  type SeasonDefinition,
  type SeasonEdit,
  type SeasonEditRefusal,
  type SeasonSchedule,
} from '@meeshy/shared/utils/game/season-schedule';
import type { LeagueMoment } from '@meeshy/shared/utils/game/league';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'SeasonSchedule' });

export const SCHEDULE_TTL_MS = 30_000;

type Cache = { schedule: SeasonSchedule; loadedAt: number };

let cache: Cache | null = null;
let inflight: Promise<SeasonSchedule> | null = null;

type DefinitionRow = {
  readonly number: number;
  readonly startDay: string;
  readonly status: string;
  readonly themeKey: string;
  readonly stepPoints: number;
  readonly copy: unknown;
  readonly rewardPackKey?: string | null;
  readonly revision: number;
};

const SELECT = { number: true, startDay: true, status: true, themeKey: true, stepPoints: true, copy: true, rewardPackKey: true, revision: true } as const;

/** Les lignes de la base → le calendrier de la loi (révision = la plus haute écrite). */
export function scheduleOfRows(rows: readonly DefinitionRow[]): SeasonSchedule {
  const revision = rows.reduce((max, row) => Math.max(max, row.revision), 0);
  return normalizeSeasonSchedule({
    revision,
    seasons: rows.map((row) => ({
      number: row.number,
      startDay: row.startDay,
      status: row.status,
      themeKey: row.themeKey,
      stepPoints: row.stepPoints,
      copy: row.copy ?? null,
      rewardPack: row.rewardPackKey ?? undefined,
    })),
  });
}

async function readSchedule(prisma: PrismaClient): Promise<SeasonSchedule> {
  const rows = (await prisma.gameSeasonDefinition.findMany({ select: SELECT, orderBy: { number: 'asc' } })) as DefinitionRow[];
  return scheduleOfRows(rows);
}

/** Le calendrier servi, relu au plus toutes les 30 s ; jamais d'échec : la dernière lecture, ou la constante. */
export async function seasonSchedule(prisma: PrismaClient, options: { readonly fresh?: boolean } = {}): Promise<SeasonSchedule> {
  const now = Date.now();
  if (!options.fresh && cache !== null && now - cache.loadedAt < SCHEDULE_TTL_MS) return cache.schedule;
  // Une lecture FRAÎCHE ne rejoint jamais une lecture déjà en vol : celle-ci a pu partir avant une écriture.
  if (options.fresh) {
    try {
      const schedule = await readSchedule(prisma);
      cache = { schedule, loadedAt: Date.now() };
      return schedule;
    } catch (error) {
      log.warn('lecture fraîche du calendrier impossible — dernière lecture ou constante', { error });
      return cache?.schedule ?? DEFAULT_SEASON_SCHEDULE;
    }
  }
  if (inflight !== null) return inflight;
  inflight = readSchedule(prisma)
    .then((schedule) => {
      cache = { schedule, loadedAt: Date.now() };
      return schedule;
    })
    .catch((error: unknown) => {
      log.warn('lecture du calendrier des saisons impossible — dernière lecture ou constante', { error });
      return cache?.schedule ?? DEFAULT_SEASON_SCHEDULE;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Le calendrier pour une ÉCRITURE du Jeu (étoiles, réclamation, Sceau) : jamais la constante par défaut.
 * Base injoignable : la dernière lecture réussie si elle existe, sinon on refuse (`SeasonScheduleUnavailable`) —
 * payer ou marquer le mauvais numéro de saison serait pire que de différer.
 */
export class SeasonScheduleUnavailable extends Error {
  constructor() {
    super('calendrier des saisons illisible');
    this.name = 'SeasonScheduleUnavailable';
  }
}

export async function seasonScheduleForWrite(prisma: PrismaClient): Promise<SeasonSchedule> {
  if (cache !== null && Date.now() - cache.loadedAt < SCHEDULE_TTL_MS) return cache.schedule;
  try {
    const schedule = await readSchedule(prisma);
    cache = { schedule, loadedAt: Date.now() };
    return schedule;
  } catch (error) {
    if (cache !== null) return cache.schedule;
    log.warn('calendrier illisible et jamais lu : écriture du Jeu refusée', { error });
    throw new SeasonScheduleUnavailable();
  }
}

/** La dernière lecture, sans attendre (la constante avant la première). */
export const currentSeasonSchedule = (): SeasonSchedule => cache?.schedule ?? DEFAULT_SEASON_SCHEDULE;

/** Oublie la lecture en mémoire (après une écriture, et pour les témoins). */
export function invalidateSeasonSchedule(): void {
  cache = null;
}

/** Pour les témoins : pose un calendrier en mémoire. */
export function primeSeasonSchedule(schedule: SeasonSchedule): void {
  cache = { schedule, loadedAt: Date.now() };
}

export type ScheduleWriteResult =
  | { readonly ok: true; readonly schedule: SeasonSchedule; readonly definition: SeasonDefinition; readonly before: SeasonDefinition | null }
  | { readonly ok: false; readonly reason: SeasonEditRefusal | 'revision-conflict' | 'schedule-indexes-unavailable' };

let indexesReady = false;

/**
 * Les index UNIQUES (`number`, `revision`) qui rendent l'écriture compare-and-set sûre : posés ici, une fois par
 * processus (idempotent, mêmes noms que la migration). S'ils ne peuvent pas l'être, aucune écriture ne part.
 */
export async function ensureScheduleIndexes(prisma: PrismaClient): Promise<boolean> {
  if (indexesReady) return true;
  try {
    await (prisma as unknown as { $runCommandRaw: (c: object) => Promise<unknown> }).$runCommandRaw({
      createIndexes: 'GameSeasonDefinition',
      indexes: [
        { key: { number: 1 }, name: 'GameSeasonDefinition_number_key', unique: true },
        { key: { revision: 1 }, name: 'GameSeasonDefinition_revision_key', unique: true },
      ],
    });
    indexesReady = true;
    return true;
  } catch (error) {
    log.warn('index uniques du calendrier impossibles à garantir : écriture refusée', { error });
    return false;
  }
}

/** Pour les témoins. */
export function resetScheduleIndexesForTests(): void {
  indexesReady = false;
}

const isP2002 = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * Programme, décale ou met en pause une saison FUTURE. Refuse si la révision lue
 * par l'admin n'est plus celle de la base (`revision-conflict`), ou si la loi refuse.
 * N'écrit RIEN d'autre que la définition de cette saison.
 */
export async function writeSeasonEdit(params: {
  readonly prisma: PrismaClient;
  readonly edit: SeasonEdit;
  readonly expectedRevision: number;
  readonly now: LeagueMoment;
  readonly actorId: string;
}): Promise<ScheduleWriteResult> {
  const { prisma, edit, expectedRevision, now, actorId } = params;
  if (!(await ensureScheduleIndexes(prisma))) return { ok: false, reason: 'schedule-indexes-unavailable' };
  const schedule = await readSchedule(prisma);
  if (schedule.revision !== expectedRevision) return { ok: false, reason: 'revision-conflict' };
  const verdict = applySeasonEdit(schedule, edit, now);
  if ('reason' in verdict) return { ok: false, reason: verdict.reason };
  const def = verdict.definition;
  const revision = schedule.revision + 1;
  const existing = (await prisma.gameSeasonDefinition.findUnique({ where: { number: def.number }, select: SELECT })) as DefinitionRow | null;
  const data = {
    startDay: def.startDay,
    status: def.status,
    themeKey: def.themeKey,
    stepPoints: def.stepPoints,
    copy: (def.copy ?? null) as never,
    rewardPackKey: def.rewardPack ?? null,
    revision,
    updatedBy: actorId,
  };
  try {
    if (existing === null) {
      await prisma.gameSeasonDefinition.create({ data: { number: def.number, ...data } });
    } else {
      const written = await prisma.gameSeasonDefinition.updateMany({ where: { number: def.number, revision: existing.revision }, data });
      if (written.count !== 1) return { ok: false, reason: 'revision-conflict' };
    }
  } catch (err) {
    if (isP2002(err)) return { ok: false, reason: 'revision-conflict' };
    throw err;
  }
  // Relue en base APRÈS l'écriture, sans rejoindre une lecture en vol partie avant elle.
  const fresh = await readSchedule(prisma);
  cache = { schedule: fresh, loadedAt: Date.now() };
  const before: SeasonDefinition | null =
    existing === null
      ? null
      : ({
          number: existing.number,
          startDay: existing.startDay,
          status: existing.status,
          themeKey: existing.themeKey,
          stepPoints: existing.stepPoints,
          copy: existing.copy ?? null,
          ...(existing.rewardPackKey ? { rewardPack: existing.rewardPackKey } : {}),
        } as SeasonDefinition);
  return { ok: true, schedule: fresh, definition: def, before };
}
