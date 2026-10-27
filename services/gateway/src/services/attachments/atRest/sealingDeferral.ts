/**
 * #13100 — le début d'une panne du verrou de scellement. Pendant la panne, les
 * pièces restent en clair et le balayage les rattrapera ; il doit donc savoir
 * DEPUIS QUAND. L'instant se garde dans MONGO (`AtRestSealingDeferral`), pas
 * dans Redis — le service même qui est en panne — et survit ainsi à un
 * redémarrage de la passerelle PENDANT la panne. Chaque instance inscrit le
 * début de SA panne ; le rattrapage remonte au plus ancien, et n'efface que
 * les débuts antérieurs à ce qu'il a rattrapé (un début plus récent survit).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'sealingDeferral' });

export type DeferralStore = {
  record(since: Date): Promise<void>;
  earliest(): Promise<Date | null>;
  forget(upTo: Date): Promise<void>;
};

export function prismaDeferralStore(prisma: Pick<PrismaClient, 'atRestSealingDeferral'>): DeferralStore {
  return {
    record: async (since) => { await prisma.atRestSealingDeferral.create({ data: { since } }); },
    earliest: async () => (await prisma.atRestSealingDeferral.findFirst({ orderBy: { since: 'asc' }, select: { since: true } }))?.since ?? null,
    forget: async (upTo) => { await prisma.atRestSealingDeferral.deleteMany({ where: { since: { lte: upTo } } }); },
  };
}

const state: { store: DeferralStore | null; since: Date | null; recorded: boolean } = { store: null, since: null, recorded: false };

export function configureSealingDeferralStore(store: DeferralStore | null): void {
  state.store = store;
}

async function persist(): Promise<void> {
  const since = state.since;
  if (!state.store || !since || state.recorded) return;
  await state.store.record(since).then(
    () => { state.recorded = true; },
    (error: unknown) => logger.warn('début de panne du verrou non inscrit : il le sera au prochain balayage', { reason: error instanceof Error ? error.name : 'unknown' })
  );
}

/** Un verrou injoignable vient de laisser une pièce au balayage. */
export function noteSealingDeferred(now: Date = new Date()): void {
  if (state.since) return;
  state.since = now;
  state.recorded = false;
  void persist().catch(() => undefined);
}

/** Depuis quand des pièces attendent le rattrapage : le plus ancien de la mémoire et de la base, ou `null`. */
export async function rememberedDeferral(): Promise<Date | null> {
  await persist();
  const stored = state.store ? await state.store.earliest().catch(() => null) : null;
  const candidates = [state.since, stored].filter((date): date is Date => date !== null);
  return candidates.length === 0 ? null : new Date(Math.min(...candidates.map((date) => date.getTime())));
}

/** Le rattrapage est fait jusqu'à `upTo` : seuls les débuts antérieurs s'oublient. */
export async function forgetDeferral(upTo: Date): Promise<void> {
  if (state.since && state.since <= upTo) {
    state.since = null;
    state.recorded = false;
  }
  await state.store?.forget(upTo).catch(() => undefined);
}
