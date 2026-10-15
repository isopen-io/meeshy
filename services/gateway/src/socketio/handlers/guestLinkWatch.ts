import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MeeshySocket as Socket } from '../typed-socket';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { guardedTimeout } from '../../utils/guarded-timer.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { loadGuestShareLinkGate, SHARE_LINK_EXPIRED_CODE, type GuestShareLinkRow } from '../../services/shareLinkReadGate';
import { guestAccessEnd } from '../../services/guestAccessEnd';

const logger = enhancedLogger.child({ module: 'GuestLinkWatch' });

/** Le code du 410 REST d'un invité retiré (`middleware/auth.ts`), porté sur l'événement `error` du socket. */
export const GUEST_ACCESS_REVOKED_CODE = 'GUEST_ACCESS_REVOKED';

export function refuseExpiredGuestLink(socket: Socket): void {
  socket.emit(SERVER_EVENTS.ERROR, { message: 'This share link has expired', code: SHARE_LINK_EXPIRED_CODE });
  socket.disconnect(true);
}

/**
 * #10443 — la participation de l'invité n'est plus vivante (désactivée,
 * bannie, ou retirée). Le code est celui du 410 REST de l'invité retiré
 * (`middleware/auth.ts`, `GUEST_ACCESS_REVOKED`), que le SDK iOS lit aussi
 * sur l'événement `error` du socket (`GuestSessionEnd.from(socketErrorPayload:)`).
 * Un client qui ne le connaît pas (web à ce jour, anciens clients) le
 * traite en erreur ordinaire : la coupure suffit, la reconnexion est
 * refusée par la garde de connexion, et la prochaine requête REST rend le
 * 410 qu'il sait lire.
 */
export function refuseRevokedGuest(socket: Socket): void {
  socket.emit(SERVER_EVENTS.ERROR, { message: 'Guest access has been revoked', code: GUEST_ACCESS_REVOKED_CODE });
  socket.disconnect(true);
}

/**
 * #10440 — le minuteur du lien relit le lien au plus tard à cette cadence,
 * échéance ou non. Une échéance se MODIFIE après la connexion (l'hôte
 * l'écourte, en pose une sur un lien qui n'en avait pas) et le geste peut
 * avoir lieu sur une AUTRE instance de la passerelle que celle qui tient le
 * socket : un réarmement poussé depuis la route n'atteindrait que les
 * sockets locaux, et aucun minuteur distant. La relecture locale borne
 * l'écart partout, pour une lecture par socket invité toutes les cinq
 * minutes. Le REST, lui, relit le lien à chaque requête
 * (`middleware/auth.ts`), et une échéance déjà passée révoque sur-le-champ
 * (`applyShareLinkUpdate`).
 */
export const GUEST_LINK_RECHECK_MS = 5 * 60 * 1000;

/**
 * #10443 — la cadence porte une gigue de ±20 % : des sockets reconnectés
 * ENSEMBLE (redémarrage d'instance, retour du réseau) relisaient ensemble,
 * toutes les cinq minutes, à la même milliseconde.
 */
export function guestLinkRecheckDelayMs(random: () => number = Math.random): number {
  return Math.round(GUEST_LINK_RECHECK_MS * (0.8 + 0.4 * random()));
}

/**
 * Le minuteur de lien des sockets invités, extrait d'`AuthHandler` (#10443).
 * Un seul par socket : `schedule` remplace, `dispose` désarme.
 */
export class GuestLinkWatch {
  private readonly timers = new WeakMap<Socket, () => void>();

  constructor(private readonly prisma: PrismaClient) {}

  dispose(socket: Socket): void {
    this.timers.get(socket)?.();
  }

  /**
   * #10437 — une session invitée DÉJÀ connectée sort à l'échéance de son lien.
   * Même patron que `scheduleTokenExpiry` (`tokenExpiryWatch.ts`) (plafond du minuteur, désarmement
   * au `disconnect`), à une différence près : l'échéance d'un lien se MODIFIE
   * (l'hôte peut le prolonger ou l'écourter). Le minuteur ne coupe donc pas
   * sur la date lue à la connexion : il RELIT le lien quand il sonne — à
   * l'échéance connue, et au plus tard toutes les `GUEST_LINK_RECHECK_MS`
   * (#10440, à ±20 % près, #10443) —, coupe s'il est échu, et réarme sinon.
   * Il relit AUSSI la participation (#10443) : désactivée, bannie ou
   * introuvable, elle coupe avec `GUEST_ACCESS_REVOKED` — après le lien,
   * dans l'ordre unique des portes (`guestAccessEnd`, #10457). Un lien
   * INTROUVABLE n'est lu comme ouvert que tant que la participation vit : la route admin
   * `/maintenance/cleanup` désactive les invités puis supprime le lien sans
   * couper leurs sockets, et `fetchSockets` peut manquer une instance. Un
   * lien ou une participation ILLISIBLE (base indisponible) coupe aussi, mais SANS le code `SHARE_LINK_EXPIRED` :
   * le web et iOS lisent ce code comme la fin définitive de la session
   * d'invité (#10442) — un accroc de la base ne doit pas la leur coûter, et la
   * reconnexion repasse par la garde de connexion, fermée tant que le lien
   * reste illisible (audit adversarial de #10440). Couper suffit : la
   * reconnexion repasse par la garde de connexion
   * (`AuthHandler._authenticateAnonymousUser`), et le REST par
   * `middleware/auth.ts`. La ligne n'est PAS désactivée — un lien
   * prolongé rend l'accès, comme aux portes de lecture.
   *
   * #10440 — un socket parti pendant l'authentification n'arme rien (son
   * `disconnect` ne sonnera plus, le minuteur fuirait), et une
   * ré-authentification du même socket REMPLACE le minuteur au lieu d'en
   * empiler un second.
   */
  schedule(socket: Socket, guest: GuestShareLinkRow & { readonly id: string }, initialExpiresAt: Date | null): void {
    this.dispose(socket);
    if (socket.disconnected) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const dispose = () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socket.off?.('disconnect', dispose);
      if (this.timers.get(socket) === dispose) this.timers.delete(socket);
    };
    socket.on('disconnect', dispose);
    this.timers.set(socket, dispose);

    const arm = (expiresAt: Date | null) => {
      if (disposed) return;
      // +1 ms : `shareLinkHasExpired` est strict (`expiresAt < now`) — sonner
      // pile à l'échéance rendrait « pas encore », et réarmerait à 0 ms.
      const untilExpiry = expiresAt ? Math.max(expiresAt.getTime() - Date.now() + 1, 1) : Infinity;
      timer = guardedTimeout({
        name: 'socket-guest-link-expiry',
        afterMs: Math.min(untilExpiry, guestLinkRecheckDelayMs()),
        logger,
        run: () => recheck(),
      });
    };

    const recheck = async () => {
      if (disposed) return;
      const state = await Promise.all([
        loadGuestShareLinkGate(this.prisma, guest),
        this.prisma.participant.findFirst({
          where: { id: guest.id },
          select: { isActive: true, bannedAt: true, joinedAt: true },
        }),
      ]).catch((error: unknown) => {
        logger.warn('guest share link or participation unreadable at recheck — disconnecting (fail-closed)', { socketId: socket.id, error });
        return 'unreadable' as const;
      });
      if (disposed) return;
      if (state === 'unreadable') {
        socket.disconnect(true);
        return;
      }
      const [gate, participation] = state;
      const current = gate.expiresAt;
      // #10470 — la révocation DIFFÉRÉE d'un gros lien fermé coupe aussi.
      const end = guestAccessEnd({
        linkExpiresAt: current,
        linkRevocationPendingAt: gate.revocationPendingAt,
        linkIsActive: gate.isActive,
        linkMissing: gate.missing,
        participation,
        now: new Date(),
      });
      if (end === 'link-expired') {
        logger.info('guest share link expired while connected — disconnecting', { socketId: socket.id });
        refuseExpiredGuestLink(socket);
        return;
      }
      if (end === 'revoked') {
        logger.info('guest participation no longer live while connected — disconnecting', { socketId: socket.id });
        refuseRevokedGuest(socket);
        return;
      }
      arm(current);
    };

    arm(initialExpiresAt);
  }
}
