/**
 * LA PRIORITÉ D'UN SIGNALEMENT (#14110, MIN-04) — ce qui touche un mineur, une
 * position ou un lien Sang passe en TÊTE de la file de modération.
 *
 * - **mineur** : le signalant, la personne signalée (l'auteur du contenu, le
 *   compte visé) ou un DESTINATAIRE du contenu (un membre actif de la
 *   conversation d'un message ou de la conversation signalée, sans borne : un
 *   seul `count` filtré sur la date de naissance, contre-audit N4) est un
 *   mineur DÉCLARÉ (audit M2). L'audience d'un salon `global`, `public` ou
 *   `broadcast` ne se compte pas (#14627, audit 3 M2) : tout inscrit rejoint
 *   le salon global, un mineur s'y trouve donc toujours, et le compter
 *   coûterait une jointure sur tous les inscrits. Le signalant et l'auteur y
 *   restent lus. Le périmètre définitif est une décision produit (#14636) ;
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
import { ADULT_AGE, declaredAgeClass } from '@meeshy/shared/utils/age';
import { logger } from '../../utils/logger';
import { lienSangDepuis } from '../friendship';
import { reportedContentAuthorId } from './reportedContentAuthor';

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

/** Les salons dont l'audience n'est pas une audience : tout le monde, ou presque, y est. */
const UNCOUNTED_AUDIENCE_TYPES: ReadonlySet<string> = new Set(['global', 'public', 'broadcast']);

/** La conversation que le contenu signalé a pour audience : celle du message, ou la conversation elle-même. */
async function audienceConversationId(prisma: PrismaClient, reportedType: string, reportedEntityId: string): Promise<string | null> {
  if (reportedType === 'conversation') return reportedEntityId;
  if (reportedType !== 'message') return null;
  const message = await prisma.message.findUnique({ where: { id: reportedEntityId }, select: { conversationId: true } });
  return message?.conversationId ?? null;
}

/**
 * La première date de naissance d'un mineur DÉCLARÉ à `now` : celle du
 * lendemain, il y a `ADULT_AGE` ans, en UTC — la même frontière que
 * `ageInFullYearsUtc` (18 ans le jour de ses 18 ans). Le jour se borne au mois
 * de l'année visée : un 29 février sans jumeau 18 ans plus tôt vaut le 28, dont
 * le lendemain est le 1er mars (#14627, audit 3 m1).
 */
const daysInMonthUtc = (year: number, month: number): number => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const minorBirthDateFloor = (now: Date): Date => {
  const year = now.getUTCFullYear() - ADULT_AGE;
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month, Math.min(now.getUTCDate(), daysInMonthUtc(year, month)) + 1));
};

/** Un DESTINATAIRE du contenu est-il mineur ? Une seule lecture, quelle que soit la taille du groupe. */
async function audienceHasMinor(prisma: PrismaClient, reportedType: string, reportedEntityId: string, now: Date): Promise<boolean> {
  const conversationId = await audienceConversationId(prisma, reportedType, reportedEntityId);
  if (!conversationId) return false;
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { type: true } });
  if (!conversation || UNCOUNTED_AUDIENCE_TYPES.has(conversation.type)) return false;
  const minors = await prisma.participant.count({
    where: { conversationId, isActive: true, user: { is: { birthDate: { gte: minorBirthDateFloor(now) } } } },
  });
  return minors > 0;
}

export async function assessReportPriority(
  prisma: PrismaClient,
  report: { readonly reportedType: string; readonly reportedEntityId: string; readonly reporterId: string | null; readonly now?: Date },
): Promise<ReportPriority> {
  const now = report.now ?? new Date();
  try {
    const subjectId = await reportedContentAuthorId(prisma, report);
    const people = [report.reporterId, subjectId].filter((id): id is string => Boolean(id));
    const [minorParty, minorAudience, location, blood] = await Promise.all([
      involvesMinor(prisma, people, now),
      audienceHasMinor(prisma, report.reportedType, report.reportedEntityId, now),
      isLocation(prisma, report.reportedType, report.reportedEntityId),
      isBloodLink(prisma, report.reporterId, subjectId, now),
    ]);
    const reasons = ([['minor', minorParty || minorAudience], ['location', location], ['blood', blood]] as const)
      .filter(([, holds]) => holds)
      .map(([reason]) => reason);
    return reasons.length > 0 ? { priority: 1, priorityReasons: [...reasons] } : ORDINARY;
  } catch {
    logger.warn('[reportPriority] priorité non calculée — signalement rangé parmi les ordinaires', { reportedType: report.reportedType });
    return ORDINARY;
  }
}
