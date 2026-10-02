import { CallStatus, type PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_HEARTBEAT_TIMEOUT_MS, CALL_REJOIN_GRACE_MS } from '@meeshy/shared/types/call-rules';
import { CALL_ERROR_CODES } from '@meeshy/shared/types/video-call';

/**
 * **REVENIR DANS UN APPEL EN COURS** (#9111) — ce que la passerelle accorde à
 * un participant coupé (réseau, plantage, relance de l'app) ou parti.
 *
 * La grâce de reprise est la règle partagée `CALL_REJOIN_GRACE_MS` : les
 * clients ne raccrochent jamais avant elle. Elle se prolonge par tranches de
 * 15 s tant que l'utilisateur garde une socket vivante ailleurs (le
 * `call:join` de sa reconnexion arrive — chaos-test prod 2026-07-02, un retour
 * à 18 s d'un appel dont les deux médias étaient sains), sans jamais dépasser
 * le silence au-delà duquel le nettoyage par battements le déclarerait perdu.
 */
export const DISCONNECT_GRACE_MS = CALL_REJOIN_GRACE_MS;
export const GRACE_EXTENSION_MS = 15_000;
export const MAX_GRACE_EXTENSIONS = Math.floor((CALL_HEARTBEAT_TIMEOUT_MS - DISCONNECT_GRACE_MS) / GRACE_EXTENSION_MS);

const LIVE_STATUSES = [CallStatus.initiated, CallStatus.ringing, CallStatus.connecting, CallStatus.active, CallStatus.reconnecting] as const;

type JoinRow = {
  readonly leftAt?: Date | null;
  readonly joinedAt?: Date | null;
  readonly participantId: string;
  readonly participant?: { readonly userId?: string | null } | null;
};

/**
 * Celui qui (re)joint était déjà DANS cet appel décroché : une ligne quittée,
 * ou une ligne vivante d'avant ce `call:join` (retour dans la grâce). Son
 * ancien lien est mort avec sa socket : l'offre gardée pour lui appartient à
 * ce lien-là, et la lui rejouer ferait négocier un fantôme pendant que les
 * membres lui offrent à neuf sur `call:participant-joined`.
 *
 * Un appel jamais décroché garde le rejeu : c'est le cas pour lequel il
 * existe (l'appelé réveillé par PushKit pendant la sonnerie, §4.6).
 */
export function isCallRevenant(opts: {
  readonly answeredAt?: Date | null;
  readonly rows: readonly JoinRow[];
  readonly userId: string;
  readonly joinStartedAt: Date;
}): boolean {
  if (!opts.answeredAt) return false;
  return opts.rows.some(
    (row) =>
      (row.participant?.userId ?? row.participantId) === opts.userId &&
      (Boolean(row.leftAt) || (row.joinedAt != null && row.joinedAt.getTime() < opts.joinStartedAt.getTime()))
  );
}

/**
 * Le refus `CALL_ALREADY_ACTIVE` dit QUEL appel est en cours : le client le
 * rejoint au lieu d'échouer (un revenant qui touche « Appeler »).
 */
export async function alreadyActiveCallDetails(
  prisma: Pick<PrismaClient, 'callSession'>,
  code: string,
  conversationId: unknown
): Promise<{ activeCallId?: string }> {
  if (code !== CALL_ERROR_CODES.CALL_ALREADY_ACTIVE || typeof conversationId !== 'string') return {};
  try {
    const live = await prisma.callSession.findFirst({
      where: { conversationId, status: { in: [...LIVE_STATUSES] } },
      orderBy: { startedAt: 'desc' },
      select: { id: true }
    });
    return live ? { activeCallId: live.id } : {};
  } catch {
    return {};
  }
}
