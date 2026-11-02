/**
 * #12822 (M1) — une clé d'activation d'AVANT le lot n'est jamais orpheline.
 *
 * Avant #11381, l'activation `server`/`hybrid` créait sa clé sans la rattacher
 * (`getOrCreateConversationKey()` sans conversation : `conversationId: null`)
 * et la désignait par `Conversation.serverEncryptionKeyId`. Depuis le lot, une
 * clé ne parle que pour SA conversation : rattachée, ou désignée. Désactiver
 * puis réactiver créait une clé neuve et re-désignait ; une bascule e2ee
 * effaçait la désignation. Les messages scellés sous l'ancienne clé — écrits
 * APRÈS le lot — devenaient illisibles à jamais, sans migration possible.
 *
 * Corrigé dans le code, sans migration : une clé désignée sans propriétaire se
 * rattache à sa conversation au premier usage (écriture ou lecture),
 * l'activation reprend la clé désignée qui s'ouvre encore, et une bascule ne
 * remet jamais la désignation à `null`.
 */
import { describe, it, expect, afterAll } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EncryptionService } from '../../../services/EncryptionService';
import { switchEncryptionRegime } from '../../../services/conversations/encryptionRegime';
import { ServerAtRestUnavailableError, type AtRestEnvelope } from '../../../services/messaging/serverAtRest';

const MASTER = Buffer.alloc(32, 3).toString('base64');
const OTHER_MASTER = Buffer.alloc(32, 9).toString('base64');
const CONV = '507f1f77bcf86cd799439011';
const OTHER_CONV = '507f1f77bcf86cd799439099';
const SECRET = 'code 4471';
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

type Row = Record<string, unknown>;

const ownerless = (row: Row | undefined): boolean => row !== undefined && (row.conversationId ?? null) === null;

/** Une base minimale : le régime d'UNE conversation et le coffre de clés. */
const world = (options: { readonly claimFails?: boolean } = {}) => {
  const keys = new Map<string, Row>();
  const conversation: Row = { id: CONV, serverEncryptionKeyId: null, encryptionEpoch: 0, encryptionMode: null, encryptionEnabledAt: null };
  const matchesEpoch = (where: Row): boolean => {
    const epoch = (conversation.encryptionEpoch as number | null) ?? 0;
    if (typeof where.encryptionEpoch === 'number') return where.encryptionEpoch === epoch;
    return epoch === 0;
  };
  const prisma = {
    conversation: {
      findUnique: async () => ({ ...conversation }),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        if ('serverEncryptionKeyId' in where && where.serverEncryptionKeyId !== conversation.serverEncryptionKeyId) return { count: 0 };
        if (!('serverEncryptionKeyId' in where) && !matchesEpoch(where)) return { count: 0 };
        Object.assign(conversation, data);
        return { count: 1 };
      },
    },
    serverEncryptionKey: {
      create: async ({ data }: { data: Row }) => { keys.set(String(data.id), data); return data; },
      findUnique: async ({ where }: { where: { id: string } }) => keys.get(where.id) ?? null,
      findMany: async () => [...keys.values()],
      update: async ({ where, data }: { where: { id: string }; data: Row }) => {
        const row = keys.get(where.id);
        if (row) keys.set(where.id, { ...row, ...data });
        return keys.get(where.id) ?? null;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: Row }) => {
        if (options.claimFails) throw new Error('mongo down');
        const row = keys.get(where.id);
        if (!ownerless(row)) return { count: 0 };
        keys.set(where.id, { ...row, ...data });
        return { count: 1 };
      },
    },
  };
  return { keys, conversation, prisma: prisma as unknown as PrismaClient };
};

/** Un processus de passerelle neuf : redémarrer efface tous ses caches. */
const gateway = (prisma: PrismaClient, masterKey: string = MASTER): EncryptionService => {
  process.env.ENCRYPTION_MASTER_KEY = masterKey;
  return new EncryptionService(prisma);
};

/** L'activation d'avant #11381 : une clé sans propriétaire, désignée. */
const legacyActivation = async (w: ReturnType<typeof world>): Promise<string> => {
  const keyId = await gateway(w.prisma).getOrCreateConversationKey();
  Object.assign(w.conversation, { serverEncryptionKeyId: keyId, encryptionMode: 'server', encryptionEnabledAt: new Date(), encryptionEpoch: 1 });
  return keyId;
};

const sealAfterLot = async (w: ReturnType<typeof world>): Promise<AtRestEnvelope> => {
  const sealed = await gateway(w.prisma).sealAtRest({
    plaintext: SECRET, conversationId: CONV, preferredKeyId: w.conversation.serverEncryptionKeyId as string,
  });
  return { ciphertext: sealed.ciphertext, keyId: sealed.metadata.keyId, iv: sealed.metadata.iv, authTag: sealed.metadata.authTag, aad: sealed.metadata.aad };
};

const disable = (w: ReturnType<typeof world>) => switchEncryptionRegime(w.prisma, {
  conversationId: CONV, observedEpoch: (w.conversation.encryptionEpoch as number) ?? 0, target: null, at: new Date(),
});

const enable = async (w: ReturnType<typeof world>, mode: 'server' | 'hybrid' | 'e2ee') => {
  const serverEncryptionKeyId = mode === 'e2ee'
    ? null
    : await gateway(w.prisma).activationKeyId(CONV, (w.conversation.serverEncryptionKeyId as string | null) ?? null);
  return switchEncryptionRegime(w.prisma, {
    conversationId: CONV,
    observedEpoch: (w.conversation.encryptionEpoch as number) ?? 0,
    target: { mode, protocol: mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm', enabledBy: 'u-admin', serverEncryptionKeyId },
    at: new Date(),
  });
};

describe('une clé désignée sans propriétaire se rattache à sa conversation au premier usage', () => {
  it('le premier scellement rattache la clé, sans changer son identifiant', async () => {
    const w = world();
    const keyId = await legacyActivation(w);

    const envelope = await sealAfterLot(w);

    expect(envelope.keyId).toBe(keyId);
    expect(w.keys.get(keyId)?.conversationId).toBe(CONV);
  });

  it('la première lecture d’un message d’avant le lot rattache aussi la clé', async () => {
    const w = world();
    const keyId = await legacyActivation(w);
    const envelope = await sealAfterLot(w);
    w.keys.set(keyId, { ...w.keys.get(keyId), conversationId: null });

    await expect(gateway(w.prisma).openAtRest(envelope, CONV)).resolves.toBe(SECRET);
    expect(w.keys.get(keyId)?.conversationId).toBe(CONV);
  });

  it('une clé déjà rattachée à une AUTRE conversation n’est jamais reprise', async () => {
    const w = world();
    const keyId = await legacyActivation(w);
    w.keys.set(keyId, { ...w.keys.get(keyId), conversationId: OTHER_CONV });

    await expect(gateway(w.prisma).openAtRest(await sealAfterLot(w), CONV)).resolves.toBe(SECRET);
    expect(w.keys.get(keyId)?.conversationId).toBe(OTHER_CONV);
  });
});

describe('désactiver puis réactiver garde lisibles les messages écrits après le lot', () => {
  it.each(['server', 'hybrid'] as const)('réactivation %s : la clé désignée est reprise et le message s’ouvre', async (mode) => {
    const w = world();
    const keyId = await legacyActivation(w);
    const envelope = await sealAfterLot(w);

    await disable(w);
    await enable(w, mode);

    expect(w.conversation.serverEncryptionKeyId).toBe(keyId);
    await expect(gateway(w.prisma).openAtRest(envelope, CONV)).resolves.toBe(SECRET);
  });

  it('le scénario de l’audit (getOrCreateConversationKey après redémarrage) reste lisible', async () => {
    const w = world();
    await legacyActivation(w);
    const envelope = await sealAfterLot(w);

    w.conversation.serverEncryptionKeyId = await gateway(w.prisma).getOrCreateConversationKey(CONV);

    await expect(gateway(w.prisma).openAtRest(envelope, CONV)).resolves.toBe(SECRET);
  });

  it('une bascule par e2ee ne remet jamais la désignation à null', async () => {
    const w = world({ claimFails: true });
    const keyId = await legacyActivation(w);
    const envelope = await sealAfterLot(w);

    await disable(w);
    await enable(w, 'e2ee');
    await disable(w);
    await enable(w, 'server');

    expect(w.conversation.serverEncryptionKeyId).toBe(keyId);
    await expect(gateway(w.prisma).openAtRest(envelope, CONV)).resolves.toBe(SECRET);
  });
});

describe('l’activation ne remplace que ce qui ne s’ouvre plus du tout', () => {
  it('une clé désignée ABSENTE de la base est remplacée par une clé rattachée', async () => {
    const w = world();
    const keyId = await legacyActivation(w);
    w.keys.delete(keyId);

    const next = await gateway(w.prisma).activationKeyId(CONV, keyId);

    expect(next).not.toBe(keyId);
    expect(w.keys.get(next)?.conversationId).toBe(CONV);
  });

  it('une clé désignée qui ne se désenveloppe pas sous la clé maîtresse présente refuse l’activation (503), rien n’est remplacé', async () => {
    const w = world();
    const keyId = await legacyActivation(w);

    await expect(gateway(w.prisma, OTHER_MASTER).activationKeyId(CONV, keyId))
      .rejects.toMatchObject({ code: 'SERVER_AT_REST_UNAVAILABLE', reason: 'key-unwrap-failed' });
    expect([...w.keys.keys()]).toEqual([keyId]);
  });

  it('sans clé maîtresse, l’activation est refusée', async () => {
    const w = world();
    const keyId = await legacyActivation(w);
    delete process.env.ENCRYPTION_MASTER_KEY;

    await expect(new EncryptionService(w.prisma).activationKeyId(CONV, keyId)).rejects.toBeInstanceOf(ServerAtRestUnavailableError);
  });
});
