import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { loadLiveAudience } from '../../socketio/conversationAudienceRooms';
import { loadPrivacyPreferencesCached } from '../preferences/privacy-cache';

/**
 * Au-delà, « aucun destinataire n'a coupé ses accusés » ne se prouve pas : le
 * feu est retenu.
 *
 * Il est CENT FOIS plus bas que `LIVE_AUDIENCE_SCAN_CAP`, et c'est la raison
 * d'être du paramètre `cap` (#20020) : ce site rend un verdict UNIVERSEL, donc
 * une lecture tronquée ne lui apprend RIEN, là où une diffusion tronquée
 * atteint encore ceux qu'elle a nommés. Le plafond n'est pas une préférence de
 * coût, c'est la portée de ce qu'une lecture peut prouver.
 */
export const EARLY_BURN_GATE_SCAN_CAP = 500;

/**
 * Le feu anticipé d'une flamme-œil dit à l'expéditeur QUAND le dernier lecteur
 * a lu puis quitté : c'est un accusé de lecture. Il n'a lieu que si aucun
 * destinataire vivant n'a coupé les siens (`showReadReceipts === false`, même
 * résolveur et même cache que `MessageReadStatusService`). Une lecture qui lève
 * le retient : l'expéditeur garde alors le comportement d'avant (#18556).
 */
export async function earlyBurnMayReachSender(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly senderParticipantId: string;
  readonly onError?: (error: unknown) => void;
}): Promise<boolean> {
  try {
    // #20020 — la borne, la sonde excédentaire et le verdict de complétude
    // vivent dans `loadLiveAudience`, qui est le seul endroit du dépôt où cette
    // question s'écrit. Ce site les réécrivait à l'identique, à son plafond
    // près — et `complete === false` dit exactement ce que son `rows.length >
    // cap` disait, plus la PANNE, que son `catch` traitait déjà pareil.
    const audience = await loadLiveAudience(params.prisma, params.conversationId, {
      cap: EARLY_BURN_GATE_SCAN_CAP,
      scanLabel: 'early-burn-gate',
      onError: params.onError,
    });
    if (!audience.complete) return false;
    const rows = audience.targets;
    const userIds = [
      ...new Set(
        rows
          .filter((row) => row.id !== params.senderParticipantId)
          .flatMap((row) => (row.userId ? [row.userId] : [])),
      ),
    ];
    if (userIds.length === 0) return true;
    const stored = await loadPrivacyPreferencesCached(params.prisma, userIds);
    return userIds.every((userId) => stored.get(userId)?.showReadReceipts !== false);
  } catch (error) {
    // Ce `catch` ne garde plus la lecture d'audience — qui ne lève pas et
    // nomme sa panne par `onError` — mais la lecture des PRÉFÉRENCES, qui
    // lève. Les deux retiennent le feu, pour la même raison.
    params.onError?.(error);
    return false;
  }
}
