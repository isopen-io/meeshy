import { randomUUID } from 'crypto';
import type { CacheStore } from './CacheStore';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'GatewayInstanceCensus' });

/**
 * LA CONDITION « PROCESSUS UNIQUE », VÉRIFIÉE ET NON SUPPOSÉE (#19947).
 *
 * #19827 garde dans le tas, en clair, l'entrée hors ligne qu'un refus de
 * scellement transitoire n'a pas pu sceller. Elle ne se rejoue que si la
 * reconnexion du destinataire tombe sur CE processus : avec deux répliques, la
 * reconnexion peut tomber sur l'autre, et l'on paie la rétention du clair sans
 * obtenir la livraison qu'elle achète. Décision :
 * `decisions/2026-11-27-garder-dans-le-tas-exige-une-instance-unique-attestee-19947.md`.
 *
 * Chaque instance pose `gateway:instance:<id>` avec un TTL et recompte les clés
 * vivantes à chaque battement. L'instance est unique si et seulement si le
 * dernier recensement est FRAIS, n'a vu qu'elle, et qu'aucun déploiement ne
 * DÉCLARE plusieurs répliques (`GATEWAY_INSTANCES`). Tout le reste — avant le
 * premier battement, Redis absent, battement en échec, recensement périmé —
 * n'atteste rien, et la file ne garde pas.
 */
export type SoleInstanceWitness = { readonly isSoleInstance: () => boolean };

/** Le défaut de la file : sans témoin câblé, l'instance unique n'est pas attestée. */
export const UNVERIFIED_SOLE_INSTANCE: SoleInstanceWitness = { isSoleInstance: () => false };

export type InstanceCensusClient = {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  scan(cursor: string, match: 'MATCH', pattern: string, count: 'COUNT', size: number): Promise<[string, string[]]>;
  del(key: string): Promise<unknown>;
};

export type GatewayInstanceCensusOptions = {
  readonly client: () => InstanceCensusClient | null;
  readonly instanceId?: string;
  readonly declaredInstances?: number | null;
  readonly ttlMs?: number;
  readonly now?: () => number;
};

const INSTANCE_KEY_PREFIX = 'gateway:instance:';
const DEFAULT_TTL_MS = 30_000;
const BEAT_EVERY_MS = 10_000;

type Census = { readonly count: number; readonly at: number };

export function declaredGatewayInstances(env: Readonly<Record<string, string | undefined>>): number | null {
  const parsed = Number.parseInt(env.GATEWAY_INSTANCES ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export class GatewayInstanceCensus implements SoleInstanceWitness {
  private readonly instanceId: string;
  private readonly declaredInstances: number | null;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private last: Census | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: GatewayInstanceCensusOptions) {
    this.instanceId = options.instanceId ?? randomUUID();
    this.declaredInstances = options.declaredInstances ?? null;
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  isSoleInstance(): boolean {
    if (this.declaredInstances !== null && this.declaredInstances > 1) return false;
    const last = this.last;
    return last !== null && last.count === 1 && this.now() - last.at <= this.ttlMs;
  }

  async beat(): Promise<void> {
    try {
      const client = this.options.client();
      if (!client) {
        this.last = null;
        return;
      }
      await client.set(`${INSTANCE_KEY_PREFIX}${this.instanceId}`, String(this.now()), 'PX', this.ttlMs);
      this.last = { count: await this.countLive(client), at: this.now() };
    } catch (error) {
      this.last = null;
      logger.warn('Gateway instance census failed: the single-process condition is unverified', { error });
    }
  }

  start(): this {
    void this.beat();
    this.timer = setInterval(() => { void this.beat(); }, BEAT_EVERY_MS);
    this.timer.unref?.();
    return this;
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.last = null;
    try {
      await this.options.client()?.del(`${INSTANCE_KEY_PREFIX}${this.instanceId}`);
    } catch {
      return;
    }
  }

  private async countLive(client: InstanceCensusClient): Promise<number> {
    const walk = async (cursor: string, seen: ReadonlySet<string>): Promise<ReadonlySet<string>> => {
      const [next, keys] = await client.scan(cursor, 'MATCH', `${INSTANCE_KEY_PREFIX}*`, 'COUNT', 100);
      const union = new Set([...seen, ...keys]);
      return next === '0' ? union : walk(next, union);
    };
    return (await walk('0', new Set())).size;
  }
}

/** Le recensement du processus, câblé par `server.ts` sur le Redis de la passerelle. */
export function startGatewayInstanceCensus(cacheStore: CacheStore): GatewayInstanceCensus {
  return new GatewayInstanceCensus({
    client: () => cacheStore.getNativeClient(),
    declaredInstances: declaredGatewayInstances(process.env),
  }).start();
}
