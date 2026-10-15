/**
 * FERMER un lien de partage et en retirer les invités — sans que le geste de
 * l'hôte porte la révocation d'un gros lien (#10470).
 *
 * `revokeShareLinkGuests` évince invité par invité (écriture, annonce, appel,
 * room, socket) : ~5 ms par invité, donc ~5 s pour 1 000 invités et ~50 s pour
 * 10 000 — au-delà du délai d'un client (60 s sur iOS), et c'est le lien
 * World Wide qui en a le plus.
 *
 * Deux régimes, départagés par le nombre d'invités ACTIFS du lien :
 *
 * - **Jusqu'au seuil** : l'ordre historique — révoquer, PUIS fermer. Une
 *   révocation qui lève laisse le lien ouvert, et la reprise est idempotente.
 * - **Au-delà** : le lien est fermé TOUT DE SUITE (plus aucune admission), et
 *   la révocation EN ATTENTE s'écrit DANS la même écriture
 *   (`guestRevocationPendingAt`). Elle tourne ensuite hors de la requête ; un
 *   échec ou un redémarrage la laisse marquée, et le balayage horaire
 *   (`ExpiredShareLinksCleanupService`) la reprend. Rien n'est perdu entre la
 *   réponse et l'éviction : la marque est posée avant que la requête ne rende.
 *
 * La réponse de l'hôte ne change pas de forme ni de statut : un ancien client
 * lit le même 200 (règle de rétrocompatibilité, #9223).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { revokeShareLinkGuests, type GuestSocketRegistry } from './revokeShareLinkGuests';
import { shareLinkActiveGuestsWhere } from './shareLinkGuestsWhere';
import type { DepartedMemberEphemeralState } from './endConversationMembership';
import { enhancedLogger } from '../utils/logger-enhanced';
import { guardedTimeout } from '../utils/guarded-timer';
import { pendingRevocationAdmissionCutoff } from '../services/guestAccessEnd';

const logger = enhancedLogger.child({ module: 'CloseShareLinkRevokingGuests' });

/** Au-delà, la révocation part hors de la requête (~1 s d'éviction en série). */
export const ASYNC_GUEST_REVOCATION_THRESHOLD = 200;

/**
 * Audit de #10470 — une révocation différée qui échoue (registre de sockets
 * muet, pool saturé) est relancée après ces délais, sans attendre le balayage
 * horaire : les invités déjà écrits inactifs restaient sinon dans la room une
 * heure. Au-delà, la marque reste et le balayage la reprend.
 */
export const DEFERRED_REVOCATION_RETRY_MS: readonly number[] = [60_000, 5 * 60_000];

/** Ce que la fermeture écrit en plus quand la révocation est différée. */
export type ShareLinkClosureMark = { readonly guestRevocationPendingAt?: Date };

type RevocationLive = {
  readonly prisma: PrismaClient;
  readonly io: GuestSocketRegistry | null | undefined;
  readonly manager: DepartedMemberEphemeralState | null | undefined;
  readonly shareLinkId: string;
};

export type ShareLinkClosure<T> = RevocationLive & {
  /** L'écriture qui ferme le lien ; elle FUSIONNE la marque dans ses `data`. */
  readonly close: (mark: ShareLinkClosureMark) => Promise<T>;
  readonly detach?: (task: () => Promise<void>) => void;
  readonly now?: () => Date;
};

const detachTask = (task: () => Promise<void>): void => {
  void task().catch((error: unknown) => logger.error('deferred guest revocation crashed', error as Error));
};

export async function closeShareLinkRevokingGuests<T>(
  closure: ShareLinkClosure<T>
): Promise<{ readonly result: T; readonly revocation: 'done' | 'deferred' }> {
  const { prisma, shareLinkId, close } = closure;
  const activeGuests = await prisma.participant.count({ where: shareLinkActiveGuestsWhere(shareLinkId) });

  if (activeGuests <= ASYNC_GUEST_REVOCATION_THRESHOLD) {
    await revokeShareLinkGuests(closure);
    return { result: await close({}), revocation: 'done' };
  }

  const pendingSince = (closure.now ?? (() => new Date()))();
  const result = await close({ guestRevocationPendingAt: pendingSince });
  (closure.detach ?? detachTask)(() => runWithRetries({ ...closure, pendingSince }, 0));
  return { result, revocation: 'deferred' };
}

async function runWithRetries(
  params: RevocationLive & { readonly pendingSince: Date },
  attempt: number
): Promise<void> {
  if (await runPendingGuestRevocation(params)) return;
  const delay = DEFERRED_REVOCATION_RETRY_MS[attempt];
  if (delay === undefined) return;
  const timer = guardedTimeout({
    name: 'deferred-guest-revocation-retry',
    run: () => runWithRetries(params, attempt + 1),
    afterMs: delay,
    logger,
  });
  timer.unref?.();
}

/**
 * Exécute une révocation en attente et lève sa marque — rend `false` sans
 * lever si elle échoue : la marque reste, le balayage la reprendra. La marque
 * ne tombe que si c'est CELLE-CI (une fermeture plus récente en a posé une
 * autre, qui garde son propre cours).
 */
export async function runPendingGuestRevocation(
  params: RevocationLive & { readonly pendingSince: Date }
): Promise<boolean> {
  const { prisma, shareLinkId, pendingSince } = params;
  try {
    // Audit de #10470 — tant que le lien reste FERMÉ, tous ses invités actifs
    // partent, y compris celui dont la réservation a précédé la fermeture et la
    // création a suivi la marque. Bornée par la marque seulement si le lien a
    // été ROUVERT : ses nouveaux venus restent. #10492 — la borne porte la
    // marge d'horloge de la garde commune : les deux retirent les mêmes invités.
    const link = await prisma.conversationShareLink.findUnique({
      where: { id: shareLinkId },
      select: { isActive: true },
    });
    const admittedUntil = link?.isActive === true ? pendingRevocationAdmissionCutoff(pendingSince) : undefined;
    await revokeShareLinkGuests({ ...params, revokedAt: pendingSince, admittedUntil });
    await prisma.conversationShareLink.updateMany({
      where: { id: shareLinkId, guestRevocationPendingAt: pendingSince },
      data: { guestRevocationPendingAt: null },
    });
    return true;
  } catch (error) {
    logger.warn('deferred guest revocation failed — left pending for the sweep', { shareLinkId, error });
    return false;
  }
}
