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
 * Chaque instance pose `gateway:instance:<id>` avec un TTL, s'inscrit au
 * registre `gateway:instances`, et recompte à chaque battement les inscrits
 * dont la clé vit encore — en O(instances), jamais en parcourant l'espace de
 * clés : un `SCAN` coûtait une commande par centaine de clés de TOUT Redis,
 * toutes les 10 s et par instance. Le TTL reste celui du serveur Redis : une
 * horloge d'instance décalée n'efface personne. L'instance est unique si et seulement si le
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
  mget(...keys: string[]): Promise<ReadonlyArray<string | null>>;
  sadd(key: string, ...members: string[]): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<unknown>;
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
const INSTANCE_REGISTRY_KEY = 'gateway:instances';
const instanceKey = (instanceId: string) => `${INSTANCE_KEY_PREFIX}${instanceId}`;
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
      await client.set(instanceKey(this.instanceId), String(this.now()), 'PX', this.ttlMs);
      await client.sadd(INSTANCE_REGISTRY_KEY, this.instanceId);
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
      const client = this.options.client();
      await client?.del(instanceKey(this.instanceId));
      await client?.srem(INSTANCE_REGISTRY_KEY, this.instanceId);
    } catch {
      return;
    }
  }

  private async countLive(client: InstanceCensusClient): Promise<number> {
    const members = await client.smembers(INSTANCE_REGISTRY_KEY);
    if (members.length === 0) return 0;
    const values = await client.mget(...members.map(instanceKey));
    const departed = members.filter((_, index) => values[index] === null);
    if (departed.length > 0) await client.srem(INSTANCE_REGISTRY_KEY, ...departed);
    return members.length - departed.length;
  }
}

/** Le recensement du processus, câblé par `server.ts` sur le Redis de la passerelle. */
export function startGatewayInstanceCensus(cacheStore: CacheStore): GatewayInstanceCensus {
  return new GatewayInstanceCensus({
    client: () => cacheStore.getNativeClient(),
    declaredInstances: declaredGatewayInstances(process.env),
  }).start();
}
