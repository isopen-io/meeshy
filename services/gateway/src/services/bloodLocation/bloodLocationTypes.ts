import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ServerEmitIO } from '../../socketio/serverEmit';
import type { PairAccessDb } from '../relations/pairAccess';

export type BloodLocationDb = PairAccessDb &
  Pick<PrismaClient, 'bloodLocationPoint' | 'bloodLocationConsultation' | 'relationFeatureSetting'>;

export type BloodLocationDeps = {
  readonly prisma: BloodLocationDb;
  readonly io: ServerEmitIO | undefined;
  readonly now: () => number;
  /**
   * Prend la cadence d'une paire (une alerte toutes les 2 h) : `true` si CE geste l'a prise.
   * Strict — une panne LÈVE, et l'alerte ne part pas.
   */
  readonly claimProximityCooldown: (pairKey: string, ttlSeconds: number) => Promise<boolean>;
  /** Journalise un échec sans charge ; jamais d'effet sur le geste. */
  readonly report?: (error: unknown) => void;
};
