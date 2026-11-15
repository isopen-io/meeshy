import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { parseArrivalsNotice } from '@meeshy/shared/utils/arrivals-notice';
import { parseJoinNotice } from '@meeshy/shared/utils/join-notice';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'noticeUsernames' });

/**
 * Le pseudo des avis d'arrivée écrits AVANT qu'il y voyage (#16421).
 *
 * « Dis-lui salut » (#16338) écrit la mention de chaque arrivant : il lui faut
 * son pseudo. Les lignes `members-arrived` ne le portent que depuis
 * b8915500bd, les avis `member-joined` que depuis le 2026-08-20 : toutes les
 * lignes plus anciennes se servaient sans, et aucun client n'y offrait l'invite.
 *
 * La passerelle le complète À LA LECTURE — la base n'est jamais réécrite — en
 * UNE requête par page, pour les seuls arrivants qui n'en ont pas. Un pseudo
 * stocké n'est jamais remplacé. Un participant anonyme, sans compte, ou dont le
 * compte porte un pseudo `ano_` reste sans pseudo : une mention suppose un
 * pseudo humain. Une lecture en panne sert la page telle quelle — l'invite
 * manque, rien d'autre.
 */

const ANONYMOUS_HANDLE_PREFIX = 'ano_';

type Served = { readonly metadata?: unknown };
type UsernameById = ReadonlyMap<string, string>;
type RawArrival = Record<string, unknown>;

const hasUsername = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

const rawArrivalsOf = (metadata: unknown): readonly RawArrival[] =>
  parseArrivalsNotice(metadata) === null
    ? []
    : (metadata as { arrivals: readonly unknown[] }).arrivals.filter(
        (arrival): arrival is RawArrival => arrival !== null && typeof arrival === 'object',
      );

const missingArrivalIds = (metadata: unknown): readonly string[] =>
  rawArrivalsOf(metadata)
    .filter((arrival) => typeof arrival.participantId === 'string' && !hasUsername(arrival.username))
    .map((arrival) => arrival.participantId as string);

const missingJoinId = (metadata: unknown): readonly string[] => {
  const notice = parseJoinNotice(metadata);
  if (!notice || notice.isAnonymous || notice.username !== undefined) return [];
  return [notice.participantId];
};

const missingIdsOf = (row: Served): readonly string[] => [
  ...missingArrivalIds(row.metadata),
  ...missingJoinId(row.metadata),
];

async function loadUsernames(
  prisma: Pick<PrismaClient, 'participant'>,
  participantIds: readonly string[],
): Promise<UsernameById> {
  const rows = await prisma.participant.findMany({
    where: { id: { in: [...participantIds] } },
    select: { id: true, type: true, user: { select: { username: true } } },
  });
  return new Map(
    rows.flatMap((row) => {
      const username = row.user?.username;
      if (row.type === 'anonymous' || typeof username !== 'string' || !hasUsername(username)) return [];
      if (username.startsWith(ANONYMOUS_HANDLE_PREFIX)) return [];
      return [[row.id, username] as const];
    }),
  );
}

const completedArrival = (arrival: unknown, usernames: UsernameById): unknown => {
  if (arrival === null || typeof arrival !== 'object') return arrival;
  const raw = arrival as RawArrival;
  if (hasUsername(raw.username) || typeof raw.participantId !== 'string') return arrival;
  const username = usernames.get(raw.participantId);
  return username === undefined ? arrival : { ...raw, username };
};

const completedMetadata = (metadata: unknown, usernames: UsernameById): unknown => {
  const raw = metadata as Record<string, unknown>;
  if (parseArrivalsNotice(metadata) !== null) {
    const stored = raw.arrivals as readonly unknown[];
    const arrivals = stored.map((arrival) => completedArrival(arrival, usernames));
    return arrivals.every((arrival, index) => arrival === stored[index]) ? metadata : { ...raw, arrivals };
  }
  const notice = parseJoinNotice(metadata);
  const username = notice ? usernames.get(notice.participantId) : undefined;
  return username === undefined ? metadata : { ...raw, username };
};

export async function withNoticeUsernames<T extends Served>(
  prisma: Pick<PrismaClient, 'participant'>,
  rows: readonly T[],
): Promise<T[]> {
  const missing = [...new Set(rows.flatMap(missingIdsOf))];
  if (missing.length === 0) return [...rows];

  let usernames: UsernameById;
  try {
    usernames = await loadUsernames(prisma, missing);
  } catch (error) {
    log.warn('notice usernames not loaded — page served as stored', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [...rows];
  }
  if (usernames.size === 0) return [...rows];

  return rows.map((row) => {
    if (missingIdsOf(row).length === 0) return row;
    const metadata = completedMetadata(row.metadata, usernames);
    return metadata === row.metadata ? row : { ...row, metadata };
  });
}
