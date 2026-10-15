import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { revokeShareLinkGuests, type GuestSocketRegistry } from '../socketio/revokeShareLinkGuests';
import { runPendingGuestRevocation } from '../socketio/closeShareLinkRevokingGuests';
import type { DepartedMemberEphemeralState } from '../socketio/endConversationMembership';
import { guardedInterval } from '../utils/guarded-timer';

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

type PendingRevocationRow = { id: string; guestRevocationPendingAt: Date | null };

const OBJECT_ID = /^[0-9a-f]{24}$/i;
const isObjectId = (id: unknown): id is string => typeof id === 'string' && OBJECT_ID.test(id);

/** Les invités dont seule la session embarquée porte le lien se lisent par pages. */
const EMBEDDED_LINK_SCAN_PAGE = 500;

/**
 * Le disjoncteur du relevé des invités d'un lien disparu (#10492). Jusqu'à
 * `alwaysAllowed` liens absents, la passe relève : c'est le cas nominal, un
 * lien purgé qui laisse quelques invités. Au-delà, elle s'arrête dès que les
 * absents dépassent `maxMissing`, ou `maxShare` des liens que des invités
 * tiennent. Une collection de liens VIDE arrête toujours.
 */
export const MISSING_SHARE_LINKS_BREAKER = { alwaysAllowed: 3, maxMissing: 20, maxShare: 0.5 } as const;

export function missingShareLinksBreakerTrips(counts: {
  readonly totalLinks: number;
  readonly held: number;
  readonly missing: number;
}): boolean {
  if (counts.totalLinks === 0) return true;
  if (counts.missing <= MISSING_SHARE_LINKS_BREAKER.alwaysAllowed) return false;
  if (counts.missing > MISSING_SHARE_LINKS_BREAKER.maxMissing) return true;
  return counts.missing > counts.held * MISSING_SHARE_LINKS_BREAKER.maxShare;
}

/** `size` identifiants triés à partir de celui qui suit `cursor`, en repartant du début. */
function rotatingBatch(sortedIds: readonly string[], cursor: string | null, size: number): string[] {
  if (!cursor) return sortedIds.slice(0, size);
  const after = sortedIds.filter((id) => id > cursor);
  return [...after, ...sortedIds.filter((id) => id <= cursor)].slice(0, size);
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
  private running = false;
  private pendingCursor: string | null = null;
  private missingCursor: string | null = null;
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
    this.interval = guardedInterval({ name: 'expired-share-links-cleanup', everyMs: intervalMs, logger: log, run: () => {
      void this.cleanup().catch((err) => log.warn('scheduled sweep failed', { err }));
    } });
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
    // #10470 (R3) — un balayage lent (registre de sockets muet) ne se fait
    // pas doubler par le suivant : deux passes sur les mêmes liens doubleraient
    // le coût sans rien évincer de plus.
    if (this.running) {
      log.info('expired-share-links sweep already running, this pass is skipped');
      return { revokedLinks: 0, revokedGuests: 0 };
    }
    this.running = true;
    try {
      const swept = await this.revokeExpiredLinks();
      await this.resumePendingRevocations();
      await this.revokeGuestsOfMissingLinks();
      return swept;
    } finally {
      this.running = false;
    }
  }

  /**
   * #10470 — les révocations DIFFÉRÉES d'un gros lien fermé sans les attendre,
   * restées marquées (échec, redémarrage) : reprises ici, chacune à sa date.
   *
   * #10492 — par fournées TOURNANTES, dans l'ordre des identifiants : une
   * fournée saturée laisse son curseur, et la passe suivante repart après lui.
   * Triée par date et relue depuis le début, une fournée entière de liens en
   * échec permanent affamait tous les plus récents.
   */
  private async resumePendingRevocations(): Promise<void> {
    let pending: PendingRevocationRow[];
    try {
      pending = await this.nextPendingRevocations();
    } catch (err) {
      log.warn('pending guest revocations query failed', { err });
      return;
    }
    this.pendingCursor = pending.length === this.batchSize ? pending[pending.length - 1].id : null;

    for (const link of pending) {
      if (!link.guestRevocationPendingAt) continue;
      await runPendingGuestRevocation({
        prisma: this.prisma,
        io: this.resolveIO(),
        manager: this.resolveManager(),
        shareLinkId: link.id,
        pendingSince: link.guestRevocationPendingAt,
      });
    }
  }

  private async nextPendingRevocations(): Promise<PendingRevocationRow[]> {
    const page = (id: { gt: string } | { lte: string } | undefined, take: number) =>
      this.prisma.conversationShareLink.findMany({
        where: { guestRevocationPendingAt: { not: null }, ...(id ? { id } : {}) },
        select: { id: true, guestRevocationPendingAt: true },
        orderBy: { id: 'asc' },
        take,
      });
    const cursor = this.pendingCursor;
    if (!cursor) return page(undefined, this.batchSize);

    const afterCursor = await page({ gt: cursor }, this.batchSize);
    if (afterCursor.length === this.batchSize) return afterCursor;
    return [...afterCursor, ...(await page({ lte: cursor }, this.batchSize - afterCursor.length))];
  }

  /**
   * #10492 — les invités ACTIFS dont le lien n'existe plus. Toute suppression
   * de lien révoque d'abord ses invités ; ceux qui lui survivent (purge
   * d'avant cette règle, purge interrompue, admission en vol) sont déjà
   * refusés par la garde commune, et relevés ici pour sortir de la room.
   *
   * Le lien d'un invité se lit comme la garde et la révocation le lisent : la
   * colonne de la participation, et la session embarquée en repli. Seuls les
   * invités ANONYMES sont lus : un inscrit entré par lien reste membre.
   *
   * Une révocation ne se défait pas, et une ABSENCE n'est pas une preuve :
   * une collection de liens vide ou partielle (restauration en cours,
   * mauvaise base) rend chaque lien « introuvable » sans aucune erreur. Le
   * disjoncteur (`MISSING_SHARE_LINKS_BREAKER`) ne laisse donc passer qu'une
   * absence marginale ; au-delà, la passe journalise en erreur et ne révoque
   * personne. Chaque lien retenu est encore relu SEUL avant sa révocation.
   */
  private async revokeGuestsOfMissingLinks(): Promise<void> {
    let missing: string[];
    try {
      const heldIds = await this.shareLinkIdsHeldByActiveGuests();
      if (heldIds.length === 0) return;
      const [totalLinks, found] = await Promise.all([
        this.prisma.conversationShareLink.count(),
        this.prisma.conversationShareLink.findMany({ where: { id: { in: heldIds } }, select: { id: true } }),
      ]);
      const foundIds = new Set(found.map((link) => link.id));
      missing = heldIds.filter((id) => !foundIds.has(id)).sort();
      if (missing.length === 0) return;
      if (missingShareLinksBreakerTrips({ totalLinks, held: heldIds.length, missing: missing.length })) {
        log.error('guests of missing share links NOT revoked: too many links are missing to trust the read', undefined, {
          totalLinks,
          heldLinks: heldIds.length,
          missingLinks: missing.length,
        });
        return;
      }
    } catch (err) {
      log.warn('guests of missing share links query failed', { err });
      return;
    }

    const batch = rotatingBatch(missing, this.missingCursor, this.batchSize);
    this.missingCursor = missing.length > this.batchSize ? batch[batch.length - 1] : null;

    const now = this.now();
    for (const shareLinkId of batch) {
      try {
        const reread = await this.prisma.conversationShareLink.findUnique({
          where: { id: shareLinkId },
          select: { id: true },
        });
        if (reread) continue;
        const revoked = await revokeShareLinkGuests({
          prisma: this.prisma,
          io: this.resolveIO(),
          manager: this.resolveManager(),
          shareLinkId,
          revokedAt: now,
        });
        log.info('guests of a missing share link revoked', { shareLinkId, revokedGuests: revoked.length });
      } catch (err) {
        log.warn('revocation of the guests of a missing share link failed', { shareLinkId, err });
      }
    }
  }

  private async shareLinkIdsHeldByActiveGuests(): Promise<string[]> {
    const byColumn = await this.prisma.participant.groupBy({
      by: ['shareLinkId'],
      where: { type: 'anonymous', isActive: true, shareLinkId: { not: null } },
    });
    const held = new Set(byColumn.map((group) => group.shareLinkId).filter(isObjectId));

    let cursor: string | undefined;
    for (;;) {
      const page: Array<{ id: string; anonymousSession: { shareLinkId: string } | null }> =
        await this.prisma.participant.findMany({
          where: {
            type: 'anonymous',
            isActive: true,
            anonymousSession: { isSet: true },
            OR: [{ shareLinkId: null }, { shareLinkId: { isSet: false } }],
            ...(cursor ? { id: { gt: cursor } } : {}),
          },
          select: { id: true, anonymousSession: { select: { shareLinkId: true } } },
          orderBy: { id: 'asc' },
          take: EMBEDDED_LINK_SCAN_PAGE,
        });
      page.map((row) => row.anonymousSession?.shareLinkId).filter(isObjectId).forEach((id) => held.add(id));
      if (page.length < EMBEDDED_LINK_SCAN_PAGE) break;
      cursor = page[page.length - 1].id;
    }
    return [...held];
  }

  private async revokeExpiredLinks(): Promise<{ revokedLinks: number; revokedGuests: number }> {
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
