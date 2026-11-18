import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { isEndToEndMode } from '../conversations/encryptionRegime';
import { implicitConversationRegime } from '../conversations/creationRegime';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

/**
 * LE GROUPE D'UN APPEL (#19650) — à la première invitation d'un appel lancé en
 * tête-à-tête, l'appel rejoint la conversation de groupe où ses participants
 * présents et l'invité sont TOUS, et eux seuls ; sinon elle naît.
 *
 * La correspondance est EXACTE : un sur-ensemble ferait entendre l'appel (et
 * lire sa bulle, sa transcription, son résumé) à quelqu'un qui n'y est pas ; un
 * sous-ensemble ferait entrer l'invité ailleurs que là où l'appel se tient.
 */

const TERMINAL: ReadonlySet<string> = new Set(CALL_TERMINAL_STATUSES);

export type CallGroupCandidate = {
  readonly id: string;
  readonly title: string | null;
  readonly memberUserIds: readonly string[];
};

/** L'ensemble cible : les participants présents de l'appel et l'invité, dédoublonnés, en ordre stable. */
export function exactMembers(presentUserIds: readonly string[], inviteeUserId: string): string[] {
  return [...new Set([...presentUserIds, inviteeUserId])].sort();
}

type GroupRow = {
  readonly id: string;
  readonly title?: string | null;
  readonly isActive?: boolean | null;
  readonly closedAt?: Date | null;
  readonly deletedAt?: Date | null;
  readonly communityId?: string | null;
  readonly isAnnouncementChannel?: boolean | null;
  readonly encryptionMode?: string | null;
  readonly activeCallId?: string | null;
  readonly lastMessageAt?: Date | null;
  readonly participants: readonly { readonly userId: string | null }[];
};

/**
 * Un groupe ordinaire et vivant : ni salon de communauté, ni canal d'annonce,
 * ni clos, ni supprimé, ni chiffré de bout en bout. Lu en mémoire : sur MongoDB,
 * `closedAt: null` ne trouve pas un document où le champ est ABSENT.
 */
const isPlainLiveGroup = (row: GroupRow): boolean =>
  row.isActive !== false &&
  !row.closedAt &&
  !row.deletedAt &&
  !row.communityId &&
  !row.isAnnouncementChannel &&
  !isEndToEndMode(row.encryptionMode);

/** Les membres actifs, tous types : un visiteur sans compte compte, sous une clé qui ne vaut aucun userId. */
const activeKeys = (row: GroupRow): string[] => row.participants.map((p, index) => p.userId ?? `anonymous:${index}`);

const sameSet = (keys: readonly string[], target: ReadonlySet<string>): boolean =>
  keys.length === target.size && new Set(keys).size === target.size && keys.every((key) => target.has(key));

/**
 * Les groupes candidats, du plus récemment actif au plus ancien. Un groupe dont
 * la réservation d'appel est tenue par un AUTRE appel vivant est écarté ; une
 * réservation tenue par un appel fini se reprend (`ActiveCallClaim.claim`).
 */
export async function findExactCallGroups(
  prisma: Pick<PrismaClient, 'conversation' | 'callSession'>,
  input: { readonly callId: string; readonly memberUserIds: readonly string[] }
): Promise<CallGroupCandidate[]> {
  const target = new Set(input.memberUserIds);
  const rows: readonly GroupRow[] = await prisma.conversation.findMany({
    where: {
      type: 'group',
      AND: input.memberUserIds.map((userId) => ({ participants: { some: { userId, isActive: true } } })),
    },
    select: {
      id: true,
      title: true,
      isActive: true,
      closedAt: true,
      deletedAt: true,
      communityId: true,
      isAnnouncementChannel: true,
      encryptionMode: true,
      activeCallId: true,
      lastMessageAt: true,
      participants: { where: { isActive: true }, select: { userId: true } },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 20,
  });
  const exact = rows.filter((row) => isPlainLiveGroup(row) && sameSet(activeKeys(row), target));

  const holders = [...new Set(exact.flatMap((row) => (row.activeCallId && row.activeCallId !== input.callId ? [row.activeCallId] : [])))];
  const live = holders.length === 0
    ? new Set<string>()
    : new Set(
        (await prisma.callSession.findMany({ where: { id: { in: holders } }, select: { id: true, status: true } }))
          .filter((call) => !TERMINAL.has(call.status))
          .map((call) => call.id)
      );

  return [...exact]
    .filter((row) => !(row.activeCallId && live.has(row.activeCallId)))
    .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
    .map((row) => ({ id: row.id, title: row.title ?? null, memberUserIds: [...input.memberUserIds] }));
}

export type CreateCallGroupDeps = {
  readonly prisma: Pick<PrismaClient, 'user' | 'conversation'>;
  /** Le régime de naissance (`server`) — injectable pour un témoin ; la production le scelle ci-dessous. */
  readonly regime?: (enabledBy: string) => Promise<Readonly<Record<string, unknown>>>;
};

/**
 * Le groupe naît SANS titre (le client le compose depuis les membres), l'inviteur
 * `creator`, les autres `member`, tous fondateurs. Il naît SILENCIEUX
 * (`firstMessageSentAt: null`) : il n'apparaît à personne tant que la bascule
 * n'est pas gagnée — une invitation concurrente qui gagne le fait disparaître
 * sans qu'aucune liste l'ait vu.
 */
export async function createCallGroup(
  deps: CreateCallGroupDeps,
  input: { readonly inviterUserId: string; readonly memberUserIds: readonly string[] }
): Promise<{ readonly id: string; readonly title: string | null }> {
  const { prisma } = deps;
  const regime = await (deps.regime
    ? deps.regime(input.inviterUserId)
    : implicitConversationRegime(prisma as PrismaClient, { enabledBy: input.inviterUserId }));
  const users = await prisma.user.findMany({
    where: { id: { in: [...input.memberUserIds] } },
    select: { id: true, username: true, displayName: true, avatar: true, ...RECIPIENT_LANG_SELECT },
  });
  const rows = users
    .map((user) => ({
      userId: user.id,
      type: 'user',
      displayName: user.displayName || user.username || 'User',
      avatar: user.avatar ?? null,
      role: user.id === input.inviterUserId ? 'creator' : 'member',
      language: recipientLanguage(user, 'fr'),
      permissions: { ...FOUNDING_MEMBER_PERMISSIONS },
    }))
    .sort((a, b) => Number(b.role === 'creator') - Number(a.role === 'creator'));

  const created = await prisma.conversation.create({
    data: {
      ...regime,
      identifier: generateCompactConversationIdentifier(),
      type: 'group',
      firstMessageSentAt: null,
      participants: { create: rows },
    },
    select: { id: true, title: true },
  });
  return { id: created.id, title: created.title ?? null };
}
