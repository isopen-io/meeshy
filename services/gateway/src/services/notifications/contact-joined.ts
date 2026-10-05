/**
 * « X a rejoint Meeshy » — l'annonce aux carnets d'adresses (#8105, décision
 * porteur #8106).
 *
 * Quand un compte s'inscrit, ou vérifie un numéro / un e-mail, chaque
 * utilisateur dont le carnet (`UserContact`) contient cet identifiant est
 * prévenu : le carnet est rapproché (`matchedUserId`), puis une notification
 * in-app + push part dans la langue du DESTINATAIRE (cadrage du Prisme,
 * `utils/recipient-language.ts`), sous le nom que LE DESTINATAIRE a donné à la
 * personne dans son carnet.
 *
 * Règles, toutes gardées par `__tests__/contact-joined.test.ts` :
 *  - seuls les identifiants VÉRIFIÉS apparient — un e-mail saisi sans preuve
 *    ferait annoncer « Marie est sur Meeshy » par quelqu'un qui n'est pas elle ;
 *  - rien si l'arrivant a demandé à ne pas être trouvé (`hideProfileFromSearch`,
 *    #8104 — préférence illisible ⇒ rien, repli restrictif) ;
 *  - rien à soi, rien entre comptes liés par un blocage, rien à un ami déjà
 *    accepté ;
 *  - UNE fois par paire (destinataire, arrivant) : `ContactJoinNotice` porte
 *    une contrainte d'unicité, donc une course entre deux vérifications perd
 *    proprement (P2002) ;
 *  - pas de rafale : une annonce NON LUE de moins de 30 minutes chez le même
 *    destinataire est enrichie (« Marie et 2 autres… ») au lieu d'en créer une
 *    seconde — sans nouveau push ;
 *  - la charge ne transporte que ce qu'un profil public montre : jamais le
 *    numéro ni l'e-mail apparié.
 *
 * Travail ASYNCHRONE : les portes d'inscription et de vérification l'appellent
 * par `scheduleContactJoinedAnnouncement`, après la réponse, jamais en ligne.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Notification } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getBlockedUserIdsAmong } from '../../utils/blocking.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language.js';
import { deferAfterResponse, type AfterResponse } from '../../utils/after-response.js';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache.js';
import type { NotificationService } from './NotificationService.js';
import { getSharedNotificationService } from './notification-service-registry.js';

const logger = enhancedLogger.child({ module: 'ContactJoined' });

export const CONTACT_JOINED_GROUPING_WINDOW_MS = 30 * 60 * 1000;
/** Borne le nombre de fiches lues pour une arrivée (un numéro très partagé). */
const MAX_ADDRESS_BOOK_ROWS = 10_000;

type Notifier = Pick<NotificationService, 'createNotification'>;

export type ContactJoinedDeps = {
  readonly prisma: PrismaClient;
  readonly notifications: Notifier;
  readonly now?: () => Date;
};

export type ContactJoinedReport = {
  readonly matchedContacts: number;
  readonly notified: number;
  readonly grouped: number;
};

const NOTHING: ContactJoinedReport = { matchedContacts: 0, notified: 0, grouped: 0 };

type Joiner = {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  phoneNumber: string | null;
  phoneVerifiedAt: Date | null;
  email: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  deletedAt: Date | null;
};

type ContactRow = { id: string; ownerId: string; displayName: string | null; phoneNumbers: string[] };

type Recipient = {
  readonly id: string;
  readonly lang: string;
  readonly nameInBook: string | null;
};

const publicName = (joiner: Joiner): string => {
  const full = [joiner.firstName, joiner.lastName].filter((part) => part && part.trim() !== '').join(' ');
  return joiner.displayName?.trim() || full || joiner.username;
};

const nonEmpty = (value: string | null | undefined): string | null =>
  value && value.trim() !== '' ? value.trim() : null;

async function loadJoiner(prisma: PrismaClient, joinerId: string): Promise<Joiner | null> {
  const joiner = await prisma.user.findUnique({
    where: { id: joinerId },
    select: {
      id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true,
      phoneNumber: true, phoneVerifiedAt: true, email: true, emailVerifiedAt: true,
      isActive: true, deletedAt: true,
    },
  });
  if (!joiner || !joiner.isActive || joiner.deletedAt) return null;
  return joiner as Joiner;
}

async function hidesFromSearch(prisma: PrismaClient, joinerId: string): Promise<boolean> {
  try {
    const stored = await loadPrivacyPreferencesCached(prisma, [joinerId]);
    return stored.get(joinerId)?.hideProfileFromSearch === true;
  } catch (error) {
    logger.warn('privacy preferences unreadable — no announcement', { joinerId, error });
    return true;
  }
}

async function acceptedFriendsOf(prisma: PrismaClient, joinerId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.friendRequest.findMany({
    where: {
      status: 'accepted',
      OR: [
        { senderId: joinerId, receiverId: { in: [...ids] } },
        { senderId: { in: [...ids] }, receiverId: joinerId },
      ],
    },
    select: { senderId: true, receiverId: true },
  });
  return new Set(rows.map((row) => (row.senderId === joinerId ? row.receiverId : row.senderId)));
}

async function claimPair(prisma: PrismaClient, recipientId: string, joinerId: string): Promise<boolean> {
  try {
    await prisma.contactJoinNotice.create({ data: { recipientId, joinerId } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') return false;
    throw error;
  }
}

async function matchAddressBooks(
  prisma: PrismaClient,
  joiner: Joiner,
  rows: readonly ContactRow[],
  now: Date
): Promise<void> {
  const phone = joiner.phoneVerifiedAt ? joiner.phoneNumber : null;
  const byPhone = rows.filter((row) => phone !== null && row.phoneNumbers.includes(phone)).map((row) => row.id);
  const byEmail = rows.map((row) => row.id).filter((id) => !byPhone.includes(id));
  const batches: Array<['phone' | 'email', string[]]> = [['phone', byPhone], ['email', byEmail]];
  for (const [matchedBy, ids] of batches) {
    if (ids.length === 0) continue;
    await prisma.userContact.updateMany({
      where: { id: { in: ids } },
      data: { matchedUserId: joiner.id, matchedBy, matchedAt: now },
    });
  }
}

async function groupIntoPending(
  prisma: PrismaClient,
  joiner: Joiner,
  recipient: Recipient,
  now: Date
): Promise<boolean> {
  const pending = await prisma.notification.findFirst({
    where: {
      userId: recipient.id,
      type: 'contact_joined',
      isRead: false,
      createdAt: { gte: new Date(now.getTime() - CONTACT_JOINED_GROUPING_WINDOW_MS) },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) return false;

  const previous = (pending.metadata ?? {}) as { joinerIds?: unknown };
  const earlier = Array.isArray(previous.joinerIds)
    ? previous.joinerIds.filter((id): id is string => typeof id === 'string' && id !== joiner.id)
    : [];
  const joinerIds = [joiner.id, ...earlier];
  const name = recipient.nameInBook ?? publicName(joiner);

  await prisma.notification.update({
    where: { id: pending.id },
    data: {
      title: notificationString(recipient.lang, 'contact.joinedMany', { actor: name, count: joinerIds.length - 1 }),
      content: notificationString(recipient.lang, 'contact.joinedManyBody'),
      actor: { id: joiner.id, username: joiner.username, displayName: name, avatar: joiner.avatar },
      metadata: { action: 'view_profile', joinerIds, joinerCount: joinerIds.length },
    },
  });
  return true;
}

async function announceTo(
  deps: ContactJoinedDeps,
  joiner: Joiner,
  recipient: Recipient,
  now: Date
): Promise<'notified' | 'grouped' | 'skipped'> {
  if (!(await claimPair(deps.prisma, recipient.id, joiner.id))) return 'skipped';
  if (await groupIntoPending(deps.prisma, joiner, recipient, now)) return 'grouped';

  const created: Notification | null = await deps.notifications.createNotification({
    userId: recipient.id,
    type: 'contact_joined',
    priority: 'normal',
    lang: recipient.lang,
    content: notificationString(recipient.lang, 'contact.joinedBody'),
    actor: {
      id: joiner.id,
      username: joiner.username,
      displayName: recipient.nameInBook ?? publicName(joiner),
      avatar: joiner.avatar,
    },
    context: {},
    metadata: { action: 'view_profile', joinerIds: [joiner.id], joinerCount: 1 },
  });
  return created ? 'notified' : 'skipped';
}

export async function announceContactJoined(
  deps: ContactJoinedDeps,
  joinerId: string
): Promise<ContactJoinedReport> {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();

  const joiner = await loadJoiner(prisma, joinerId);
  if (!joiner) return NOTHING;

  const phone = joiner.phoneVerifiedAt && joiner.phoneNumber ? joiner.phoneNumber : null;
  const email = joiner.emailVerifiedAt && joiner.email ? joiner.email.trim().toLowerCase() : null;
  if (!phone && !email) return NOTHING;
  if (await hidesFromSearch(prisma, joiner.id)) return NOTHING;

  const found = (await prisma.userContact.findMany({
    where: {
      ownerId: { not: joiner.id },
      OR: [
        ...(phone ? [{ phoneNumbers: { has: phone } }] : []),
        ...(email ? [{ emails: { has: email } }] : []),
      ],
    },
    select: { id: true, ownerId: true, displayName: true, phoneNumbers: true },
    take: MAX_ADDRESS_BOOK_ROWS,
  })) as ContactRow[];
  const candidateRows = found.filter((row) => row.ownerId !== joiner.id);
  if (candidateRows.length === 0) return NOTHING;

  const owners = [...new Set(candidateRows.map((row) => row.ownerId))];
  const blocked = await getBlockedUserIdsAmong(prisma, joiner.id, owners);
  const rows = candidateRows.filter((row) => !blocked.has(row.ownerId));
  if (rows.length === 0) return NOTHING;

  await matchAddressBooks(prisma, joiner, rows, now);

  const reachable = owners.filter((id) => !blocked.has(id));
  const [friends, alreadyTold, recipientRows] = await Promise.all([
    acceptedFriendsOf(prisma, joiner.id, reachable),
    prisma.contactJoinNotice.findMany({
      where: { joinerId: joiner.id, recipientId: { in: reachable } },
      select: { recipientId: true },
    }),
    prisma.user.findMany({
      where: { id: { in: reachable } },
      select: { id: true, isActive: true, deletedAt: true, ...RECIPIENT_LANG_SELECT },
    }),
  ]);
  const told = new Set(alreadyTold.map((notice) => notice.recipientId));

  const recipients: Recipient[] = recipientRows
    .filter((user) => user.isActive && !user.deletedAt && !friends.has(user.id) && !told.has(user.id))
    .map((user) => ({
      id: user.id,
      lang: recipientLanguage(user, 'fr'),
      nameInBook: nonEmpty(rows.find((row) => row.ownerId === user.id && nonEmpty(row.displayName))?.displayName),
    }));

  const outcomes: Array<'notified' | 'grouped' | 'skipped'> = [];
  for (const recipient of recipients) {
    try {
      outcomes.push(await announceTo(deps, joiner, recipient, now));
    } catch (error) {
      logger.warn('contact_joined announcement failed for one recipient', { recipientId: recipient.id, error });
      outcomes.push('skipped');
    }
  }

  return {
    matchedContacts: rows.length,
    notified: outcomes.filter((outcome) => outcome === 'notified').length,
    grouped: outcomes.filter((outcome) => outcome === 'grouped').length,
  };
}

/**
 * Le point d'entrée des portes d'inscription et de vérification : le travail
 * part APRÈS la réponse (`deferAfterResponse` porte le `.catch`), et une
 * passerelle sans service de notification (seed, tests) ne fait rien.
 */
export function scheduleContactJoinedAnnouncement(
  prisma: PrismaClient,
  joinerId: string,
  options: { readonly afterResponse?: AfterResponse; readonly notifications?: Notifier } = {}
): void {
  const notifications = options.notifications ?? getSharedNotificationService();
  if (!notifications || !joinerId) return;
  (options.afterResponse ?? deferAfterResponse)(async () => {
    const report = await announceContactJoined({ prisma, notifications }, joinerId);
    if (report.matchedContacts > 0) logger.info('contact_joined announced', { joinerId, ...report });
  }, 'contact-joined-announcement');
}
