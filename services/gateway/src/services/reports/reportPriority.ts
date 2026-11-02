/**
 * LA PRIORITÉ D'UN SIGNALEMENT (#14110, MIN-04) — ce qui touche un mineur, une
 * position ou un lien Sang passe en TÊTE de la file de modération.
 *
 * - **mineur** : le signalant, la personne signalée (l'auteur du contenu, le
 *   compte visé) ou un DESTINATAIRE du contenu (les membres actifs de la
 *   conversation d'un message ou de la conversation signalée, au plus
 *   `AUDIENCE_SCAN_CAP`) est un mineur DÉCLARÉ (audit M2) ;
 * - **position** : le contenu signalé est un message de position ;
 * - **Sang** : signalant et signalé sont liés au Sang sur la ligne ENREGISTRÉE,
 *   ou l'étaient il y a moins de `BLOOD_MEMORY_DAYS` jours — un blocage ou une
 *   baisse posée avant de signaler ne l'efface pas (audit M3).
 *
 * Calculée UNE fois à la création, sur ce que la passerelle lit, jamais sur le
 * corps de la requête. Une lecture qui échoue laisse la priorité ordinaire, et
 * le journal le dit (le seul type signalé, rien d'identifiant) : la priorité
 * ordonne la file, elle ne garde rien, et un signalement ne se perd pas pour
 * elle. Rien de ceci n'est servi au signalé (SEC-06).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ReportPriorityReason } from '@meeshy/shared/types/report';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { logger } from '../../utils/logger';
import { lienSangDepuis } from '../friendship';
import { reportedContentAuthorId } from './reportedContentAuthor';

export const AUDIENCE_SCAN_CAP = 50;
export const BLOOD_MEMORY_DAYS = 30;
const DAY_MS = 86_400_000;

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

async function isBloodLink(prisma: PrismaClient, reporterId: string | null, subjectId: string | null, now: Date): Promise<boolean> {
  if (!reporterId || !subjectId || reporterId === subjectId) return false;
  return lienSangDepuis(prisma, reporterId, subjectId, new Date(now.getTime() - BLOOD_MEMORY_DAYS * DAY_MS));
}

/** La conversation que le contenu signalé a pour audience : celle du message, ou la conversation elle-même. */
async function audienceConversationId(prisma: PrismaClient, reportedType: string, reportedEntityId: string): Promise<string | null> {
  if (reportedType === 'conversation') return reportedEntityId;
  if (reportedType !== 'message') return null;
  const message = await prisma.message.findUnique({ where: { id: reportedEntityId }, select: { conversationId: true } });
  return message?.conversationId ?? null;
}

/** Les destinataires du contenu : les membres ACTIFS inscrits de sa conversation, bornés. */
async function audienceOf(prisma: PrismaClient, reportedType: string, reportedEntityId: string): Promise<string[]> {
  const conversationId = await audienceConversationId(prisma, reportedType, reportedEntityId);
  if (!conversationId) return [];
  const members = await prisma.participant.findMany({
    where: { conversationId, isActive: true, userId: { not: null } },
    select: { userId: true },
    take: AUDIENCE_SCAN_CAP,
  });
  return members.flatMap((member) => (member.userId ? [member.userId] : []));
}

export async function assessReportPriority(
  prisma: PrismaClient,
  report: { readonly reportedType: string; readonly reportedEntityId: string; readonly reporterId: string | null; readonly now?: Date },
): Promise<ReportPriority> {
  const now = report.now ?? new Date();
  try {
    const [subjectId, audience] = await Promise.all([
      reportedContentAuthorId(prisma, report),
      audienceOf(prisma, report.reportedType, report.reportedEntityId),
    ]);
    const people = [...new Set([report.reporterId, subjectId, ...audience].filter((id): id is string => Boolean(id)))];
    const [minor, location, blood] = await Promise.all([
      involvesMinor(prisma, people, now),
      isLocation(prisma, report.reportedType, report.reportedEntityId),
      isBloodLink(prisma, report.reporterId, subjectId, now),
    ]);
    const reasons = ([['minor', minor], ['location', location], ['blood', blood]] as const)
      .filter(([, holds]) => holds)
      .map(([reason]) => reason);
    return reasons.length > 0 ? { priority: 1, priorityReasons: [...reasons] } : ORDINARY;
  } catch {
    logger.warn('[reportPriority] priorité non calculée — signalement rangé parmi les ordinaires', { reportedType: report.reportedType });
    return ORDINARY;
  }
}
