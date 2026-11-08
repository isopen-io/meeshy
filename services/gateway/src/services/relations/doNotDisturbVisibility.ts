/**
 * « NE PAS DÉRANGER » VISIBLE (#14107, PRE-07) — dès Connaissance, un lecteur
 * apprend qu'une personne est indisponible maintenant. Il n'apprend jamais SA
 * fenêtre, ses jours ni son fuseau : seul le fait, évalué à l'instant par
 * `isWithinDnd` (la règle même des notifications).
 *
 * `false` partout ailleurs, et c'est volontairement la même valeur que
 * « disponible » : sous Connaissance, bloqué, présence masquée par la cible
 * (`privacy.showOnlineStatus`), lecteur sans compte, préférence illisible —
 * rien ne distingue ces cas d'une personne disponible.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOTIFICATION_PREFERENCE_DEFAULTS, type NotificationPreference } from '@meeshy/shared/types/preferences';
import { isWithinDnd } from '@meeshy/shared/utils/notification-dnd';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';
import { pairAccessAmong, type PairAccessDb } from './pairAccess';

export type DoNotDisturbDb = PairAccessDb & Pick<PrismaClient, 'userPreferences'>;

const notificationPrefsOf = (raw: unknown): NotificationPreference => ({
  ...NOTIFICATION_PREFERENCE_DEFAULTS,
  ...(raw && typeof raw === 'object' ? (raw as Partial<NotificationPreference>) : {}),
});

async function inDndNow(prisma: DoNotDisturbDb, ids: readonly string[], now: Date): Promise<ReadonlySet<string>> {
  if (ids.length === 0) return new Set();
  const [rows, privacy] = await Promise.all([
    prisma.userPreferences.findMany({ where: { userId: { in: [...ids] } }, select: { userId: true, notification: true } }),
    loadPrivacyPreferencesCached(prisma as unknown as PrismaClient, ids),
  ]);
  return new Set(
    rows
      .filter((row) => privacy.get(row.userId)?.showOnlineStatus !== false)
      .filter((row) => isWithinDnd(notificationPrefsOf(row.notification), now))
      .map((row) => row.userId),
  );
}

/** Pour chaque cible : est-elle en Ne pas déranger MAINTENANT, telle que le lecteur a le droit de le savoir ? */
export async function servedDoNotDisturb(
  prisma: DoNotDisturbDb,
  params: { readonly viewerId: string | null; readonly targetIds: readonly string[]; readonly now?: Date },
): Promise<ReadonlyMap<string, boolean>> {
  const hidden = new Map(params.targetIds.map((id) => [id, false] as const));
  if (!params.viewerId) return hidden;

  try {
    const verdicts = await pairAccessAmong(prisma, {
      feature: 'presence.dnd',
      subjectId: params.viewerId,
      otherIds: params.targetIds,
      subjectIs: 'viewer',
    });
    const allowed = params.targetIds.filter((id) => verdicts.get(id)?.allowed === true);
    const unavailable = await inDndNow(prisma, allowed, params.now ?? new Date());
    return new Map(params.targetIds.map((id) => [id, unavailable.has(id)] as const));
  } catch {
    return hidden;
  }
}
