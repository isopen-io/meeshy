/**
 * LA PRIORITÉ D'UN SIGNALEMENT (#14110, MIN-04) — ce qui touche un mineur, une
 * position ou un lien Sang passe en TÊTE de la file de modération.
 *
 * - **mineur** : le signalant ou la personne signalée (l'auteur du contenu, le
 *   compte visé) est un mineur DÉCLARÉ ;
 * - **position** : le contenu signalé est un message de position ;
 * - **Sang** : signalant et signalé sont liés au niveau Sang (la loi, feature
 *   `audience.blood` dont le plancher est le Sang — aucune comparaison de niveaux
 *   n'est écrite ici).
 *
 * Calculée UNE fois à la création, sur ce que la passerelle lit, jamais sur le
 * corps de la requête. Une lecture qui échoue laisse la priorité ordinaire : la
 * priorité ordonne la file, elle ne garde rien, et un signalement ne se perd pas
 * pour elle. Rien de ceci n'est servi au signalé (SEC-06).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ReportPriorityReason } from '@meeshy/shared/types/report';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { pairAccess } from '../relations/pairAccess';
import { reportedContentAuthorId } from './reportedContentAuthor';

export type ReportPriority = { readonly priority: 0 | 1; readonly priorityReasons: ReportPriorityReason[] };

const ORDINARY: ReportPriority = { priority: 0, priorityReasons: [] };

async function involvesMinor(prisma: PrismaClient, ids: readonly string[], now: Date): Promise<boolean> {
  if (ids.length === 0) return false;
  const people = await prisma.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, birthDate: true } });
  return people.some((person) => declaredAgeClass(person.birthDate ?? null, now) === 'minor');
}

async function isLocation(prisma: PrismaClient, reportedType: string, reportedEntityId: string): Promise<boolean> {
  if (reportedType !== 'message') return false;
  const message = await prisma.message.findUnique({ where: { id: reportedEntityId }, select: { messageType: true } });
  return message?.messageType === 'location';
}

async function isBloodLink(prisma: PrismaClient, reporterId: string | null, subjectId: string | null): Promise<boolean> {
  if (!reporterId || !subjectId || reporterId === subjectId) return false;
  const verdict = await pairAccess(prisma, { feature: 'audience.blood', viewerId: reporterId, targetId: subjectId });
  return verdict.allowed;
}

export async function assessReportPriority(
  prisma: PrismaClient,
  report: { readonly reportedType: string; readonly reportedEntityId: string; readonly reporterId: string | null; readonly now?: Date },
): Promise<ReportPriority> {
  const now = report.now ?? new Date();
  try {
    const subjectId = await reportedContentAuthorId(prisma, report);
    const people = [report.reporterId, subjectId].filter((id): id is string => Boolean(id));
    const [minor, location, blood] = await Promise.all([
      involvesMinor(prisma, people, now),
      isLocation(prisma, report.reportedType, report.reportedEntityId),
      isBloodLink(prisma, report.reporterId, subjectId),
    ]);
    const reasons = ([['minor', minor], ['location', location], ['blood', blood]] as const)
      .filter(([, holds]) => holds)
      .map(([reason]) => reason);
    return reasons.length > 0 ? { priority: 1, priorityReasons: [...reasons] } : ORDINARY;
  } catch {
    return ORDINARY;
  }
}
