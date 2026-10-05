/**
 * Les sondes de la plateforme — LA source des chiffres de santé (#4219, #8876).
 *
 * Elles vivaient dans `routes/health/index.ts`, privées, et servaient deux
 * adresses S5 (`/health/metrics`, `/health/circuit-breakers`). La supervision de
 * l'administration (`GET /admin/monitoring`) doit afficher les MÊMES chiffres :
 * la composer en rappelant ces deux adresses par HTTP aurait coûté deux allers
 * retours et deux authentifications pour lire ce que le processus tient déjà en
 * mémoire. Les deux routes appellent donc ces fonctions — un seul site pour
 * savoir comment se mesure « la base répond » ou « ce disjoncteur est ouvert »,
 * donc aucune chance que deux écrans annoncent deux vérités.
 */
import type { FastifyInstance } from 'fastify';
import { getCacheStore } from '../CacheStore';
import { circuitBreakerManager } from '../../utils/circuitBreaker';

export type DependencyState = {
  readonly status: 'up' | 'down';
  readonly latencyMs: number | null;
};

export type ServedCircuitBreaker = {
  readonly name: string;
  readonly state: string;
  readonly failures: number;
  readonly successes: number;
  readonly totalRequests: number;
  readonly lastFailure: string | null;
};

type RawCommandClient = { $runCommandRaw: (cmd: Record<string, unknown>) => Promise<unknown> };

/**
 * Le ping de disponibilité. `$runCommandRaw({ ping: 1 })` plutôt qu'un
 * `count` : c'est la commande d'administration de MongoDB, elle ne lit aucune
 * collection et son coût ne croît pas avec la base.
 *
 * Rend la latence en millisecondes, ou `null` si la base ne répond pas. Le
 * message d'erreur du pilote porte l'hôte, le port et le nom de la base : il ne
 * remonte NULLE PART, les journaux du service le tiennent déjà.
 */
export async function pingBase(prisma: RawCommandClient): Promise<number | null> {
  const debut = Date.now();
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return Date.now() - debut;
  } catch {
    return null;
  }
}

export async function pingCache(): Promise<DependencyState> {
  const store = getCacheStore();
  if (!store.isAvailable()) return { status: 'down', latencyMs: null };
  const debut = Date.now();
  try {
    await store.get('health:probe');
    return { status: 'up', latencyMs: Date.now() - debut };
  } catch {
    return { status: 'down', latencyMs: null };
  }
}

export function baseState(latencyMs: number | null): DependencyState {
  return { status: latencyMs === null ? 'down' : 'up', latencyMs };
}

/**
 * Le nombre de connexions Socket.IO, s'il est lisible. Le décorateur
 * `socketIOHandler` n'existe qu'une fois `setupSocketIO()` passé, et le
 * harnais de la garde de routes le décore avec un objet NU : sonder la
 * méthode plutôt que l'objet évite de faire dépendre une route REST de
 * l'ordre d'amorçage du serveur.
 */
export function countConnections(fastify: FastifyInstance): number {
  const handler = (fastify as unknown as { socketIOHandler?: { getConnectedUsers?: () => string[] } }).socketIOHandler;
  if (typeof handler?.getConnectedUsers !== 'function') return 0;
  try {
    return handler.getConnectedUsers().length;
  } catch {
    return 0;
  }
}

/**
 * L'état des disjoncteurs, tel qu'il vit déjà en mémoire. Aucun état n'est
 * fabriqué ici : `circuitBreakerManager` est le registre. Un disjoncteur qui n'y
 * est pas ENREGISTRÉ reste invisible — la table sert ce que le registre tient,
 * jamais une liste écrite à la main.
 */
export function servedCircuitBreakers(): ServedCircuitBreaker[] {
  return Object.entries(circuitBreakerManager.getAllStats()).map(([name, s]) => ({
    name,
    state: s.state,
    failures: s.failures,
    successes: s.successes,
    totalRequests: s.totalRequests,
    // L'écran lit une date, le registre tient un epoch : la conversion vit
    // ici, du côté qui CONNAÎT l'unité, jamais chez le lecteur.
    lastFailure: s.lastFailureTime ? new Date(s.lastFailureTime).toISOString() : null,
  }));
}
