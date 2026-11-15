/**
 * LE BARÈME EFFECTIF — lu en base, servi depuis la mémoire (#8906).
 *
 * `recordActivity` s'exécute sur chaque message : relire la ligne singleton
 * `EngagementScaleConfig` à chaque geste ajouterait un aller-retour à la voie
 * chaude. Le barème est donc gardé en mémoire `ttlMs` (30 s) et INVALIDÉ
 * explicitement par l'écriture d'administration — le processus qui écrit
 * crédite au nouveau barème dès la réponse, les autres au plus 30 s plus tard.
 *
 * FAIL-CLOSED vers les DÉFAUTS : une ligne absente, illisible
 * (`parseEngagementScale` ⇒ `null`) ou une lecture qui lève rendent
 * `DEFAULT_ENGAGEMENT_SCALE` — les constantes que le code créditait avant le
 * barème. Un barème corrompu ne coupe jamais le crédit.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  DEFAULT_ENGAGEMENT_SCALE,
  parseEngagementScale,
  type EngagementScale,
  type EngagementScaleDocument,
} from '@meeshy/shared/types/engagement-scale';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'EngagementScaleService' });

/** La clé de la ligne singleton. */
export const ENGAGEMENT_SCALE_KEY = 'default';

/** Durée de validité du barème en mémoire. */
export const ENGAGEMENT_SCALE_TTL_MS = 30 * 1000;

/** Ce que le crédit demande au barème, et rien de plus. */
export interface EngagementScaleSource {
  current(): Promise<EngagementScale>;
}

type ScaleRow = {
  readonly config: unknown;
  readonly updatedAt: Date;
  readonly updatedById: string | null;
};

type CachedDocument = {
  readonly document: EngagementScaleDocument;
  readonly expiresAt: number;
};

const DEFAULT_DOCUMENT: EngagementScaleDocument = {
  scale: DEFAULT_ENGAGEMENT_SCALE,
  updatedAt: null,
  updatedBy: null,
};

function documentFromRow(row: ScaleRow | null): EngagementScaleDocument {
  if (!row) return DEFAULT_DOCUMENT;
  const scale = parseEngagementScale(row.config);
  if (!scale) {
    log.warn('EngagementScaleConfig row is unreadable — serving the default scale');
    return DEFAULT_DOCUMENT;
  }
  return { scale, updatedAt: row.updatedAt.toISOString(), updatedBy: row.updatedById };
}

export class EngagementScaleService implements EngagementScaleSource {
  private cached: CachedDocument | null = null;

  constructor(
    private readonly prisma: Pick<PrismaClient, 'engagementScaleConfig'>,
    private readonly options: { readonly ttlMs?: number; readonly now?: () => number } = {},
  ) {}

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Le barème effectif — celui que le crédit applique. */
  async current(): Promise<EngagementScale> {
    return (await this.document()).scale;
  }

  /** Le barème effectif, plus qui l'a réglé et quand — ce que l'administration lit. */
  async document(): Promise<EngagementScaleDocument> {
    const now = this.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.document;

    const document = await this.readDocument();
    this.cached = { document, expiresAt: now + (this.options.ttlMs ?? ENGAGEMENT_SCALE_TTL_MS) };
    return document;
  }

  private async readDocument(): Promise<EngagementScaleDocument> {
    try {
      const row = await this.prisma.engagementScaleConfig.findUnique({
        where: { key: ENGAGEMENT_SCALE_KEY },
        select: { config: true, updatedAt: true, updatedById: true },
      });
      return documentFromRow(row);
    } catch (error) {
      log.warn('EngagementScaleConfig read failed — serving the default scale', {
        error: error instanceof Error ? error.message : String(error),
      });
      return DEFAULT_DOCUMENT;
    }
  }

  /**
   * Écrit un barème DÉJÀ validé (`parseEngagementScale`) et invalide le cache.
   * Le document rendu est relu de la ligne écrite, jamais recomposé : il dit ce
   * que la base porte.
   */
  async write(scale: EngagementScale, updatedById: string): Promise<EngagementScaleDocument> {
    // `EngagementScale` est un objet JSON pur (nombres, booléens, `null`,
    // tableaux) validé par `parseEngagementScale` ; seules ses marques
    // `readonly` l'empêchent d'être reconnu comme `InputJsonValue`.
    const config = scale as unknown as Prisma.InputJsonValue;
    const row = await this.prisma.engagementScaleConfig.upsert({
      where: { key: ENGAGEMENT_SCALE_KEY },
      create: { key: ENGAGEMENT_SCALE_KEY, config, updatedById },
      update: { config, updatedById },
      select: { config: true, updatedAt: true, updatedById: true },
    });
    this.invalidate();
    return documentFromRow(row);
  }

  invalidate(): void {
    this.cached = null;
  }
}

const servicesByClient = new WeakMap<object, EngagementScaleService>();

/**
 * L'instance PARTAGÉE pour ce client Prisma — celle que le crédit lit et que la
 * route d'administration invalide. Une instance par client plutôt qu'un
 * singleton de module : le processus n'a qu'un client, et un test qui en
 * construit un neuf n'hérite pas du cache du précédent.
 */
export function engagementScaleServiceFor(prisma: Pick<PrismaClient, 'engagementScaleConfig'>): EngagementScaleService {
  const existing = servicesByClient.get(prisma);
  if (existing) return existing;
  const created = new EngagementScaleService(prisma);
  servicesByClient.set(prisma, created);
  return created;
}
