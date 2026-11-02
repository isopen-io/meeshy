/**
 * La notification DISCRÈTE de la Connaissance née toute seule (#13932).
 *
 * « Marie est maintenant une Connaissance » : une ligne, sans son ni action, dans
 * la langue de CADRAGE du destinataire (`utils/recipient-language.ts`). Elle porte
 * l'identifiant de l'autre personne pour ouvrir son profil, et aucune mesure :
 * ni nombre d'interactions, ni nature manquante.
 *
 * Une passerelle sans service de notification (seed, tests) ne notifie pas : le
 * lien est créé de toute façon, la notification n'en est que le reflet.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language.js';
import { getSharedNotificationService } from '../notifications/notification-service-registry.js';
import type { AcquaintanceNotifier } from './autoAcquaintance.js';

const publicName = (user: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string;
}): string => {
  const full = [user.firstName, user.lastName].filter((part) => part && part.trim() !== '').join(' ');
  return user.displayName?.trim() || full || user.username;
};

export function createAcquaintanceNotifier(prisma: PrismaClient): AcquaintanceNotifier {
  return async ({ recipientId, otherId }) => {
    const notifications = getSharedNotificationService();
    if (!notifications) return;

    const [recipient, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, isActive: true, deletedAt: true, ...RECIPIENT_LANG_SELECT } }),
      prisma.user.findUnique({
        where: { id: otherId },
        select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true, isActive: true, deletedAt: true },
      }),
    ]);
    if (!recipient || !other || !recipient.isActive || recipient.deletedAt || !other.isActive || other.deletedAt) return;

    const lang = recipientLanguage(recipient, 'fr');
    await notifications.createNotification({
      userId: recipient.id,
      type: 'relation_acquaintance',
      priority: 'low',
      lang,
      content: notificationString(lang, 'contact.acquaintanceBody'),
      actor: { id: other.id, username: other.username, displayName: publicName(other), avatar: other.avatar },
      context: {},
      metadata: { action: 'view_profile', userId: other.id, relationLevel: 'ACQUAINTANCE', origin: 'auto-acquaintance' },
    });
  };
}
