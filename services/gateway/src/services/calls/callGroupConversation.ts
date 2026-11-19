import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { isEndToEndMode } from '../conversations/encryptionRegime';
import { implicitConversationRegime } from '../conversations/creationRegime';
import { FOUNDING_MEMBER_PERMISSIONS } from '../participantRights';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { RANK_SELECT, highestRankedConversations } from '../conversations/highestRanked';

/**
 * La fenêtre de chaque flux du rang. **Elle ne décide plus de ce qui est TROUVÉ**
 * (#19906, relevé par l'audit adversarial de #19835).
 *
 * Elle l'a décidé : `take: 20` précède l'arrivée du rang, et le filtre
 * d'exactitude des membres s'appliquait APRÈS elle. Un groupe appariant
 * exactement, mais rangé derrière vingt SUR-ENSEMBLES plus récents, restait
 * invisible — et l'appel en créait alors un neuf (`reserveTarget`,
 * `callConversationRebranch.ts`) : un doublon, sans erreur ni trace.
 *
 * L'exactitude se dit désormais DANS le `where` (voir `findExactCallGroups`), si
 * bien que ce que la fenêtre tronque est la queue d'un ensemble DÉJÀ exact,
 * ordonné par le rang sur lequel l'appelant choisit. La preuve du top-K
 * (`highestRanked.ts`) garantit que les vingt premiers par rang SONT les vingt
 * premiers ; `reserveTarget` les consomme dans cet ordre et s'arrête au premier
 * dont la réservation se prend. Ce que la preuve EXIGE par ailleurs reste vrai :
 * les deux flux lisent la MÊME fenêtre, quelle qu'elle soit.
 *
 * **Ce que 20 vaut n'est toujours mesuré par rien, et ce n'est plus une dette
 * de correction** : c'est le nombre de groupes qu'un même ensemble de membres
 * peut porter, une question de volumétrie (#19837) et non d'exactitude.
 */
const CALL_GROUP_WINDOW = 20;

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
  readonly lastActivityAt?: Date | null;
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
 *
 * **« Récemment actif » est le RANG** — max(`lastMessageAt`, `lastActivityAt`),
 * #9026 — et non le dernier message (#19835). Un groupe où l'on vient de
 * s'appeler, de réagir ou d'épingler est le plus actif des candidats même si
 * personne n'y a écrit depuis des semaines ; c'est exactement celui où l'appel
 * doit se tenir. L'ordre vient de `highestRankedConversations`, qui lit les deux
 * flux du rang sur la MÊME fenêtre — aucun second tri ne le réécrit ici, un
 * ordre qui se redéclare est un ordre qui divergera.
 *
 * **Le `where` dit l'EXACTITUDE, et non plus seulement l'intersection** (#19906).
 * À « tous les membres visés sont actifs ici » (un `some` par membre) s'ajoute
 * son complément, « aucun membre actif d'ici n'est hors de la cible » : les deux
 * ensemble SONT l'égalité des ensembles, et la fenêtre ne tronque donc plus que
 * la queue d'un ensemble déjà exact. Avant, elle décidait : vingt sur-ensembles
 * plus récents cachaient le groupe exact, et l'appel en créait un neuf.
 *
 * L'intrus se dit en branches POSITIVES — `isSet: false`, `null`, `notIn` — et
 * jamais par une négation de document : un participant SANS compte n'a pas de
 * clé `userId`, et toute négation sous MongoDB exige la clé présente (#8309).
 * `sameSet` reste autoritatif en mémoire : ce filtre ne peut que RESSERRER, donc
 * il ne peut introduire aucun faux positif — c'est ce qui rend le lot sûr sans
 * base de données pour le mesurer.
 */
export async function findExactCallGroups(
  prisma: Pick<PrismaClient, 'conversation' | 'callSession'>,
  input: { readonly callId: string; readonly memberUserIds: readonly string[] }
): Promise<CallGroupCandidate[]> {
  const target = new Set(input.memberUserIds);
  // #19906 — l'exactitude se dit EN BASE, et non plus après la fenêtre : à
  // l'intersection (« tous les visés sont actifs ici ») s'ajoute son complément
  // (« aucun actif d'ici n'est hors de la cible »). Les deux SONT l'égalité des
  // ensembles. L'intrus se dit en branches POSITIVES — un participant sans
  // compte n'a pas de clé `userId`, et toute négation exige la clé présente
  // (#8309). `sameSet` reste autoritatif en mémoire : ce filtre ne peut que
  // RESSERRER, donc il n'introduit aucun faux positif.
  const where = {
    type: 'group',
    AND: input.memberUserIds.map((userId) => ({ participants: { some: { userId, isActive: true } } })),
    participants: {
      none: {
        isActive: true,
        OR: [{ userId: { isSet: false } }, { userId: null }, { userId: { notIn: [...input.memberUserIds] } }],
      },
    },
  };
  const select = {
    ...RANK_SELECT,
    title: true,
    isActive: true,
    closedAt: true,
    deletedAt: true,
    communityId: true,
    isAnnouncementChannel: true,
    encryptionMode: true,
    activeCallId: true,
    participants: { where: { isActive: true }, select: { userId: true } },
  };
  const rows: readonly GroupRow[] = await highestRankedConversations(
    (stream) => prisma.conversation.findMany({
      where: { ...where, ...stream.where },
      select,
      orderBy: stream.orderBy,
      take: CALL_GROUP_WINDOW,
    }),
    CALL_GROUP_WINDOW,
  );
  const exact = rows.filter((row) => isPlainLiveGroup(row) && sameSet(activeKeys(row), target));

  const holders = [...new Set(exact.flatMap((row) => (row.activeCallId && row.activeCallId !== input.callId ? [row.activeCallId] : [])))];
  const live = holders.length === 0
    ? new Set<string>()
    : new Set(
        (await prisma.callSession.findMany({ where: { id: { in: holders } }, select: { id: true, status: true } }))
          .filter((call) => !TERMINAL.has(call.status))
          .map((call) => call.id)
      );

  return exact
    .filter((row) => !(row.activeCallId && live.has(row.activeCallId)))
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
 *
 * Audit #19650 — il naît en TENANT la réservation de l'appel qui le fait naître
 * (`activeCallId`) : prendre la réservation après coup (`ActiveCallClaim.claim`)
 * annonçait la ligne de liste aux membres avant que la bascule soit gagnée.
 */
export async function createCallGroup(
  deps: CreateCallGroupDeps,
  input: { readonly inviterUserId: string; readonly memberUserIds: readonly string[]; readonly callId?: string }
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
      ...(input.callId ? { activeCallId: input.callId } : {}),
      participants: { create: rows },
    },
    select: { id: true, title: true },
  });
  return { id: created.id, title: created.title ?? null };
}
