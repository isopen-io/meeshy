/**
 * « X était sur Meeshy récemment » — prévenir les proches d'un retour (#8285,
 * arbitrages porteur du 2026-09-27).
 *
 * Quand X redevient actif (première socket authentifiée sur ce processus), ses
 * amis ACCEPTÉS et les utilisateurs qui l'ont dans leur CARNET (`UserContact`,
 * rapproché ou apparié par un numéro / e-mail VÉRIFIÉ) reçoivent une
 * notification in-app + push, dans la langue de CADRAGE du destinataire
 * (`utils/recipient-language.ts`), sous le nom que le destinataire a donné à X
 * dans son carnet quand il en a un.
 *
 * Règles, toutes gardées par `__tests__/contact-recently-active.test.ts` :
 *  - le verrou de l'ÉMETTEUR passe AVANT tout : rien si `showOnlineStatus` ou
 *    `notifyContactsOnReturn` est coupé (préférences illisibles ⇒ rien, repli
 *    restrictif — c'est une présence qui sortirait) ;
 *  - au plus UNE annonce toutes les 3 heures PAR X : `SET NX EX 10800`
 *    (`CacheStore.setnx` — Redis, ou sa `Map` en mémoire, atomique dans le
 *    processus). Deux connexions simultanées : une seule gagne ;
 *  - un compte de moins de 3 heures ne « revient » pas : son arrivée a déjà
 *    été annoncée par `contact_joined` ;
 *  - caché de la recherche (`hideProfileFromSearch`) ⇒ les carnets ne sont
 *    pas interrogés, seuls les amis sont prévenus — même loi que
 *    `profile-discoverability.ts` ;
 *  - exclus : X, les comptes liés par un blocage (dans les deux sens), les
 *    comptes supprimés ou désactivés, ceux qui ont coupé
 *    `contactActivityEnabled` ;
 *  - la résolution est EN LOT et BORNÉE (`FANOUT_ROW_CAP`) : aucune requête
 *    par destinataire avant la création des notifications elles-mêmes ;
 *  - la charge ne porte que ce qu'un profil public montre, et l'identifiant
 *    de X (`metadata.userId`, `actor.id`) pour ouvrir son profil au toucher —
 *    jamais l'heure de connexion, ni le numéro, ni l'e-mail.
 *
 * Travail ASYNCHRONE : la porte de connexion l'appelle par
 * `scheduleContactRecentlyActiveAnnouncement`, jamais en ligne.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getBlockedUserIdsAmong } from '../../utils/blocking.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language.js';
import { deferAfterResponse, type AfterResponse } from '../../utils/after-response.js';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../../config/user-preferences-defaults.js';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache.js';
import { getCacheStore } from '../CacheStore.js';
import { FANOUT_ROW_CAP } from './fanout/row-cap.js';
import type { NotificationService } from './NotificationService.js';
import { getSharedNotificationService } from './notification-service-registry.js';

const logger = enhancedLogger.child({ module: 'ContactRecentlyActive' });

export const CONTACT_RETURN_WINDOW_SECONDS = 3 * 60 * 60;
const CREATION_CONCURRENCY = 25;

export const contactReturnThrottleKey = (userId: string): string => `notif:contact-return:${userId}`;

/** Le sous-ensemble de `CacheStore` qu'il faut : un `SET NX EX` atomique. */
export type ReturnThrottle = {
  setnx(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
};

type Notifier = Pick<NotificationService, 'createNotification'>;

export type ContactRecentlyActiveDeps = {
  readonly prisma: PrismaClient;
  readonly notifications: Notifier;
  readonly throttle: ReturnThrottle;
  readonly now?: () => Date;
};

export type SkipReason = 'unknown-user' | 'newcomer' | 'privacy-unreadable' | 'presence-hidden' | 'opted-out' | 'throttled';

export type ContactRecentlyActiveReport =
  | { readonly outcome: 'skipped'; readonly reason: SkipReason }
  | { readonly outcome: 'announced'; readonly recipients: number; readonly notified: number };

type Returner = {
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
  createdAt: Date;
};

type Recipient = { readonly id: string; readonly lang: string; readonly nameInBook: string | null };

const skipped = (reason: SkipReason): ContactRecentlyActiveReport => ({ outcome: 'skipped', reason });

const nonEmpty = (value: string | null | undefined): string | null =>
  value && value.trim() !== '' ? value.trim() : null;

const publicName = (user: Returner): string => {
  const full = [user.firstName, user.lastName].filter((part) => nonEmpty(part) !== null).join(' ');
  return nonEmpty(user.displayName) ?? (full || user.username);
};

async function loadReturner(prisma: PrismaClient, userId: string): Promise<Returner | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true,
      phoneNumber: true, phoneVerifiedAt: true, email: true, emailVerifiedAt: true,
      isActive: true, deletedAt: true, createdAt: true,
    },
  });
  if (!user || !user.isActive || user.deletedAt) return null;
  return user as Returner;
}

type SenderPrivacy = { readonly sharesReturn: SkipReason | null; readonly hidesFromSearch: boolean };

async function senderPrivacy(prisma: PrismaClient, userId: string): Promise<SenderPrivacy> {
  try {
    const stored = (await loadPrivacyPreferencesCached(prisma, [userId])).get(userId) ?? {};
    const showsPresence = stored.showOnlineStatus ?? PRIVACY_PREFERENCES_DEFAULTS.showOnlineStatus;
    const notifies = stored.notifyContactsOnReturn ?? PRIVACY_PREFERENCES_DEFAULTS.notifyContactsOnReturn;
    const sharesReturn: SkipReason | null = !showsPresence ? 'presence-hidden' : !notifies ? 'opted-out' : null;
    return { sharesReturn, hidesFromSearch: stored.hideProfileFromSearch === true };
  } catch (error) {
    logger.warn('privacy preferences unreadable — no return announcement', { userId, error });
    return { sharesReturn: 'privacy-unreadable', hidesFromSearch: true };
  }
}

async function acceptedFriendIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const rows = await prisma.friendRequest.findMany({
    where: { status: 'accepted', OR: [{ senderId: userId }, { receiverId: userId }] },
    select: { senderId: true, receiverId: true },
    orderBy: { updatedAt: 'desc' },
    take: FANOUT_ROW_CAP,
  });
  return rows.map((row) => (row.senderId === userId ? row.receiverId : row.senderId));
}

async function addressBookHolders(
  prisma: PrismaClient,
  user: Returner
): Promise<ReadonlyArray<{ ownerId: string; displayName: string | null }>> {
  const phone = user.phoneVerifiedAt && user.phoneNumber ? user.phoneNumber : null;
  const email = user.emailVerifiedAt && user.email ? user.email.trim().toLowerCase() : null;
  return prisma.userContact.findMany({
    where: {
      ownerId: { not: user.id },
      OR: [
        { matchedUserId: user.id },
        ...(phone ? [{ phoneNumbers: { has: phone } }] : []),
        ...(email ? [{ emails: { has: email } }] : []),
      ],
    },
    select: { ownerId: true, displayName: true },
    take: FANOUT_ROW_CAP,
  });
}

async function optedOutOfContactActivity(prisma: PrismaClient, ids: readonly string[]): Promise<Set<string>> {
  const rows = await prisma.userPreferences.findMany({
    where: { userId: { in: [...ids] } },
    select: { userId: true, notification: true },
  });
  return new Set(
    rows
      .filter((row) => (row.notification as Record<string, unknown> | null)?.contactActivityEnabled === false)
      .map((row) => row.userId)
  );
}

async function resolveRecipients(prisma: PrismaClient, user: Returner, hidesFromSearch: boolean): Promise<Recipient[]> {
  const [friends, holders] = await Promise.all([
    acceptedFriendIds(prisma, user.id),
    hidesFromSearch ? Promise.resolve([]) : addressBookHolders(prisma, user),
  ]);
  const nameInBook = new Map<string, string>();
  holders.forEach((row) => {
    const name = nonEmpty(row.displayName);
    if (name && !nameInBook.has(row.ownerId)) nameInBook.set(row.ownerId, name);
  });
  const candidates = [...new Set([...friends, ...holders.map((row) => row.ownerId)])]
    .filter((id) => id && id !== user.id)
    .slice(0, FANOUT_ROW_CAP);
  if (candidates.length === 0) return [];

  const blocked = await getBlockedUserIdsAmong(prisma, user.id, candidates);
  const reachable = candidates.filter((id) => !blocked.has(id));
  if (reachable.length === 0) return [];

  const [accounts, optedOut] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: reachable } },
      select: { id: true, isActive: true, deletedAt: true, ...RECIPIENT_LANG_SELECT },
    }),
    optedOutOfContactActivity(prisma, reachable),
  ]);
  return accounts.flatMap((account) => {
    if (!account.isActive || account.deletedAt || optedOut.has(account.id)) return [];
    return [{ id: account.id, lang: recipientLanguage(account, 'fr'), nameInBook: nameInBook.get(account.id) ?? null }];
  });
}

async function notifyAll(notifications: Notifier, user: Returner, recipients: readonly Recipient[]): Promise<number> {
  const send = (recipient: Recipient) =>
    notifications.createNotification({
      userId: recipient.id,
      type: 'contact_recently_active',
      priority: 'normal',
      lang: recipient.lang,
      content: notificationString(recipient.lang, 'contact.recentlyActiveBody'),
      actor: {
        id: user.id,
        username: user.username,
        displayName: recipient.nameInBook ?? publicName(user),
        avatar: user.avatar,
      },
      context: {},
      metadata: { action: 'view_profile', userId: user.id },
      collapseId: `contact-return-${user.id}`,
    });

  const chunks = Array.from({ length: Math.ceil(recipients.length / CREATION_CONCURRENCY) }, (_, index) =>
    recipients.slice(index * CREATION_CONCURRENCY, (index + 1) * CREATION_CONCURRENCY)
  );
  let notified = 0;
  for (const chunk of chunks) {
    const settled = await Promise.allSettled(chunk.map(send));
    notified += settled.filter((result) => result.status === 'fulfilled' && result.value !== null).length;
  }
  return notified;
}

export async function announceContactRecentlyActive(
  deps: ContactRecentlyActiveDeps,
  userId: string
): Promise<ContactRecentlyActiveReport> {
  const { prisma } = deps;
  const now = (deps.now ?? (() => new Date()))();

  const user = await loadReturner(prisma, userId);
  if (!user) return skipped('unknown-user');
  if (user.createdAt.getTime() > now.getTime() - CONTACT_RETURN_WINDOW_SECONDS * 1000) return skipped('newcomer');

  const privacy = await senderPrivacy(prisma, user.id);
  if (privacy.sharesReturn) return skipped(privacy.sharesReturn);

  const claimed = await deps.throttle.setnx(contactReturnThrottleKey(user.id), now.toISOString(), CONTACT_RETURN_WINDOW_SECONDS);
  if (!claimed) return skipped('throttled');

  const recipients = await resolveRecipients(prisma, user, privacy.hidesFromSearch);
  const notified = recipients.length === 0 ? 0 : await notifyAll(deps.notifications, user, recipients);
  return { outcome: 'announced', recipients: recipients.length, notified };
}

/**
 * Le point d'entrée de la porte de connexion : le travail part APRÈS l'appel
 * (`deferAfterResponse` porte le `.catch`), et une passerelle sans service de
 * notification (seed, tests) ne fait rien.
 */
export function scheduleContactRecentlyActiveAnnouncement(
  prisma: PrismaClient,
  userId: string,
  options: {
    readonly afterResponse?: AfterResponse;
    readonly notifications?: Notifier;
    readonly throttle?: ReturnThrottle;
  } = {}
): void {
  const notifications = options.notifications ?? getSharedNotificationService();
  if (!notifications || !userId) return;
  (options.afterResponse ?? deferAfterResponse)(async () => {
    const report = await announceContactRecentlyActive(
      { prisma, notifications, throttle: options.throttle ?? getCacheStore() },
      userId
    );
    if (report.outcome === 'announced') logger.info('contact_recently_active announced', { userId, ...report });
  }, 'contact-recently-active-announcement');
}
