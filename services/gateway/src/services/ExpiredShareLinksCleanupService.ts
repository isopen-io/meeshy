import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { revokeShareLinkGuests, type GuestSocketRegistry } from '../socketio/revokeShareLinkGuests';
import type { DepartedMemberEphemeralState } from '../socketio/endConversationMembership';

const log = enhancedLogger.child({ module: 'ExpiredShareLinksCleanupService' });

/**
 * Le balayage qui REVOQUE ce qu'un lien de partage EXPIRÉ a cessé d'autoriser.
 *
 * `revokeShareLinkGuests` (#4194/#4196) a fermé la moitié GESTE de la
 * révocation : désactiver ou supprimer un lien retire désormais réellement
 * ses invités (livraison temps réel, droit d'écriture, appel en cours,
 * position vive). `ConversationShareLink.expiresAt` est l'autre moitié, et
 * elle n'est le geste de personne — aucune route ne la franchit, elle
 * survient toute seule. Sans ce balayage, un invité entré avant l'échéance
 * gardait sa socket dans `ROOMS.conversation(...)` indéfiniment après elle :
 * seule `POST /anonymous/session/refresh` relit l'échéance, donc le sort
 * d'un invité dépendait de si son client appelait ce rafraîchissement.
 *
 * ─── Ce que ce balayage fait, et par quelle unité ───────────────────────────
 *
 * Pour chaque lien actif dont `expiresAt` est passé : appeler
 * `revokeShareLinkGuests` (l'unité qui clôt l'appartenance, éteint le vivant
 * et coupe la socket — voir son en-tête pour l'ordre et sa raison), puis
 * poser `isActive: false`. Aucune des deux étapes n'est recopiée ici : une
 * SIXIÈME copie de la révocation serait exactement la dérive que l'unité a
 * été écrite pour éviter.
 *
 * ─── Les deux questions que l'issue laissait ouvertes ───────────────────────
 *
 * 1. **`isActive` bascule-t-il au passage, ou l'échéance suffit-elle comme
 *    fait ?** Les deux portes d'authentification (`middleware/auth.ts`,
 *    `AuthHandler`) ne relisent que `Participant.isActive`, jamais le lien —
 *    poser `isActive: false` ne referme donc rien de plus que ce que
 *    `revokeShareLinkGuests` vient de faire. La raison de le poser quand même
 *    est ailleurs : un lien expiré qui reste `isActive: true` resterait
 *    candidat à CHAQUE passe, pour toujours — le prédicat ci-dessous
 *    n'apparierait jamais moins de liens que la veille. Le flip fait aussi
 *    converger l'état affiché à l'admin (`GET`/`PATCH` sur les liens) avec
 *    celui d'un lien fermé à la main.
 * 2. **Rattrapage au démarrage ?** Oui — même patron que
 *    `ExpiredStoriesCleanupService`/`ExpiredMessagesCleanupService` : une
 *    passe immédiate à `start()`, l'arriéré accumulé pendant que le service
 *    était arrêté étant précisément celui qui a le plus dépassé son
 *    échéance.
 *
 * ─── La période ─────────────────────────────────────────────────────────────
 *
 * L'échéance d'un lien se compte en heures, pas en secondes (contrairement à
 * un message éphémère, dont la plus courte durée offerte est 30 s) : un
 * balayage HORAIRE, comme celui des stories, borne la fenêtre résiduelle au
 * même ordre de grandeur que ce qu'elle protège, sans réinterroger la base à
 * la minute pour une classe d'échéance qui ne se compte jamais en dessous de
 * l'heure côté produit.
 *
 * ─── Résilience ──────────────────────────────────────────────────────────────
 *
 * Best-effort par lien : un lien dont la révocation échoue (panne Mongo,
 * socket déjà éteinte, etc.) n'empêche pas les autres d'être traités, et
 * reste `isActive: true` — donc repris à la passe suivante. Aucun état n'est
 * jamais perdu par un échec partiel.
 */

interface ExpiredShareLinkRow {
  id: string;
}

export interface ExpiredShareLinksCleanupOptions {
  /** Liens balayés par passe. */
  batchSize?: number;
  /** Injecté par les tests — une passe doit lire UNE seule fois l'horloge. */
  now?: () => Date;
  /**
   * Résolus à CHAQUE passe, jamais capturés : ce service est construit au
   * démarrage, avant que le manager Socket.IO n'existe. Une capture par
   * constructeur retiendrait `null` pour toujours.
   */
  resolveIO?: () => GuestSocketRegistry | null | undefined;
  resolveManager?: () => DepartedMemberEphemeralState | null | undefined;
}

export const EXPIRED_SHARE_LINKS_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export class ExpiredShareLinksCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly now: () => Date;
  private readonly resolveIO: () => GuestSocketRegistry | null | undefined;
  private readonly resolveManager: () => DepartedMemberEphemeralState | null | undefined;

  constructor(
    private prisma: PrismaClient,
    options: ExpiredShareLinksCleanupOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 200;
    this.now = options.now ?? (() => new Date());
    this.resolveIO = options.resolveIO ?? (() => null);
    this.resolveManager = options.resolveManager ?? (() => null);
  }

  start(intervalMs: number = EXPIRED_SHARE_LINKS_SWEEP_INTERVAL_MS): void {
    void this.cleanup().catch((err) => log.warn('initial sweep failed', { err }));
    this.interval = setInterval(() => {
      void this.cleanup().catch((err) => log.warn('scheduled sweep failed', { err }));
    }, intervalMs);
    this.interval.unref?.();
    log.info('expired-share-links sweep started', { intervalMs, batchSize: this.batchSize });
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async cleanup(): Promise<{ revokedLinks: number; revokedGuests: number }> {
    const now = this.now();

    let candidates: ExpiredShareLinkRow[];
    try {
      candidates = await this.prisma.conversationShareLink.findMany({
        where: {
          isActive: true,
          expiresAt: { not: null, lt: now },
        },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: this.batchSize,
      });
    } catch (err) {
      log.warn('expired-share-links query failed', { err });
      return { revokedLinks: 0, revokedGuests: 0 };
    }

    if (candidates.length === 0) return { revokedLinks: 0, revokedGuests: 0 };

    const io = this.resolveIO();
    const manager = this.resolveManager();

    let revokedLinks = 0;
    let revokedGuests = 0;
    for (const link of candidates) {
      try {
        const revoked = await revokeShareLinkGuests({
          prisma: this.prisma,
          io,
          manager,
          shareLinkId: link.id,
          revokedAt: now,
        });
        revokedGuests += revoked.length;

        // Posé APRÈS la révocation, jamais avant : un lien dont la révocation
        // échoue garde `isActive: true` et reste apparié à la passe suivante.
        await this.prisma.conversationShareLink.update({
          where: { id: link.id },
          data: { isActive: false },
        });
        revokedLinks += 1;
      } catch (err) {
        log.warn('expired share link revocation failed', { shareLinkId: link.id, err });
      }
    }

    if (candidates.length === this.batchSize) {
      log.info('expired-share-links batch saturated, backlog remains for the next pass', {
        batchSize: this.batchSize,
      });
    }

    log.info('expired-share-links swept', { revokedLinks, revokedGuests });
    return { revokedLinks, revokedGuests };
  }
}
