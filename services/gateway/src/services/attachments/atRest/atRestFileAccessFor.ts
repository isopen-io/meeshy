/**
 * #13100 — l'accès aux fichiers scellés d'un processus passerelle : le
 * magasin des scellements par Prisma, et le coffre de clés construit au
 * premier fichier à sceller ou à ouvrir (`getEncryptionService`). Posé au
 * démarrage (`server.ts`), lu par les routes de fichiers et le départ des
 * octets vers le translator.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { getEncryptionService } from '../../EncryptionService';
import { prismaAtRestFileStore, type AtRestFileAccess, type AtRestFileKeyring } from './atRestFiles';

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
  return { store: prismaAtRestFileStore(prisma), keyring: lazyFileKeyring(() => getEncryptionService(prisma)) };
}
