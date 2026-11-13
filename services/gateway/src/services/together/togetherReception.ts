/**
 * RECEVOIR des invitations « ensemble » (#17023) — une préférence de RÉCEPTION de l'invité,
 * active par défaut, comme le Bring et le talkie : coupée pour CET hôte (`togetherBlockedAt`
 * sur la ligne de réglages que l'invité pose pour lui) ou pour tous
 * (`notification.togetherEnabled`), l'invitation ne part pas.
 *
 * Elle gouverne l'INVITATION, pas la séance : une séance que l'invité a rejointe continue
 * jusqu'à ce que l'un la quitte. C'est pourquoi elle n'entre pas dans le consentement de la
 * loi d'accès (`RELATION_CONSENT_FEATURES`), que chaque synchronisation rejuge.
 *
 * Et une paire ne s'invite pas en rafale : `TOGETHER_INVITES_PER_PAIR` invitations ENVOYÉES
 * par `TOGETHER_INVITES_WINDOW_SECONDS`, d'un hôte vers un même invité. Le compteur ne garde
 * que des instants, sous un nom qui ne dit ni l'hôte ni l'invité. Il n'est pas atomique entre
 * instances : deux invitations simultanées sur deux instances peuvent dépasser la borne d'une
 * unité, ce qu'une rafale ne peut pas répéter.
 *
 * Tout refus rend le verdict de la porte (`NOT_ALLOWED`) : l'hôte n'apprend ni qu'on l'a coupé,
 * ni qu'il a trop invité. Une lecture qui échoue LÈVE : le relais ferme (`UNAVAILABLE`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { TOGETHER_INVITES_PER_PAIR, TOGETHER_INVITES_WINDOW_SECONDS } from '@meeshy/shared/types/together';
import { togetherInviteBudgetKey, type TogetherCache } from './togetherStore';

export type TogetherReceptionDb = Pick<PrismaClient, 'relationFeatureSetting' | 'userPreferences'>;

export type TogetherInvitePair = { readonly hostId: string; readonly guestId: string };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** L'invité reçoit-il les invitations de cet hôte ? Absent partout ⇒ oui. */
export async function guestReceivesInvitesFrom(prisma: TogetherReceptionDb, pair: TogetherInvitePair): Promise<boolean> {
  const [setting, prefs] = await Promise.all([
    prisma.relationFeatureSetting.findFirst({
      where: { ownerId: pair.guestId, otherId: pair.hostId },
      select: { togetherBlockedAt: true },
    }),
    prisma.userPreferences.findUnique({ where: { userId: pair.guestId }, select: { notification: true } }),
  ]);
  const notification = isRecord(prefs?.notification) ? prefs.notification : {};
  return notification.togetherEnabled !== false && !setting?.togetherBlockedAt;
}

const instantsOf = (raw: string | null, since: number): readonly number[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((at): at is number => typeof at === 'number' && at > since) : [];
  } catch {
    return [];
  }
};

/**
 * Prend une place dans la fenêtre de la paire ; `false` quand elle est pleine (rien n'est écrit).
 * À appeler APRÈS la porte : une invitation refusée ne consomme rien.
 */
export async function takeTogetherInviteSlot(cache: TogetherCache, pair: TogetherInvitePair, now: number): Promise<boolean> {
  const key = togetherInviteBudgetKey(pair.hostId, pair.guestId);
  const recent = instantsOf(await cache.get(key), now - TOGETHER_INVITES_WINDOW_SECONDS * 1000);
  if (recent.length >= TOGETHER_INVITES_PER_PAIR) return false;
  await cache.set(key, JSON.stringify([...recent, now]), TOGETHER_INVITES_WINDOW_SECONDS);
  return true;
}
