/**
 * #13100 — l'accès aux fichiers scellés d'un processus passerelle : le
 * magasin des scellements par Prisma, et le coffre de clés construit au
 * premier fichier à sceller ou à ouvrir (`getEncryptionService`). Posé au
 * démarrage (`server.ts`), lu par les routes de fichiers et le départ des
 * octets vers le translator.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getEncryptionService } from '../../EncryptionService';
import { prismaAtRestFileStore, type AtRestFileAccess, type AtRestFileKeyring, type FileSealLock } from './atRestFiles';
import { gatewaySealLockOf, reconnectingLockClient } from './sealLock';
import { configureSealingDeferralStore, noteSealingDeferred, prismaDeferralStore } from './sealingDeferral';

const lockClient: { client: ReturnType<typeof reconnectingLockClient> | null } = { client: null };
/** Le client Redis du verrou et du marqueur d'activation ; `null` sans `REDIS_URL`. */
export const sealLockRedis = () => {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  lockClient.client = lockClient.client ?? reconnectingLockClient(url);
  return lockClient.client;
};

/** Le verrou de la passerelle : Redis partagé, sur son propre client qui se reconnecte toujours, fail-closed (`gatewaySealLockOf`). */
export const gatewaySealLock: FileSealLock = gatewaySealLockOf({
  redis: () => sealLockRedis() as never,
  configured: () => Boolean(process.env.REDIS_URL),
  onUnavailable: () => noteSealingDeferred(),
});

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
  // Ouvert dès le démarrage : le premier envoi trouve le verrou déjà connecté.
  sealLockRedis();
  configureSealingDeferralStore(prismaDeferralStore(prisma));
  return { store: prismaAtRestFileStore(prisma), keyring: lazyFileKeyring(() => getEncryptionService(prisma)), lock: gatewaySealLock };
}
