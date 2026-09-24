/**
 * Ce qu'il faut savoir d'un DESTINATAIRE pour lui pousser un appel entrant —
 * extrait de `CallEventsHandler.ts` (#7632, budget de taille).
 *
 * Une responsabilité, et une seule question par fonction : dans quelle LANGUE
 * lui parler, depuis quel PAYS il décroche (conformité CallKit en Chine), et
 * son appareil sait-il seulement recevoir un push VoIP.
 *
 * Ce qui les tient ensemble n'est pas leur forme — trois `findMany` bornés —
 * mais leur DOCTRINE D'ÉCHEC, et elle est écrite dans chacune : **aucune ne
 * rejette, aucune ne fait tomber le push.** Une carte vide, un `Set` complet :
 * le repli de chaque fonction est celui qui laisse la sonnerie partir. C'est
 * l'inverse d'une garde de confidentialité, et c'est délibéré — un appel qu'on
 * ne reçoit pas ne se rattrape pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { resolveUserLanguage } from '@meeshy/shared/utils/conversation-helpers';
import { logger } from '../utils/logger';

/**
 * Langue de notification résolue (Prisme-first) pour chaque callee d'un
 * push d'appel. Un seul findMany ; toute erreur retourne une Map vide —
 * notificationString(undefined) retombe sur 'fr', le push part toujours.
 */
export async function resolveNotificationLangs(prisma: PrismaClient, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (userIds.length === 0) return out;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true,
        deviceLocale: true,
      },
    });
    for (const u of users) {
      out.set(u.id, resolveUserLanguage(u, { deviceLocale: u.deviceLocale ?? undefined }));
    }
  } catch (error) {
    logger.error('Notification language resolution failed — falling back to fr', { error });
  }
  return out;
}

/**
 * Guideline 5 (MIIT) CallKit-in-China compliance — deviceCountry resolved
 * per callee for an incoming-call push. A single findMany; any error
 * returns an empty Map so the caller conservatively falls back to the
 * (CallKit-eligible) 'voip' push type rather than silently dropping it.
 */
export async function resolveDeviceCountries(prisma: PrismaClient, userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (userIds.length === 0) return out;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, deviceCountry: true },
    });
    for (const u of users) {
      out.set(u.id, u.deviceCountry);
    }
  } catch (error) {
    logger.error('Device country resolution failed — falling back to voip push', { error });
  }
  return out;
}

/**
 * GW6(b) — users with at least one ACTIVE `voip` push token. A callee
 * without one (iOS-app-on-Mac, expired/never-registered PushKit token)
 * would get a `voip` send that dies on `No active tokens found` — the call
 * is totally silent app-killed. Those callees fall back to a standard
 * `apns` alert with the SAME payload (data.type 'call' + callId +
 * iceServers) so tapping the banner drives the existing
 * `.incomingCallAlert` navigation. Fail-open toward `voip` (historical
 * behavior) on query error.
 */
export async function resolveVoipCapableUsers(prisma: PrismaClient, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  try {
    const rows = await prisma.pushToken.findMany({
      where: { userId: { in: userIds }, type: 'voip', isActive: true },
      select: { userId: true },
    });
    return new Set(rows.map(r => r.userId));
  } catch (error) {
    logger.error('VoIP token resolution failed — assuming voip-capable', { error });
    return new Set(userIds);
  }
}