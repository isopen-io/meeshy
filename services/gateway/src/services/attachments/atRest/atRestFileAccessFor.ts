/**
 * #13100 — l'accès aux fichiers scellés d'un processus passerelle : le
 * magasin des scellements par Prisma, et le coffre de clés construit au
 * premier fichier à sceller ou à ouvrir (`getEncryptionService`). Posé au
 * démarrage (`server.ts`), lu par les routes de fichiers et le départ des
 * octets vers le translator.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getEncryptionService } from '../../EncryptionService';
import { getCacheStore } from '../../CacheStore';
import { prismaAtRestFileStore, type AtRestFileAccess, type AtRestFileKeyring, type FileSealLock } from './atRestFiles';
import { resilientSealLock } from './sealLock';
import { enhancedLogger } from '../../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'atRestFileAccess' });

/** Le verrou de la passerelle : Redis partagé, repli sur le verrou du processus (`resilientSealLock`). */
export const gatewaySealLock: FileSealLock = resilientSealLock(
  () => getCacheStore().getNativeClient() as never,
  (error) => logger.error('verrou de scellement Redis injoignable : repli sur le verrou du processus', undefined, {
    code: 'SERVER_AT_REST_SEAL_LOCK_UNAVAILABLE',
    reason: error instanceof Error ? error.name : 'unknown',
  })
);

export function lazyFileKeyring(factory: () => Promise<AtRestFileKeyring>): AtRestFileKeyring {
  const state: { pending: Promise<AtRestFileKeyring> | null } = { pending: null };
  const keyring = () => {
    state.pending = state.pending ?? factory();
    return state.pending;
  };
  return {
    fileSealingKey: async (conversationId) => (await keyring()).fileSealingKey(conversationId),
    fileOpeningKey: async (keyId, conversationId) => (await keyring()).fileOpeningKey(keyId, conversationId),
  };
}

export function atRestFileAccessFor(prisma: PrismaClient): AtRestFileAccess {
  return { store: prismaAtRestFileStore(prisma), keyring: lazyFileKeyring(() => getEncryptionService(prisma)), lock: gatewaySealLock };
}
