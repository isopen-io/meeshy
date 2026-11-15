/**
 * La position du Sang dans `GET /me/export` (#13937, RGPD art. 15 et 20), servie dans la section
 * `relations` à côté des consentements du rituel :
 *
 *  - `bloodLocationGhostAt` : mon fantôme global (`User.locationGhostAt`) ;
 *  - `bloodLocationPoints` : MES points, ouverts (le scellé est lié à mon compte), avec ceux à qui
 *    un fantôme ciblé les cache et s'ils ont été écartés de la proximité ;
 *  - `bloodLocationConsultations` : les lectures que J'AI faites de l'historique d'un autre, et
 *    celles dont MON historique a été l'objet — le journal que je lis déjà.
 *
 * Jamais les points d'un autre. Chaque liste est bornée par la page de la requête.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ExportPage } from '../../routes/me/export-sections';
import { openPoint } from './bloodLocationSeal';

type PointRow = { readonly sealed: string; readonly recordedAt: Date; readonly expiresAt: Date };
type ConsultationRow = { readonly observerId: string; readonly observedId: string; readonly consultedAt: Date };
type FindMany<Row> = { readonly findMany: (args: never) => Promise<readonly Row[]> };

type BloodLocationExportPrisma = {
  readonly user: { readonly findUnique: (args: never) => Promise<{ readonly locationGhostAt?: Date | null } | null> };
  readonly bloodLocationPoint: FindMany<PointRow>;
  readonly bloodLocationConsultation: FindMany<ConsultationRow>;
};

const pointOf = (userId: string, row: PointRow) => {
  const point = openPoint(userId, row.sealed);
  return {
    latitude: point?.latitude ?? null,
    longitude: point?.longitude ?? null,
    accuracy: point?.accuracy ?? null,
    recordedAt: row.recordedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    hiddenFrom: point?.hiddenFrom ?? [],
    excludedFromProximity: point?.implausible === true,
  };
};

export async function exportBloodLocation(prisma: BloodLocationExportPrisma | PrismaClient, userId: string, page: ExportPage) {
  const db = prisma as unknown as BloodLocationExportPrisma;
  const take = page.limit + 1;
  const skip = page.offset;
  const [owner, points, consultations] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { locationGhostAt: true } } as never),
    db.bloodLocationPoint.findMany({
      where: { ownerId: userId },
      select: { sealed: true, recordedAt: true, expiresAt: true },
      orderBy: { recordedAt: 'desc' },
      take,
      skip,
    } as never),
    db.bloodLocationConsultation.findMany({
      where: { OR: [{ observerId: userId }, { observedId: userId }] },
      select: { observerId: true, observedId: true, consultedAt: true },
      orderBy: { consultedAt: 'desc' },
      take,
      skip,
    } as never),
  ]);
  return {
    bloodLocationGhostAt: owner?.locationGhostAt?.toISOString() ?? null,
    bloodLocationPoints: points.slice(0, page.limit).map((row) => pointOf(userId, row)),
    bloodLocationConsultations: consultations
      .slice(0, page.limit)
      .map((row) => ({ observerId: row.observerId, observedId: row.observedId, consultedAt: row.consultedAt.toISOString() })),
    hasMore: { bloodLocationPoints: points.length > page.limit, bloodLocationConsultations: consultations.length > page.limit },
  };
}
