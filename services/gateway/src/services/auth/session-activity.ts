import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SessionActivity' });

/**
 * **La dernière activité d'une session avance, au plus une fois par quart
 * d'heure** (#9607).
 *
 * `lastActivityAt` n'avançait que si la requête portait `x-session-token` —
 * ce qu'aucun client inscrit n'envoie en REST — ou au rafraîchissement, que le
 * web n'appelle jamais : sur le web, « dernière activité » valait la date de
 * création. Et quand l'en-tête était là, la ligne était réécrite à CHAQUE
 * requête.
 *
 * La session se nomme désormais par le `sid` du JWT, et l'écriture est
 * ÉCHANTILLONNÉE à deux étages :
 *
 *  1. **En mémoire, par instance** : une session déjà touchée il y a moins de
 *     {@link SESSION_ACTIVITY_INTERVAL_MS} n'émet AUCUNE requête. C'est ce qui
 *     retire l'écriture du chemin de chaque requête.
 *  2. **En base, pour toutes les instances** : le `where` exige
 *     `lastActivityAt < maintenant − intervalle`. Une passerelle sans état peut
 *     tourner en plusieurs exemplaires ; chacun a sa mémoire, la base n'en a
 *     qu'une, et c'est elle qui tient « au plus une écriture par quart
 *     d'heure ». Le `where` exige aussi `isValid: true` (une session révoquée
 *     ne reprend pas vie dans la liste) et `userId` (défense en profondeur,
 *     comme `sessionLiveness`).
 *
 * L'écriture est DÉTACHÉE : la requête n'attend jamais la base. Un rejet est
 * rattrapé par `.catch` (loi du dépôt, leçon 230 — un rejet sans écouteur
 * termine le processus sous Node 22), et un appel qui lève avant même de
 * rendre sa promesse est rattrapé par le `try`.
 *
 * Une écriture perdue n'est pas retentée avant l'intervalle suivant : la
 * dernière activité est une indication pour la personne qui regarde ses
 * sessions, jamais une décision de sécurité. Rien ne la lit pour admettre ou
 * refuser.
 */
export const SESSION_ACTIVITY_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Le plafond de la mémoire d'échantillonnage. Une entrée est une clé de
 * vingt-quatre caractères et un nombre : cinquante mille entrées tiennent dans
 * quelques mégaoctets, et couvrent bien plus de sessions ACTIVES dans un quart
 * d'heure qu'une instance n'en sert. Au-delà, l'entrée la plus anciennement
 * touchée part — au pire, une écriture de trop, que la borne en base absorbe.
 */
export const MAX_TRACKED_SESSIONS = 50_000;

/** Ce que l'échantillonneur exige de `prisma.userSession` — rien de plus. */
export type SessionActivityWriter = {
  updateMany(args: {
    where: {
      id: string;
      userId: string;
      isValid: true;
      lastActivityAt: { lt: Date };
    };
    data: { lastActivityAt: Date };
  }): Promise<unknown>;
};

export type SessionActivityRef = {
  readonly userId: string;
  readonly sessionId: string;
};

export type SessionActivityOptions = {
  readonly now?: () => number;
  readonly intervalMs?: number;
  readonly maxTrackedSessions?: number;
};

export class SessionActivitySampler {
  private readonly lastWrite = new Map<string, number>();
  private readonly now: () => number;
  private readonly intervalMs: number;
  private readonly maxTracked: number;

  constructor(options: SessionActivityOptions = {}) {
    this.now = options.now ?? Date.now;
    this.intervalMs = options.intervalMs ?? SESSION_ACTIVITY_INTERVAL_MS;
    this.maxTracked = options.maxTrackedSessions ?? MAX_TRACKED_SESSIONS;
  }

  /**
   * Note l'activité de la session nommée. Rend `true` quand une écriture est
   * PARTIE (sans l'attendre), `false` quand l'échantillon l'a retenue.
   */
  touch(sessions: SessionActivityWriter, ref: SessionActivityRef): boolean {
    const now = this.now();
    const previous = this.lastWrite.get(ref.sessionId);
    if (previous !== undefined && now - previous < this.intervalMs) return false;

    this.remember(ref.sessionId, now);
    this.write(sessions, ref, now);
    return true;
  }

  /** Le nombre d'entrées retenues — la seule lecture de taille, pour les témoins. */
  trackedCount(): number {
    return this.lastWrite.size;
  }

  /**
   * `delete` avant `set` : `Map.set` sur une clé existante ne déplace pas son
   * rang d'insertion, et l'éviction par la tête partirait sinon sur une
   * session encore active (même piège que `rememberGeo`, #9239).
   */
  private remember(sessionId: string, at: number): void {
    this.lastWrite.delete(sessionId);
    while (this.lastWrite.size >= this.maxTracked) {
      const oldest = this.lastWrite.keys().next();
      if (oldest.done === true) break;
      this.lastWrite.delete(oldest.value);
    }
    this.lastWrite.set(sessionId, at);
  }

  private write(sessions: SessionActivityWriter, ref: SessionActivityRef, at: number): void {
    try {
      sessions
        .updateMany({
          where: {
            id: ref.sessionId,
            userId: ref.userId,
            isValid: true,
            lastActivityAt: { lt: new Date(at - this.intervalMs) },
          },
          data: { lastActivityAt: new Date(at) },
        })
        .catch((error: unknown) => {
          logger.warn('Dernière activité de session non écrite (best-effort)', { sessionId: ref.sessionId, error });
        });
    } catch (error) {
      logger.warn('Dernière activité de session non écrite (appel en échec)', { sessionId: ref.sessionId, error });
    }
  }
}

/**
 * L'échantillonneur PARTAGÉ du processus. La passerelle construit plusieurs
 * dizaines de middlewares d'authentification (un par famille de routes) ; une
 * mémoire par middleware multiplierait les écritures par leur nombre.
 */
export const sharedSessionActivity = new SessionActivitySampler();
