import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from '../../utils/prisma-unset';
import { scheduleViewOnceBurn, VIEW_ONCE_BURN_GRACE_MS } from './scheduleViewOnceBurn';
import { computeViewOnceStates, type ViewOnceAudiencePrisma, type ViewOnceReaderState } from './viewOnceAudience';

/**
 * Le RATTRAPAGE des médias à vue unique déjà lus par tous (#11269).
 *
 * Le balayage (`purgeDueViewOnceContent`) n'efface que ce dont l'échéance est
 * posée et passée. Deux populations lui échappent :
 *
 *  - `consumed-unscheduled` — lue par tous les destinataires actifs, mais
 *    l'échéance n'a jamais été rapprochée : ouverte avant #7578, programmation
 *    en échec à la consommation, ou dernier non-lecteur parti depuis (aucune
 *    ouverture ne refait le compte). Elle attend le plafond de rétention, ou
 *    l'éternité si l'envoi est antérieur à ce plafond ;
 *  - `burned-with-media` — contenu déjà purgé, mais une pièce a résisté sous
 *    l'ancienne purge, qui remettait l'échéance à `null` : plus aucune passe ne
 *    la revoyait.
 *
 * Le rattrapage n'efface RIEN lui-même. Il réarme l'échéance — exactement ce
 * que la consommation aurait écrit (`scheduleViewOnceBurn`, dernière ouverture
 * = maintenant, plus le sursis), ou « maintenant » pour une reprise de fichiers
 * — et laisse le balayage, seul chemin d'effacement, faire le reste avec ses
 * garanties : octets partagés gardés tant qu'une autre ligne les cite, pistes,
 * variantes et rendus dérivés, miroir objet, translator.
 *
 * À SEC par défaut : il compte sans écrire, et n'écrit que sur `apply: true`.
 * Une lecture d'audience qui échoue arrête tout — on ne réarme pas ce qu'on
 * n'a pas su compter. Rejoué, il ne retrouve que ce que le balayage n'a pas
 * encore traité : idempotent.
 */

const DEFAULT_CATCH_UP_BATCH = 100;

export type ViewOnceMediaCatchUpPrisma = Pick<PrismaClient, 'message'> & ViewOnceAudiencePrisma;

export type ViewOnceMediaFindingKind = 'consumed-unscheduled' | 'burned-with-media';

export interface ViewOnceMediaFinding {
  readonly messageId: string;
  readonly conversationId: string;
  readonly kind: ViewOnceMediaFindingKind;
  readonly attachments: number;
}

export interface ViewOnceMediaCatchUpOptions {
  readonly now: Date;
  readonly apply?: boolean;
  readonly batchSize?: number;
  readonly onFinding?: (finding: ViewOnceMediaFinding) => void;
}

export interface ViewOnceMediaCatchUpReport {
  readonly apply: boolean;
  readonly scanned: number;
  readonly consumedUnscheduled: number;
  readonly burnedWithMedia: number;
  readonly attachments: number;
  readonly rearmed: number;
}

type ViewOnceRow = {
  id: string;
  conversationId: string;
  senderId: string;
  isViewOnce: boolean;
  viewOnceBurnAt: Date | null;
  viewOnceBurnedAt: Date | null;
  attachments: Array<{ id: string }>;
};

const at = (value: Date | null | undefined): number | null =>
  value instanceof Date && Number.isFinite(value.getTime()) ? value.getTime() : null;

/** Déjà purgée, des pièces restent, et aucune reprise n'est en file. */
function isBurnedWithMedia(row: ViewOnceRow, now: Date): boolean {
  const deadline = at(row.viewOnceBurnAt);
  return at(row.viewOnceBurnedAt) !== null && row.attachments.length > 0 && (deadline === null || deadline > now.getTime());
}

/** Pas encore purgée, porte des pièces, et son échéance est absente ou plus lointaine que le sursis. */
function mayBeConsumedUnscheduled(row: ViewOnceRow, now: Date): boolean {
  const deadline = at(row.viewOnceBurnAt);
  return (
    at(row.viewOnceBurnedAt) === null &&
    row.attachments.length > 0 &&
    (deadline === null || deadline > now.getTime() + VIEW_ONCE_BURN_GRACE_MS)
  );
}

async function readBatch(
  prisma: ViewOnceMediaCatchUpPrisma,
  after: string | undefined,
  take: number,
): Promise<ViewOnceRow[]> {
  return (await prisma.message.findMany({
    where: {
      isViewOnce: true,
      ...unsetOrNull('deletedAt'),
      ...(after === undefined ? {} : { id: { gt: after } }),
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      isViewOnce: true,
      viewOnceBurnAt: true,
      viewOnceBurnedAt: true,
      attachments: { select: { id: true } },
    },
    orderBy: { id: 'asc' },
    take,
  })) as ViewOnceRow[];
}

type Tally = Omit<ViewOnceMediaCatchUpReport, 'apply'>;

async function handleBatch(
  prisma: ViewOnceMediaCatchUpPrisma,
  rows: readonly ViewOnceRow[],
  options: ViewOnceMediaCatchUpOptions,
): Promise<Tally> {
  const { now } = options;
  const burned = rows.filter((row) => isBurnedWithMedia(row, now));
  const candidates = rows.filter((row) => mayBeConsumedUnscheduled(row, now));
  const states = candidates.length === 0 ? new Map<string, ViewOnceReaderState>() : await computeViewOnceStates(prisma, candidates, null);
  const consumed = candidates.filter((row) => states.get(row.id)?.isFullyConsumed === true);

  const findings: Array<{ row: ViewOnceRow; kind: ViewOnceMediaFindingKind }> = [
    ...consumed.map((row) => ({ row, kind: 'consumed-unscheduled' as const })),
    ...burned.map((row) => ({ row, kind: 'burned-with-media' as const })),
  ];
  findings.forEach(({ row, kind }) =>
    options.onFinding?.({ messageId: row.id, conversationId: row.conversationId, kind, attachments: row.attachments.length }),
  );

  const rearmed = options.apply === true ? await rearm(prisma, consumed, burned, now) : 0;

  return {
    scanned: rows.length,
    consumedUnscheduled: consumed.length,
    burnedWithMedia: burned.length,
    attachments: findings.reduce((sum, { row }) => sum + row.attachments.length, 0),
    rearmed,
  };
}

async function rearm(
  prisma: ViewOnceMediaCatchUpPrisma,
  consumed: readonly ViewOnceRow[],
  burned: readonly ViewOnceRow[],
  now: Date,
): Promise<number> {
  const scheduled = await Promise.all(
    consumed.map(async (row) => (await scheduleViewOnceBurn(prisma, { messageId: row.id, at: now })).scheduled),
  );
  await Promise.all(burned.map((row) => prisma.message.update({ where: { id: row.id }, data: { viewOnceBurnAt: now } })));
  return scheduled.filter(Boolean).length + burned.length;
}

const EMPTY_TALLY: Tally = { scanned: 0, consumedUnscheduled: 0, burnedWithMedia: 0, attachments: 0, rearmed: 0 };

const add = (left: Tally, right: Tally): Tally => ({
  scanned: left.scanned + right.scanned,
  consumedUnscheduled: left.consumedUnscheduled + right.consumedUnscheduled,
  burnedWithMedia: left.burnedWithMedia + right.burnedWithMedia,
  attachments: left.attachments + right.attachments,
  rearmed: left.rearmed + right.rearmed,
});

export async function catchUpConsumedViewOnceMedia(
  prisma: ViewOnceMediaCatchUpPrisma,
  options: ViewOnceMediaCatchUpOptions,
): Promise<ViewOnceMediaCatchUpReport> {
  const take = options.batchSize ?? DEFAULT_CATCH_UP_BATCH;
  const walk = async (after: string | undefined, tally: Tally): Promise<Tally> => {
    const rows = await readBatch(prisma, after, take);
    if (rows.length === 0) return tally;
    const next = add(tally, await handleBatch(prisma, rows, options));
    return rows.length < take ? next : walk(rows[rows.length - 1].id, next);
  };
  return { apply: options.apply === true, ...(await walk(undefined, EMPTY_TALLY)) };
}
