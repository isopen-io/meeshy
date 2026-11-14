/**
 * LE NOM D'UN PARTICIPANT DU RÉSUMÉ D'APPEL SE LIT À LA LECTURE (#18242 B2).
 *
 * `Message.metadata.participants` ne persiste que des `userId`
 * (`callSummaryParticipantsField`) : un nom figé dans le message ne suivrait ni
 * un renommage ni la purge d'un compte, alors que le reste de la conversation
 * les suit (#8890, #5689). La passerelle compose le nom À LA LECTURE, en UNE
 * requête par page, sur tous les chemins qui servent le message (liste,
 * détail, sync, recherche, liens de partage, diffusions `message:new` /
 * `message:edited`), et sert le contrat inchangé `{ userId, displayName }`.
 *
 * Le nom suit l'ordre canonique de la passerelle pour un membre de la
 * conversation (`ConversationBridgeService.resolveAuthorName`, la charge
 * `message:new`) : surnom de conversation → copie du participant → nom du
 * compte (`resolveParticipantDisplayName`), puis « Prénom Nom » → pseudo
 * (`accountDisplayName`). Un compte purgé — ligne réécrite « Compte supprimé »
 * (#5689) ou disparue — est servi « Compte supprimé », surnom compris.
 *
 * Un ancien résumé qui portait le nom figé se lit pareil : le nom persisté est
 * ignoré. Une panne de lecture sert le résumé SANS la ligne, jamais un nom
 * figé. La base n'est jamais réécrite.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallSummaryParticipant } from '@meeshy/shared/utils/call-summary';
import { storedCallSummaryParticipantIds, withoutCallSummaryParticipants } from '@meeshy/shared/utils/call-summary';
import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import { accountDisplayName } from '../participantNameSnapshots';
import { DELETED_ACCOUNT_DISPLAY_NAME } from '../messaging/deletedAccountDisplayName';
import { logger } from '../../utils/logger';

type Served = { readonly metadata?: unknown; readonly conversationId?: unknown };

/** Toute ligne servie est un objet ; on n'en lit que ces deux clés (une contrainte `Served` serait un type FAIBLE, refusé aux lignes typées `Record`). */
const servedOf = (row: object): Served => row as Served;

/** Ce qu'il faut d'un membre de conversation pour le NOMMER — rien d'autre (ni coordonnée, ni présence). */
export type NamedMember = {
  readonly displayName: string;
  readonly nickname?: string | null;
  readonly user: {
    readonly displayName: string | null;
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly username: string;
  } | null;
};

type MemberRow = NamedMember & {
  readonly conversationId: string;
  readonly userId: string | null;
};

type NameByMember = ReadonlyMap<string, string>;

const memberKey = (conversationId: string, userId: string): string => `${conversationId}:${userId}`;

const nonBlank = (value: string | null | undefined): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

/**
 * Le nom qu'un participant d'appel porte dans SA conversation — partagé par la
 * carte du fil et le journal #8066, pour qu'ils ne divergent pas.
 */
export const conversationMemberName = (row: NamedMember): string => {
  if (row.displayName === DELETED_ACCOUNT_DISPLAY_NAME) return DELETED_ACCOUNT_DISPLAY_NAME;
  return nonBlank(row.nickname)
    ?? resolveParticipantDisplayName(row)
    ?? (row.user === null ? DELETED_ACCOUNT_DISPLAY_NAME : accountDisplayName(row.user));
};

const conversationOf = (row: object, fallback: string | undefined): string | undefined => {
  const { conversationId } = servedOf(row);
  return (typeof conversationId === 'string' ? nonBlank(conversationId) : undefined) ?? fallback;
};

const storedIdsOf = (row: object): ReadonlyArray<string> => storedCallSummaryParticipantIds(servedOf(row).metadata);


const servedMetadata = (metadata: unknown, conversationId: string, names: NameByMember): unknown => {
  const participants: ReadonlyArray<CallSummaryParticipant> = storedCallSummaryParticipantIds(metadata).map((userId) => ({
    userId,
    displayName: names.get(memberKey(conversationId, userId)) ?? DELETED_ACCOUNT_DISPLAY_NAME
  }));
  return { ...(metadata as Record<string, unknown>), participants };
};

const loadNames = async (
  prisma: Pick<PrismaClient, 'participant'>,
  conversationIds: ReadonlyArray<string>,
  userIds: ReadonlyArray<string>
): Promise<NameByMember> => {
  const rows: ReadonlyArray<MemberRow> = await prisma.participant.findMany({
    where: { conversationId: { in: [...conversationIds] }, userId: { in: [...userIds] } },
    select: {
      conversationId: true,
      userId: true,
      displayName: true,
      nickname: true,
      user: { select: { displayName: true, firstName: true, lastName: true, username: true } }
    }
  });
  return rows.reduce<NameByMember>((names, row) => {
    if (!row.userId) return names;
    const key = memberKey(row.conversationId, row.userId);
    return names.has(key) ? names : new Map(names).set(key, conversationMemberName(row));
  }, new Map());
};

export async function withCallSummaryParticipantNames<T extends object>(
  prisma: Pick<PrismaClient, 'participant'>,
  rows: ReadonlyArray<T>,
  options: { readonly conversationId?: string } = {}
): Promise<T[]> {
  const summaries = rows.filter((row) => storedIdsOf(row).length > 0);
  if (summaries.length === 0) return [...rows];

  const conversationIds = [...new Set(summaries.flatMap((row) => conversationOf(row, options.conversationId) ?? []))];
  const userIds = [...new Set(summaries.flatMap(storedIdsOf))];

  const names = await (conversationIds.length === 0
    ? Promise.resolve<NameByMember | null>(null)
    : loadNames(prisma, conversationIds, userIds).catch((error: unknown) => {
        logger.warn('Call summary participant names not loaded — served without the line', {
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }));

  return rows.map((row) => {
    if (storedIdsOf(row).length === 0) return row;
    const conversationId = conversationOf(row, options.conversationId);
    const stored = servedOf(row).metadata;
    const metadata = names === null || conversationId === undefined
      ? withoutCallSummaryParticipants(stored)
      : servedMetadata(stored, conversationId, names);
    return { ...row, metadata };
  });
}

/**
 * La même lecture, rendue par `id` pour un hôte qui garde ses lignes (la
 * liste des conversations) : seuls les résumés d'appel nommés y figurent.
 */
export async function callSummariesWithParticipantNames<T extends { readonly id: string }>(
  prisma: Pick<PrismaClient, 'participant'>,
  rows: ReadonlyArray<T>
): Promise<ReadonlyMap<string, T>> {
  const served = await withCallSummaryParticipantNames(prisma, rows);
  return new Map(served.flatMap((row, index) => (row === rows[index] ? [] : [[row.id, row] as const])));
}
