/**
 * #11381 / #11374 — un message des modes `server` et `hybrid` est chiffré AU
 * REPOS : la base ne voit que du chiffré, la passerelle l'ouvre à la lecture,
 * et tout échec (clé absente, clé erronée, ligne déplacée) est EXPLICITE.
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import {
  openBytes,
  readMasterKey,
  revealAtRest,
  revealAtRestRows,
  sealBytes,
  SERVER_AT_REST_UNAVAILABLE,
  SERVER_AT_REST_UNREADABLE,
  type AtRestReadableRow,
} from '../../../../services/messaging/serverAtRest';
import { EncryptionService } from '../../../../services/EncryptionService';
import { EncryptionHelper } from '../../../../services/message-translation/EncryptionHelper';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

type KeyRow = {
  id: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
  algorithm: string;
  purpose: string;
  conversationId: string | null;
  createdAt: Date;
};

const MASTER_A = Buffer.alloc(32, 7).toString('base64');
const MASTER_B = Buffer.alloc(32, 9).toString('base64');
const CONVERSATION = '507f1f77bcf86cd799439011';
const OTHER_CONVERSATION = '507f1f77bcf86cd799439099';
const SECRET = 'Le rendez-vous est déplacé à 18 h, porte B';

const keyStore = () => {
  const rows = new Map<string, KeyRow>();
  const designated: { keyId: string | null } = { keyId: null };
  const prisma = {
    conversation: {
      findUnique: async () => designated.keyId
        ? { serverEncryptionKeyId: designated.keyId, encryptionMode: 'server', serverEncryptionKey: rows.get(designated.keyId) }
        : null,
    },
    serverEncryptionKey: {
      create: async ({ data }: { data: KeyRow }) => { rows.set(data.id, data); return data; },
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findMany: async () => [...rows.values()],
      update: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
    },
  };
  return { rows, designated, prisma: prisma as unknown as PrismaClient };
};

const withMasterKey = (value: string | undefined): EncryptionService => {
  if (value === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = value;
  return new EncryptionService(store.prisma);
};

let store = keyStore();
const savedKey = process.env.ENCRYPTION_MASTER_KEY;

beforeEach(() => {
  store = keyStore();
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.ENCRYPTION_MASTER_KEY;
  else process.env.ENCRYPTION_MASTER_KEY = savedKey;
});

const sealedRow = async (service: EncryptionService, overrides: Partial<AtRestReadableRow> = {}): Promise<AtRestReadableRow> => {
  const sealed = await service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION });
  return {
    id: 'm-1',
    conversationId: CONVERSATION,
    content: '',
    isEncrypted: true,
    encryptionMode: 'server',
    encryptedContent: sealed.ciphertext,
    encryptionMetadata: { mode: 'server', ...sealed.metadata },
    ...overrides,
  };
};

describe('AES-256-GCM — vecteur officiel (GCM spec, McGrew & Viega, Test Case 16)', () => {
  const key = Buffer.from('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308', 'hex');
  const iv = Buffer.from('cafebabefacedbaddecaf888', 'hex');
  const plaintext = Buffer.from(
    'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
    'hex'
  );
  const aad = Buffer.from('feedfacedeadbeeffeedfacedeadbeefabaddad2', 'hex');

  it('produit le chiffré et l’étiquette attendus', () => {
    const sealed = sealBytes({ key, iv, plaintext, aad });
    expect(sealed.ciphertext.toString('hex')).toBe(
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662'
    );
    expect(sealed.authTag.toString('hex')).toBe('76fc6ece0f4e1768cddf8853bb2d551b');
  });

  it('rouvre le vecteur, et refuse une donnée additionnelle altérée', () => {
    const sealed = sealBytes({ key, iv, plaintext, aad });
    expect(openBytes({ key, iv, ...sealed, aad }).equals(plaintext)).toBe(true);
    expect(() => openBytes({ key, iv, ...sealed, aad: Buffer.from('autre') })).toThrow();
  });
});

describe('readMasterKey', () => {
  it('distingue une clé absente, de mauvaise longueur, et valide', () => {
    expect(readMasterKey(undefined)).toEqual({ available: false, reason: 'missing' });
    expect(readMasterKey('  ')).toEqual({ available: false, reason: 'missing' });
    expect(readMasterKey(Buffer.from('trop courte').toString('base64'))).toEqual({ available: false, reason: 'invalid-length' });
    expect(readMasterKey(MASTER_A).available).toBe(true);
  });
});

describe('EncryptionService — chiffrement au repos', () => {
  it('ne range jamais le clair : ni dans le chiffré, ni dans ses métadonnées, ni dans la clé de données', async () => {
    const service = withMasterKey(MASTER_A);
    const row = await sealedRow(service);
    const persisted = JSON.stringify({ row, keys: [...store.rows.values()] });
    expect(persisted).not.toContain(SECRET);
    expect(persisted).not.toContain(Buffer.from(SECRET).toString('base64'));
    expect(row.encryptionMetadata).toMatchObject({ protocol: 'aes-256-gcm', aad: 'conversation:v1' });
  });

  it('un membre relit le clair par la passerelle', async () => {
    const service = withMasterKey(MASTER_A);
    const served = await revealAtRest(await sealedRow(service), service);
    expect(served).toMatchObject({
      content: SECRET,
      isEncrypted: false,
      encryptionMode: 'server',
      encryptedContent: null,
      encryptionMetadata: null,
    });
  });

  it('le chiffré est lié à sa conversation : recopié ailleurs, il ne parle pas', async () => {
    const service = withMasterKey(MASTER_A);
    const row = await sealedRow(service);
    const sealed = await service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION });
    await expect(service.openAtRest({ ...sealed.metadata, ciphertext: sealed.ciphertext }, OTHER_CONVERSATION))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNREADABLE });
    expect(await revealAtRest({ ...row, conversationId: OTHER_CONVERSATION }, service)).toMatchObject({ content: '', isEncrypted: true });
  });

  it('une clé maîtresse ERRONÉE échoue explicitement, et la ligne sort scellée', async () => {
    const writer = withMasterKey(MASTER_A);
    const row = await sealedRow(writer);
    const sealed = await writer.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION });
    const reader = withMasterKey(MASTER_B);
    await expect(reader.openAtRest({ ...sealed.metadata, ciphertext: sealed.ciphertext }, CONVERSATION))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNREADABLE });
    expect(await revealAtRest(row, reader)).toEqual({
      ...row,
      content: '',
      isEncrypted: true,
      encryptedContent: null,
      encryptionMetadata: null,
    });
  });

  it('sans clé maîtresse, la passerelle démarre mais refuse d’écrire', async () => {
    const service = withMasterKey(undefined);
    await expect(service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION }))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
  });

  it('une clé de mauvaise longueur ne fait pas tomber la passerelle, et refuse aussi', async () => {
    const service = withMasterKey(Buffer.from('trop courte').toString('base64'));
    await expect(service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION }))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
  });

  it('chiffre sous la clé que la conversation désigne', async () => {
    const service = withMasterKey(MASTER_A);
    const designated = await service.getOrCreateConversationKey();
    const sealed = await service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION, preferredKeyId: designated });
    expect(sealed.metadata.keyId).toBe(designated);
  });
});

describe('revealAtRest — ce qui sort', () => {
  it('ouvre aussi les traductions que le service de traduction a chiffrées, sans leurs clés', async () => {
    const service = withMasterKey(MASTER_A);
    store.designated.keyId = await service.getOrCreateConversationKey();
    const translated = await new EncryptionHelper(store.prisma).encryptTranslation('The meeting moved to 6 pm', CONVERSATION);
    expect(translated.encryptedContent).not.toContain('meeting');
    const row = await sealedRow(service, {
      translations: {
        en: {
          text: translated.encryptedContent,
          isEncrypted: translated.isEncrypted,
          encryptionKeyId: translated.encryptionKeyId,
          encryptionIv: translated.encryptionIv,
          encryptionAuthTag: translated.encryptionAuthTag,
          translationModel: 'basic',
        },
      },
    });
    const served = await revealAtRest(row, service);
    expect(served.translations).toEqual({ en: { text: 'The meeting moved to 6 pm', isEncrypted: false, translationModel: 'basic' } });
  });

  it('laisse intacts un message en clair et un message de bout en bout', async () => {
    const service = withMasterKey(MASTER_A);
    const plain: AtRestReadableRow = { conversationId: CONVERSATION, content: 'bonjour', isEncrypted: false, encryptionMode: null };
    const endToEnd: AtRestReadableRow = {
      conversationId: CONVERSATION,
      content: '',
      isEncrypted: true,
      encryptionMode: 'e2ee',
      encryptedContent: 'opaque',
      encryptionMetadata: { mode: 'e2ee' },
    };
    expect(await revealAtRest(plain, service)).toBe(plain);
    expect(await revealAtRest(endToEnd, service)).toBe(endToEnd);
  });

  it('ouvre une page et ses citations', async () => {
    const service = withMasterKey(MASTER_A);
    const quoted = await sealedRow(service, { id: 'm-0' });
    const [served] = await revealAtRestRows([{ ...(await sealedRow(service)), replyTo: quoted }], service);
    expect(served.content).toBe(SECRET);
    expect(served.replyTo).toMatchObject({ content: SECRET, isEncrypted: false });
  });
});
