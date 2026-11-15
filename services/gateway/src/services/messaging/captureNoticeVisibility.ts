/**
 * L'AVIS DE CAPTURE NE SE SERT QU'À CEUX QUI LISENT CE QU'IL NOMME (#9629, #9630).
 *
 * Décision porteur du 2026-10-08 : « respecter les normes et l'état de l'art de
 * la protection de la vie privée » (analyse `conformite-juridique`, consignée
 * dans `decisions/2026-10-08-un-avis-de-capture-ne-se-sert-qu-a-qui-lit-ce-qu-il-nomme-9629.md`).
 * Un avis « X a capturé l'éphémère du 08/10/2026 à 10:00 » dit qu'un message
 * existe et à quelle heure il a été envoyé : il ne se sert donc qu'à qui le
 * message capturé se sert déjà.
 *
 * | règle | loi | sorties |
 * |---|---|---|
 * | celui qui capture et l'auteur du message capturé le voient TOUJOURS | {@link captureNoticeServedTo} | toutes |
 * | les autres : seulement s'ils lisent le message capturé (plancher, `canViewHistory`, historique vidé, masquage) | `readableByReader` | diffusion, page, recherche, `/sync` |
 * | canal d'annonces : les modérateurs et administrateurs, en plus des deux intéressés | {@link captureNoticeServedTo} | idem |
 * | non-lu : l'auteur du message capturé, et lui seul | {@link captureNoticeCountsFor} | les trois compteurs |
 * | aucun aperçu de liste, aucune horloge de fil | {@link withoutCaptureNotices} | liste, aperçu poussé, `lastMessageAt` |
 * | l'avis meurt 24 h après ce qu'il nomme | {@link captureNoticeExpiresAt} | le balayage des éphémères |
 *
 * ─── RECONNAÎTRE UN AVIS EN BASE ─────────────────────────────────────────────
 *
 * Le connecteur MongoDB de Prisma ne filtre pas l'INTÉRIEUR d'un `Json`. Un avis
 * de capture est donc reconnu en deux temps : en base, il est le SEUL message
 * système à porter une échéance ({@link CAPTURE_NOTICE_CANDIDATE_WHERE}) ; en
 * mémoire, sa métadonnée le confirme ({@link captureNoticeOf}). Les avis vivants
 * d'une conversation sont peu nombreux par construction — plafonnés à 30 par
 * heure et par acteur, détruits 24 h après ce qu'ils nomment — et la marque
 * passe par l'index `[conversationId, messageSource]`.
 *
 * ─── ÉCHEC FERMÉ ─────────────────────────────────────────────────────────────
 *
 * Une lecture qui ne conclut pas ne sert pas l'avis : la page PROPAGE (elle ne
 * sert rien), le compteur écarte tous les candidats, la diffusion ne garde que
 * les deux intéressés.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { hasMinimumMemberRole } from '@meeshy/shared/types/role-types';
import { CAPTURE_NOTICE_KIND } from '@meeshy/shared/utils/capture-notice';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import {
  HISTORY_FLOOR_PARTICIPANT_SELECT,
  loadHistoryFloor,
  loadHistoryFloorsForOrFail,
  type HistoryFloorJoin,
  type HistoryReader,
} from '../historyFloor';
import {
  NO_PERSONAL_HIDING,
  readPersonalHistoryHiding,
  readPersonalHistoryHidingByUser,
  type PersonalHistoryHiding,
} from '../personalHistoryFilter';
import { shareLinkHasExpired } from '../shareLinkReadGate';
import { readableByReader } from './messageStars/starredMessageVerdict';

const logger = enhancedLogger.child({ module: 'CaptureNoticeVisibility' });

/** L'avis survit vingt-quatre heures à ce qu'il nomme — le temps que son auteur l'apprenne. */
export const CAPTURE_NOTICE_RETENTION_MS = 24 * 60 * 60_000;

/**
 * L'échéance d'un avis : `max(échéance globale du message capturé, date de
 * l'avis) + 24 h`. L'échéance globale est `Message.expiresAt` — l'heure de
 * destruction pour tous, jamais l'échéance servie d'un lecteur.
 */
export function captureNoticeExpiresAt(params: { readonly capturedExpiresAt: Date | null; readonly noticeAt: Date }): Date {
  const { capturedExpiresAt, noticeAt } = params;
  const base =
    capturedExpiresAt && capturedExpiresAt.getTime() > noticeAt.getTime() ? capturedExpiresAt : noticeAt;
  return new Date(base.getTime() + CAPTURE_NOTICE_RETENTION_MS);
}

/**
 * La marque EN BASE d'un avis de capture vivant : aucun autre message système ne
 * porte d'échéance (mesuré à l'écriture de ce module : les avis de vie du groupe,
 * d'arrivée, de chiffrement et les résumés d'appel n'en posent pas). Le double
 * prédicat sur `expiresAt` apparie une date et elle seule, comme le balayage.
 */
export const CAPTURE_NOTICE_CANDIDATE_WHERE = {
  messageSource: 'system',
  messageType: 'system',
  AND: [{ expiresAt: { isSet: true } }, { expiresAt: { not: null } }],
} satisfies Prisma.MessageWhereInput;

/** La même marque, relue en mémoire sur une ligne déjà chargée. */
export function isCaptureNoticeCandidate(row: {
  readonly messageSource?: string | null;
  readonly messageType?: string | null;
  readonly expiresAt?: Date | null;
}): boolean {
  return row.messageSource === 'system' && row.messageType === 'system' && row.expiresAt instanceof Date;
}

/**
 * Ce qu'un message doit être pour NE PAS être un avis de capture — écrit en
 * branches POSITIVES. Sur MongoDB, Prisma écarte de toute négation le document
 * où la clé est absente (#8309, `__tests__/helpers/mongo-where.ts`) : un
 * `NOT: { …, expiresAt }` écarterait chaque message sans échéance, c'est-à-dire
 * presque tous. Un message sans échéance (clé absente ou nulle) n'est pas un
 * avis ; un message à échéance l'est s'il est système par sa source ET son type,
 * deux colonnes que Prisma écrit toujours (`@default`).
 */
export const NOT_A_CAPTURE_NOTICE_WHERE = {
  OR: [
    { expiresAt: { isSet: false } },
    { expiresAt: null },
    { messageSource: { not: 'system' } },
    { messageType: { not: 'system' } },
  ],
} satisfies Prisma.MessageWhereInput;

/**
 * Une ligne PROJETÉE (une projection peut omettre ces colonnes) peut-elle être
 * un avis ? Une colonne non chargée ne prouve rien : elle laisse la question
 * ouverte, et la ligne part au classement.
 */
export function mayBeCaptureNotice(row: {
  readonly messageSource?: string | null;
  readonly messageType?: string | null;
  readonly expiresAt?: Date | string | null;
}): boolean {
  return (
    (row.messageSource === undefined || row.messageSource === 'system') &&
    (row.messageType === undefined || row.messageType === 'system') &&
    (row.expiresAt === undefined || row.expiresAt !== null)
  );
}

/**
 * Écarte les avis de capture d'une clause `where` — l'aperçu de liste et
 * l'horloge du fil, qui ne sont PAR LECTEUR nulle part. Rendu sous `AND`, jamais
 * à plat : la clause de l'appelant peut porter son propre `OR` (pagination,
 * `unsetOrNull`).
 */
export function withoutCaptureNotices<W extends Record<string, unknown>>(where: W): W & { AND: Prisma.MessageWhereInput[] } {
  const prior = where.AND as Prisma.MessageWhereInput | Prisma.MessageWhereInput[] | undefined;
  const and = prior === undefined ? [] : Array.isArray(prior) ? prior : [prior];
  return { ...where, AND: [...and, NOT_A_CAPTURE_NOTICE_WHERE] };
}

export type CaptureNotice = {
  readonly id: string;
  readonly conversationId: string;
  /** `Participant.id` de celui qui a capturé — l'auteur de l'avis. */
  readonly senderId: string;
  /** `null` : la métadonnée ne nomme rien de lisible — seul celui qui capture le voit. */
  readonly capturedMessageId: string | null;
};

type NoticeSourceRow = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly messageType?: string | null;
  readonly metadata?: unknown;
};

/**
 * La ligne qu'une lecture par identifiant passe à la loi : `messageType` et
 * `metadata` REQUIS — une route qui ne les charge pas ne compile pas, au lieu
 * de laisser passer l'avis en le prenant pour un message ordinaire.
 */
export type NoticeIdentityRow = NoticeSourceRow & { readonly messageType: string | null; readonly metadata: unknown };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** Un message système dont la métadonnée dit `content-capture` — même abîmée : l'échec est fermé. */
export function captureNoticeOf(row: NoticeSourceRow): CaptureNotice | null {
  if (row.messageType !== 'system') return null;
  const metadata = asRecord(row.metadata);
  if (!metadata || metadata.kind !== CAPTURE_NOTICE_KIND) return null;
  const capturedMessageId = typeof metadata.capturedMessageId === 'string' && metadata.capturedMessageId
    ? metadata.capturedMessageId
    : null;
  return { id: row.id, conversationId: row.conversationId, senderId: row.senderId, capturedMessageId };
}

/** Ce que l'audience demande au message capturé — aucun contenu. */
export type CapturedMessage = {
  readonly id: string;
  readonly createdAt: Date;
  readonly deletedAt: Date | null;
  readonly senderId: string;
};

const CAPTURED_SELECT = { id: true, createdAt: true, deletedAt: true, senderId: true } as const;

/** Le lecteur tel qu'une surface le connaît déjà : sa ligne, son plancher, son masquage. */
export type CaptureNoticeViewer = {
  /** `null` : un lecteur sans participation (administrateur de la plateforme). */
  readonly participantId: string | null;
  /** `Participant.role`, en minuscules. */
  readonly conversationRole: string | null;
  readonly floor: Date | null;
  readonly hiding: PersonalHistoryHiding;
};

export function captureNoticeServedTo(params: {
  readonly notice: CaptureNotice;
  readonly captured: CapturedMessage | null;
  readonly viewer: CaptureNoticeViewer;
  readonly isAnnouncementChannel: boolean;
}): boolean {
  const { notice, captured, viewer, isAnnouncementChannel } = params;
  if (viewer.participantId !== null && viewer.participantId === notice.senderId) return true;
  if (!captured) return false;
  if (viewer.participantId !== null && viewer.participantId === captured.senderId) return true;
  if (isAnnouncementChannel && !hasMinimumMemberRole(viewer.conversationRole ?? 'member', 'moderator')) return false;
  if (captured.deletedAt) return false;
  return readableByReader(captured, { floor: viewer.floor, hiding: viewer.hiding });
}

/** Le non-lu d'un avis : l'auteur du message capturé, jamais celui qui capture ni la salle (#9630). */
export function captureNoticeCountsFor(params: {
  readonly notice: CaptureNotice;
  readonly captured: CapturedMessage | null;
  readonly participantId: string;
}): boolean {
  const { notice, captured, participantId } = params;
  return captured !== null && captured.senderId === participantId && notice.senderId !== participantId;
}

/** Ajoute des avis à ce que le lecteur ne voit pas — la forme que toutes les requêtes du fil savent appliquer. */
export function hidingWithCaptureNotices(hiding: PersonalHistoryHiding, noticeIds: readonly string[]): PersonalHistoryHiding {
  const fresh = noticeIds.filter((id) => !hiding.hiddenMessageIds.includes(id));
  if (fresh.length === 0) return hiding;
  return { clearHistoryBefore: hiding.clearHistoryBefore, hiddenMessageIds: [...hiding.hiddenMessageIds, ...fresh] };
}

const NOTICE_SELECT = { id: true, conversationId: true, senderId: true, messageType: true, metadata: true } as const;

/** Les avis vivants d'une conversation, ou parmi des identifiants. PROPAGE. */
async function loadCaptureNotices(
  prisma: PrismaClient,
  scope: { readonly conversationId: string } | { readonly ids: readonly string[] },
): Promise<CaptureNotice[]> {
  const where: Prisma.MessageWhereInput = {
    ...('ids' in scope ? { id: { in: [...scope.ids] } } : { conversationId: scope.conversationId }),
    ...CAPTURE_NOTICE_CANDIDATE_WHERE,
    AND: [...CAPTURE_NOTICE_CANDIDATE_WHERE.AND, unsetOrNull('deletedAt')],
  };
  const rows = (await prisma.message.findMany({ where, select: NOTICE_SELECT })) as NoticeSourceRow[];
  return rows.map(captureNoticeOf).filter((notice): notice is CaptureNotice => notice !== null);
}

/** Les messages que des avis nomment, par identifiant. PROPAGE. */
async function loadCapturedMessages(
  prisma: PrismaClient,
  notices: readonly CaptureNotice[],
): Promise<ReadonlyMap<string, CapturedMessage>> {
  const ids = [...new Set(notices.map((n) => n.capturedMessageId).filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = (await prisma.message.findMany({ where: { id: { in: ids } }, select: CAPTURED_SELECT })) as CapturedMessage[];
  return new Map(rows.map((row) => [row.id, row]));
}

const capturedOf = (captured: ReadonlyMap<string, CapturedMessage>, notice: CaptureNotice): CapturedMessage | null =>
  notice.capturedMessageId ? captured.get(notice.capturedMessageId) ?? null : null;

async function isAnnouncementChannel(prisma: PrismaClient, conversationId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { isAnnouncementChannel: true },
  });
  return conversation?.isAnnouncementChannel === true;
}

/**
 * Les avis d'UNE conversation qu'une surface ne sert pas à ce lecteur — à
 * fondre dans son masquage ({@link hidingWithCaptureNotices}). PROPAGE : une
 * page qui ne sait pas ce qu'elle peut servir ne sert rien.
 */
export async function unservedCaptureNoticeIds(
  prisma: PrismaClient,
  params: { readonly conversationId: string; readonly viewer: CaptureNoticeViewer },
): Promise<string[]> {
  const notices = await loadCaptureNotices(prisma, { conversationId: params.conversationId });
  if (notices.length === 0) return [];
  const [captured, announcement] = await Promise.all([
    loadCapturedMessages(prisma, notices),
    isAnnouncementChannel(prisma, params.conversationId),
  ]);
  return notices
    .filter((notice) => !captureNoticeServedTo({
      notice,
      captured: capturedOf(captured, notice),
      viewer: params.viewer,
      isAnnouncementChannel: announcement,
    }))
    .map((notice) => notice.id);
}

/**
 * Le masquage d'une surface qui SERT le fil à un lecteur (page, recherche,
 * `/sync`) : le sien, plus les avis de capture qu'il ne doit pas voir. À poser
 * là où la surface lit déjà son masquage — chaque requête qui l'applique écarte
 * alors l'avis, compte de pagination compris. PROPAGE.
 */
export async function hidingServedTo(
  prisma: PrismaClient,
  params: {
    readonly conversationId: string;
    readonly participant: { readonly id: string; readonly role?: string | null } | null | undefined;
    readonly floor: Date | null;
    readonly hiding: PersonalHistoryHiding;
  },
): Promise<PersonalHistoryHiding> {
  const { conversationId, participant, floor, hiding } = params;
  const unserved = await unservedCaptureNoticeIds(prisma, {
    conversationId,
    viewer: { participantId: participant?.id ?? null, conversationRole: participant?.role ?? null, floor, hiding },
  });
  return hidingWithCaptureNotices(hiding, unserved);
}

/**
 * La même chose pour une surface qui ne tient que le LECTEUR (la recherche) :
 * sa ligne dans la conversation se lit ici — identité et rang, rien d'autre.
 */
export async function hidingServedToReader(
  prisma: PrismaClient,
  params: {
    readonly conversationId: string;
    readonly reader: HistoryReader | null;
    readonly floor: Date | null;
    readonly hiding: PersonalHistoryHiding;
  },
): Promise<PersonalHistoryHiding> {
  const { conversationId, reader, floor, hiding } = params;
  const participant = reader
    ? await prisma.participant.findFirst({
        where: reader.kind === 'anonymous'
          ? { id: reader.participantId, conversationId, isActive: true }
          : { userId: reader.userId, conversationId, isActive: true },
        select: { id: true, role: true },
      })
    : null;
  return hidingServedTo(prisma, { conversationId, participant, floor, hiding });
}

/**
 * La forme ENSEMBLISTE, pour une surface qui sert plusieurs conversations à la
 * fois (`/sync`) : parmi les lignes qu'elle s'apprête à servir, les avis que le
 * lecteur ne doit pas voir. `viewerOf` rend le lecteur DANS la conversation de
 * l'avis ; `null` (conversation hors de son appartenance) ⇒ l'avis ne se sert
 * pas. PROPAGE.
 */
export async function unservedCaptureNoticeIdsAmong(
  prisma: PrismaClient,
  params: { readonly ids: readonly string[]; readonly viewerOf: (conversationId: string) => CaptureNoticeViewer | null },
): Promise<ReadonlySet<string>> {
  if (params.ids.length === 0) return new Set();
  const notices = await loadCaptureNotices(prisma, { ids: params.ids });
  if (notices.length === 0) return new Set();
  const conversationIds = [...new Set(notices.map((n) => n.conversationId))];
  const [captured, conversations] = await Promise.all([
    loadCapturedMessages(prisma, notices),
    prisma.conversation.findMany({
      where: { id: { in: conversationIds } },
      select: { id: true, isAnnouncementChannel: true },
    }),
  ]);
  const announcement = new Set(conversations.filter((c) => c.isAnnouncementChannel !== false).map((c) => c.id));
  const known = new Set(conversations.map((c) => c.id));
  return new Set(
    notices
      .filter((notice) => {
        const viewer = params.viewerOf(notice.conversationId);
        if (!viewer) return true;
        return !captureNoticeServedTo({
          notice,
          captured: capturedOf(captured, notice),
          viewer,
          isAnnouncementChannel: announcement.has(notice.conversationId) || !known.has(notice.conversationId),
        });
      })
      .map((notice) => notice.id),
  );
}

/**
 * Une lecture PAR IDENTIFIANT (le message seul, ses traductions, son détail de
 * lecture, ses réactions, son fil, ses mentions) : l'avis est-il RETENU pour ce
 * lecteur ? Un message qui n'est pas un avis ne coûte aucune lecture — `row`
 * est celle que la route vient de charger, `messageType` et `metadata`
 * compris. Pour un avis : sa ligne de participation, son plancher, son
 * masquage, le message nommé, le drapeau d'annonce. Toute lecture qui échoue
 * RETIENT l'avis (#9629, audit du 2026-10-08).
 */
export async function captureNoticeWithheldFrom(
  prisma: PrismaClient,
  params: { readonly row: NoticeIdentityRow; readonly reader: HistoryReader | null },
): Promise<boolean> {
  const notice = captureNoticeOf(params.row);
  if (!notice) return false;
  const { reader } = params;
  try {
    const participant = reader
      ? await prisma.participant.findFirst({
          where: reader.kind === 'anonymous'
            ? { id: reader.participantId, conversationId: notice.conversationId, isActive: true, ...unsetOrNull('bannedAt') }
            : { userId: reader.userId, conversationId: notice.conversationId, isActive: true, ...unsetOrNull('bannedAt') },
          select: { id: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
        })
      : null;
    if (!participant) return true;
    const [floor, hiding, captured, announcement] = await Promise.all([
      loadHistoryFloor(prisma, participant),
      readPersonalHistoryHiding(prisma, { userId: reader?.kind === 'user' ? reader.userId : null, conversationId: notice.conversationId }),
      loadCapturedMessages(prisma, [notice]),
      isAnnouncementChannel(prisma, notice.conversationId),
    ]);
    return !captureNoticeServedTo({
      notice,
      captured: capturedOf(captured, notice),
      viewer: { participantId: participant.id, conversationRole: participant.role ?? null, floor, hiding },
      isAnnouncementChannel: announcement,
    });
  } catch (error) {
    logger.warn('capture notice unreadable by id — withheld', {
      messageId: notice.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/**
 * Un avis de capture n'est pas un CONTENU : on n'y réagit pas, on ne l'épingle,
 * ne le cite, ne le transfère ni ne le met en favori — pour personne. Chacun de
 * ces gestes le ferait voyager hors de son audience (une réaction et une
 * épingle se diffusent à la room, une citation se recopie dans la réponse, un
 * transfert dans une autre conversation, un favori dans une liste
 * transversale). Pur : `row` porte `messageType` et `metadata`.
 */
export const refusesContentGesture = (row: { readonly messageType: string | null; readonly metadata: unknown }): boolean =>
  captureNoticeOf({ id: '', conversationId: '', senderId: '', ...row }) !== null;

/**
 * Ce que le compteur écarte, par participant, parmi des CANDIDATS
 * ({@link isCaptureNoticeCandidate}) qu'il a déjà chargés. Un candidat qui n'est
 * pas un avis de capture reste compté. Une lecture qui échoue écarte tous les
 * candidats pour tout le monde.
 */
export async function uncountedCaptureNotices(
  prisma: PrismaClient,
  candidateIds: readonly string[],
): Promise<(participantId: string) => ReadonlySet<string>> {
  if (candidateIds.length === 0) return () => new Set();
  try {
    const notices = await loadCaptureNotices(prisma, { ids: candidateIds });
    const captured = await loadCapturedMessages(prisma, notices);
    return (participantId) => new Set(
      notices
        .filter((notice) => !captureNoticeCountsFor({ notice, captured: capturedOf(captured, notice), participantId }))
        .map((notice) => notice.id),
    );
  } catch (error) {
    logger.warn('capture notices unreadable — none of the candidates is counted', {
      candidates: candidateIds.length,
      error: error instanceof Error ? error.message : String(error),
    });
    const all = new Set(candidateIds);
    return () => all;
  }
}

/** Un destinataire de la diffusion : sa room personnelle est `userId ?? id` ; `joinedAt` est le plancher de son non-lu. */
export type CaptureNoticeRecipient = { readonly id: string; readonly userId: string | null; readonly joinedAt: Date | null };

type AudienceParticipant = { readonly id: string; readonly userId: string | null } & HistoryFloorJoin;

async function expiredLinkIds(prisma: PrismaClient, participants: readonly AudienceParticipant[], now: Date): Promise<ReadonlySet<string> | null> {
  const linkIds = [...new Set(participants.map((p) => p.shareLinkId).filter((id): id is string => Boolean(id)))];
  if (linkIds.length === 0) return new Set();
  try {
    const links = await prisma.conversationShareLink.findMany({
      where: { id: { in: linkIds } },
      select: { id: true, expiresAt: true },
    });
    return new Set(links.filter((link) => shareLinkHasExpired(link, now)).map((link) => link.id));
  } catch {
    return null;
  }
}

/**
 * À qui la diffusion porte un avis : les participants actifs non bannis qui
 * lisent le message capturé, plus celui qui capture et l'auteur. Chaque lecture
 * qui échoue retire ceux dont elle décidait — jamais les deux intéressés.
 */
export async function captureNoticeAudience(
  prisma: PrismaClient,
  params: { readonly conversationId: string; readonly noticeSenderId: string; readonly captured: CapturedMessage; readonly now: Date },
): Promise<CaptureNoticeRecipient[]> {
  const { conversationId, noticeSenderId, captured, now } = params;
  let participants: AudienceParticipant[];
  try {
    participants = (await prisma.participant.findMany({
      where: { conversationId, isActive: true, ...unsetOrNull('bannedAt') },
      select: { id: true, userId: true, ...HISTORY_FLOOR_PARTICIPANT_SELECT },
    })) as unknown as AudienceParticipant[];
  } catch (error) {
    logger.warn('capture notice audience unreadable — nobody is reached live', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  const [{ floors, unreadable }, expired, hidingByUser, announcement] = await Promise.all([
    loadHistoryFloorsForOrFail(prisma, participants),
    expiredLinkIds(prisma, participants, now),
    readPersonalHistoryHidingByUser(prisma, { userIds: participants.map((p) => p.userId), conversationId }).catch(() => null),
    isAnnouncementChannel(prisma, conversationId).catch(() => true),
  ]);

  const notice: CaptureNotice = { id: '', conversationId, senderId: noticeSenderId, capturedMessageId: captured.id };
  return participants
    .filter((participant, index) => {
      if (participant.id === noticeSenderId || participant.id === captured.senderId) return true;
      if (unreadable.has(index)) return false;
      if (participant.shareLinkId && (expired === null || expired.has(participant.shareLinkId))) return false;
      if (participant.userId && hidingByUser === null) return false;
      const hiding = (participant.userId ? hidingByUser?.get(participant.userId) : undefined) ?? NO_PERSONAL_HIDING;
      return captureNoticeServedTo({
        notice,
        captured,
        viewer: { participantId: participant.id, conversationRole: participant.role ?? null, floor: floors[index], hiding },
        isAnnouncementChannel: announcement,
      });
    })
    .map((participant) => ({ id: participant.id, userId: participant.userId, joinedAt: participant.joinedAt }));
}
