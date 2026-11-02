/**
 * LA FILE DE MODÉRATION, PRIORITÉ D'ABORD (#14110, MIN-04, audit B1 et m4).
 *
 * Ce qui touche un mineur, une position ou un lien Sang et reste À TRAITER
 * (`pending`, `under_review`) passe en TÊTE de toute liste de signalements,
 * quel que soit le tri demandé : la console web envoie `sortBy=createdAt` à
 * chaque lecture, donc une priorité réservée à l'absence de tri n'atteignait
 * jamais la file. Un prioritaire CLOS suit le tri demandé (contre-audit N1) :
 * sinon l'historique résolu enterrait le prioritaire en attente. Dans le palier
 * prioritaire, le plus ANCIEN d'abord, pour qu'une rafale de signalements
 * urgents n'enterre pas le premier ; le reste suit le tri demandé. L'`id` départage
 * en dernière clé, pour que la pagination ne double ni ne saute personne (N6).
 * Un document antérieur (sans priorité) se range parmi les ordinaires.
 *
 * Deux lectures bornées par page (une par palier), jamais un tri en mémoire.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

type ReportReads = Pick<PrismaClient['report'], 'findMany' | 'count'>;

/** Un signalement encore À TRAITER — la file, et le dédoublonnage d'un signalant (#14627). */
export const OPEN_REPORT_STATUSES: readonly string[] = ['pending', 'under_review'];

const OPEN_URGENT: Prisma.ReportWhereInput = { priority: { gte: 1 }, status: { in: [...OPEN_REPORT_STATUSES] } };

export type PriorityFirstPage = {
  readonly where: Prisma.ReportWhereInput;
  readonly orderBy: Prisma.ReportOrderByWithRelationInput;
  readonly skip?: number;
  readonly take?: number;
};

export async function priorityFirst<Row>(
  report: ReportReads,
  page: PriorityFirstPage,
): Promise<{ readonly rows: Row[]; readonly total: number }> {
  const skip = page.skip ?? 0;
  const urgentWhere: Prisma.ReportWhereInput = { AND: [page.where, OPEN_URGENT] };
  const [urgentTotal, total] = await Promise.all([
    report.count({ where: urgentWhere }),
    report.count({ where: page.where }),
  ]);
  const urgentPage: Prisma.ReportFindManyArgs = { where: urgentWhere, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take: page.take };
  const head = skip < urgentTotal ? ((await report.findMany(urgentPage)) as Row[]) : [];
  const room = page.take === undefined ? undefined : page.take - head.length;
  const ordinaryPage: Prisma.ReportFindManyArgs = {
    where: { AND: [page.where, { NOT: OPEN_URGENT }] },
    orderBy: [page.orderBy, { id: 'asc' }],
    skip: Math.max(0, skip - urgentTotal),
    take: room,
  };
  const tail = room === undefined || room > 0 ? ((await report.findMany(ordinaryPage)) as Row[]) : [];
  return { rows: [...head, ...tail], total };
}
