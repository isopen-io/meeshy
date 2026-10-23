/**
 * LES SURCHARGES DU REGISTRE DES PACKS, SANS DÉPLOIEMENT (#11275).
 *
 * Le registre officiel reste une DONNÉE VERSIONNÉE du dépôt, lue au démarrage
 * (`PackIndex`) : il est toujours chargé, et c'est lui qui dit quels packs
 * EXISTENT. L'administration n'écrit que des SURCHARGES (`PackRegistryEntry`) :
 * masquer ou republier, l'ordre, le prix, la fenêtre d'offre, le ciblage
 * (`PackRegistryOverride`). Une surcharge ne crée jamais un pack ; une
 * surcharge illisible en base, ou dont la fusion viole une loi du registre, est
 * ignorée : le pack reste celui du dépôt.
 *
 * Lecture : un instantané en mémoire, relu au plus toutes les `ttlMs` (30 s)
 * par une relecture DÉCLENCHÉE à l'accès — aucune minuterie, aucune lecture
 * synchrone. Chaque passerelle converge seule (sans état partagé) ; celle qui
 * écrit relit aussitôt. Écriture : compare-and-set sur `revision`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isPackDomain, packChoiceKey, type PackDomain } from '@meeshy/shared/types/content-pack';
import type { PackIndexEntry } from '@meeshy/shared/types/content-pack-index';
import {
  PackRegistryOverrideSchema,
  applyPackOverride,
  mergePackOverrides,
  type PackRegistryOverride,
} from '@meeshy/shared/types/pack-registry-override';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { PackIndex } from './PackIndex';

const logger = enhancedLogger.child({ module: 'PackRegistryOverrides' });

export const PACK_REGISTRY_TTL_MS = 30_000;

export type PackRegistryOverridesPrisma = Pick<PrismaClient, 'packRegistryEntry'>;

type Snapshot = ReadonlyMap<string, { readonly override: PackRegistryOverride; readonly revision: number }>;

const EMPTY: Snapshot = new Map();

const keyOf = (domain: PackDomain, slug: string): string => packChoiceKey(domain, slug);

/** Le registre SERVI : celui du dépôt, chaque entrée surchargée quand sa surcharge est légale, dans l'ordre éditorial résultant. */
export function overlayPackIndex(base: PackIndex, overrides: () => ReadonlyMap<string, { readonly override: PackRegistryOverride }>): PackIndex {
  return {
    ...base,
    entries: (domain) => {
      const current = overrides();
      if (current.size === 0) return base.entries(domain);
      return base
        .entries(domain)
        .map((entry) => {
          const found = current.get(keyOf(domain, entry.slug));
          return found === undefined ? entry : (applyPackOverride(entry, found.override) ?? entry);
        })
        .sort((a, b) => a.order - b.order);
    },
  };
}

export type WriteOverrideOutcome =
  | { readonly kind: 'written'; readonly revision: number; readonly override: PackRegistryOverride; readonly effective: PackIndexEntry }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'revision-conflict' }
  | { readonly kind: 'unlawful' };

export type ResetOverrideOutcome = { readonly kind: 'reset' } | { readonly kind: 'not-found' } | { readonly kind: 'revision-conflict' };

export class PackRegistryOverrides {
  private readonly prisma: PackRegistryOverridesPrisma;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private current: Snapshot = EMPTY;
  private loadedAt = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;

  constructor(deps: { readonly prisma: PackRegistryOverridesPrisma; readonly now?: () => Date; readonly ttlMs?: number }) {
    this.prisma = deps.prisma;
    this.now = deps.now ?? (() => new Date());
    this.ttlMs = deps.ttlMs ?? PACK_REGISTRY_TTL_MS;
  }

  /** L'instantané courant, sans attendre ; une relecture part en arrière-plan s'il est périmé. */
  snapshot(): Snapshot {
    if (this.now().getTime() - this.loadedAt >= this.ttlMs && this.inflight === null) {
      void this.refresh().catch((error: unknown) => logger.warn('pack registry overrides refresh failed', { error: error instanceof Error ? error.message : String(error) }));
    }
    return this.current;
  }

  /** Relit toutes les surcharges ; une ligne illisible est écartée seule. Une base injoignable garde la dernière lecture. */
  refresh(): Promise<void> {
    if (this.inflight !== null) return this.inflight;
    this.inflight = (async () => {
      try {
        const rows = await this.prisma.packRegistryEntry.findMany({ select: { domain: true, slug: true, override: true, revision: true } });
        this.current = new Map(
          rows.flatMap((row) => {
            const parsed = PackRegistryOverrideSchema.safeParse(row.override);
            if (!parsed.success || !isPackDomain(row.domain)) return [];
            return [[keyOf(row.domain, row.slug), { override: parsed.data, revision: row.revision }] as const];
          }),
        );
        this.loadedAt = this.now().getTime();
      } catch (error) {
        // Une base injoignable garde la dernière lecture ET attend un délai : jamais une relecture par accès.
        this.loadedAt = this.now().getTime();
        throw error;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** La surcharge et la révision d'un pack, relues en base (jamais l'instantané : une écriture compare à la vérité). */
  async read(domain: PackDomain, slug: string): Promise<{ readonly override: PackRegistryOverride; readonly revision: number } | null> {
    const row = await this.prisma.packRegistryEntry.findUnique({ where: { domain_slug: { domain, slug } }, select: { override: true, revision: true } });
    if (row === null) return null;
    const parsed = PackRegistryOverrideSchema.safeParse(row.override);
    return { override: parsed.success ? parsed.data : {}, revision: row.revision };
  }

  /** Applique un correctif à la surcharge d'un pack DU DÉPÔT, en compare-and-set ; refuse une fusion qui viole une loi du registre. */
  async write(params: {
    readonly base: PackIndex;
    readonly domain: PackDomain;
    readonly slug: string;
    readonly patch: PackRegistryOverride;
    readonly expectedRevision: number;
    readonly actorId: string;
  }): Promise<WriteOverrideOutcome> {
    const entry = params.base.entries(params.domain).find((candidate) => candidate.slug === params.slug);
    if (entry === undefined) return { kind: 'not-found' };
    const existing = await this.read(params.domain, params.slug);
    if ((existing?.revision ?? 0) !== params.expectedRevision) return { kind: 'revision-conflict' };
    const override = mergePackOverrides(existing?.override ?? {}, params.patch);
    // Un pack gratuit au dépôt ne devient jamais payant : qui l'a installé gratuitement le perdrait (le rendu exige la possession).
    if (entry.price === undefined && override.price !== undefined && override.price !== null) return { kind: 'unlawful' };
    const effective = applyPackOverride(entry, override);
    if (effective === null) return { kind: 'unlawful' };
    const data = { override: override as object, updatedBy: params.actorId };
    try {
      if (existing === null) {
        await this.prisma.packRegistryEntry.create({ data: { domain: params.domain, slug: params.slug, ...data } });
      } else {
        const written = await this.prisma.packRegistryEntry.updateMany({
          where: { domain: params.domain, slug: params.slug, revision: existing.revision },
          data: { ...data, revision: existing.revision + 1 },
        });
        if (written.count !== 1) return { kind: 'revision-conflict' };
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002') return { kind: 'revision-conflict' };
      throw error;
    }
    await this.refresh();
    return { kind: 'written', revision: params.expectedRevision + 1, override, effective };
  }

  /** Revient au registre du dépôt (efface la surcharge), en compare-and-set. */
  async reset(params: { readonly domain: PackDomain; readonly slug: string; readonly expectedRevision: number }): Promise<ResetOverrideOutcome> {
    const existing = await this.read(params.domain, params.slug);
    if (existing === null) return { kind: 'not-found' };
    if (existing.revision !== params.expectedRevision) return { kind: 'revision-conflict' };
    const removed = await this.prisma.packRegistryEntry.deleteMany({ where: { domain: params.domain, slug: params.slug, revision: existing.revision } });
    if (removed.count !== 1) return { kind: 'revision-conflict' };
    await this.refresh();
    return { kind: 'reset' };
  }
}
