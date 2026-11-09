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
   * Le drapeau pour UN compte (`bloodLocationEnabledFor`). La porte des routes ne juge que l'appelant ;
   * celui-ci juge l'AUTRE — le Sang dont on lit l'historique, celui qu'une alerte viserait : hors liste
   * blanche, la fonction n'existe pas pour lui, ni en lecture, ni en événement.
   */
  readonly enabledFor: (userId: string) => boolean;
  /**
   * Prend la cadence d'une paire (une alerte toutes les 2 h) : `true` si CE geste l'a prise.
   * Strict — une panne LÈVE, et l'alerte ne part pas.
   */
  readonly claimProximityCooldown: (pairKey: string, ttlSeconds: number) => Promise<boolean>;
  /** Journalise un échec sans charge ; jamais d'effet sur le geste. */
  readonly report?: (error: unknown) => void;
};
