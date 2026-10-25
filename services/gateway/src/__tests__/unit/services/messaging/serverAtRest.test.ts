/**
 * #11381 / #11374 — un message des modes `server` et `hybrid` est chiffré AU
 * REPOS : la base ne voit que du chiffré, la passerelle l'ouvre à la lecture,
 * et tout échec (clé absente, clé erronée, ligne déplacée) est EXPLICITE.
 */
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { translationSourceOf } from '../../../../services/messaging/atRestTranslationSource';
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
  const designations = new Map<string, string>();
  const designated = {
    get keyId(): string | null { return designations.get(CONVERSATION) ?? null; },
    set keyId(value: string | null) { if (value) designations.set(CONVERSATION, value); else designations.delete(CONVERSATION); },
  };
  const prisma = {
    conversation: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const keyId = designations.get(where.id);
        return keyId ? { serverEncryptionKeyId: keyId, encryptionMode: 'server', serverEncryptionKey: rows.get(keyId) } : null;
      },
      updateMany: async ({ where, data }: { where: { id: string; serverEncryptionKeyId: string }; data: { serverEncryptionKeyId: string } }) => {
        if (designations.get(where.id) !== where.serverEncryptionKeyId) return { count: 0 };
        designations.set(where.id, data.serverEncryptionKeyId);
        return { count: 1 };
      },
    },
    serverEncryptionKey: {
      create: async ({ data }: { data: KeyRow }) => { rows.set(data.id, data); return data; },
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findMany: async () => [...rows.values()],
      update: async ({ where, data }: { where: { id: string }; data: Partial<KeyRow> }) => {
        const row = rows.get(where.id);
        if (row && 'conversationId' in data) rows.set(where.id, { ...row, conversationId: data.conversationId ?? null });
        return rows.get(where.id) ?? null;
      },
      updateMany: async ({ where, data }: { where: { id: string; conversationId: null }; data: { conversationId: string } }) => {
        const row = rows.get(where.id);
        if (!row || row.conversationId !== null) return { count: 0 };
        rows.set(where.id, { ...row, conversationId: data.conversationId });
        return { count: 1 };
      },
    },
  };
  return { rows, designations, designated, prisma: prisma as unknown as PrismaClient };
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

describe('une clé ne parle que pour SA conversation (oracle de déchiffrement)', () => {
  const translationOf = async (conversationId: string, text: string) => {
    const translated = await new EncryptionHelper(store.prisma).encryptTranslation(text, conversationId);
    return {
      ciphertext: translated.encryptedContent,
      keyId: String(translated.encryptionKeyId),
      iv: String(translated.encryptionIv),
      authTag: String(translated.encryptionAuthTag),
    };
  };

  const rowPointingAt = (envelope: { ciphertext: string; keyId: string; iv: string; authTag: string }): AtRestReadableRow => ({
    id: 'm-oracle',
    conversationId: OTHER_CONVERSATION,
    content: '',
    isEncrypted: true,
    encryptionMode: 'server',
    encryptedContent: envelope.ciphertext,
    encryptionMetadata: { mode: 'server', keyId: envelope.keyId, iv: envelope.iv, authTag: envelope.authTag },
  });

  it('une traduction recopiée dans une autre conversation sort SCELLÉE, sous la clé désignée par l’activation', async () => {
    const service = withMasterKey(MASTER_A);
    store.designated.keyId = await service.getOrCreateConversationKey();
    const envelope = await translationOf(CONVERSATION, 'The vault code is 4471');
    const served = await revealAtRest(rowPointingAt(envelope), service);
    expect(served).toMatchObject({ content: '', isEncrypted: true });
    expect(JSON.stringify(served)).not.toContain('4471');
  });

  it('une traduction recopiée dans une autre conversation sort SCELLÉE, sous une clé de conversation du coffre', async () => {
    const service = withMasterKey(MASTER_A);
    const keyId = await service.getOrCreateConversationKey(CONVERSATION);
    store.designated.keyId = keyId;
    const envelope = await translationOf(CONVERSATION, 'The vault code is 4471');
    await expect(service.openAtRest(envelope, OTHER_CONVERSATION)).rejects.toMatchObject({ code: SERVER_AT_REST_UNREADABLE });
  });

  it('la même traduction s’ouvre dans SA conversation', async () => {
    const service = withMasterKey(MASTER_A);
    store.designated.keyId = await service.getOrCreateConversationKey();
    const envelope = await translationOf(CONVERSATION, 'The vault code is 4471');
    expect(await service.openAtRest(envelope, CONVERSATION)).toBe('The vault code is 4471');
  });
});

describe('une clé qui ne s’ouvre PAS n’est jamais remplacée ; une clé ABSENTE l’est', () => {
  it('clé désignée enveloppée sous une autre clé maîtresse : l’envoi est REFUSÉ, rien n’est créé ni redésigné', async () => {
    const former = withMasterKey(MASTER_B);
    const kept = await former.getOrCreateConversationKey();
    store.designated.keyId = kept;
    const service = withMasterKey(MASTER_A);
    const keysBefore = store.rows.size;

    await expect(service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION, preferredKeyId: kept }))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE, reason: 'key-unwrap-failed' });

    expect({ designated: store.designations.get(CONVERSATION), keysCreated: store.rows.size - keysBefore, owner: store.rows.get(kept)?.conversationId ?? null })
      .toEqual({ designated: kept, keysCreated: 0, owner: null });
  });

  it('clé désignée absente de la base : même remplacement', async () => {
    const service = withMasterKey(MASTER_A);
    store.designated.keyId = 'cle-disparue';
    const sealed = await service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION, preferredKeyId: 'cle-disparue' });
    expect(sealed.metadata.keyId).not.toBe('cle-disparue');
    expect(store.designations.get(CONVERSATION)).toBe(sealed.metadata.keyId);
  });

  it('sans clé maîtresse, rien n’est remplacé : l’envoi reste refusé', async () => {
    const former = withMasterKey(MASTER_B);
    const lost = await former.getOrCreateConversationKey();
    store.designated.keyId = lost;
    const service = withMasterKey(undefined);
    await expect(service.sealAtRest({ plaintext: SECRET, conversationId: CONVERSATION, preferredKeyId: lost }))
      .rejects.toMatchObject({ code: SERVER_AT_REST_UNAVAILABLE });
    expect(store.designations.get(CONVERSATION)).toBe(lost);
  });
});

describe('une ligne server ÉDITÉE avant le chiffrement au repos (content réécrit, chiffré périmé à côté)', () => {
  const EDITED = 'message corrigé, code retiré';
  const editedRow = async (service: EncryptionService): Promise<AtRestReadableRow> =>
    sealedRow(service, { content: EDITED });

  it('la lecture sert le texte ÉDITÉ et n’ouvre jamais le chiffré d’avant', async () => {
    const service = withMasterKey(MASTER_A);
    const served = await revealAtRest(await editedRow(service), service);
    expect(served).toMatchObject({ content: EDITED, isEncrypted: false, encryptedContent: null, encryptionMetadata: null });
    expect(JSON.stringify(served)).not.toContain('18 h');
  });

  it('même sans aucune clé lisible, le texte édité est servi, jamais scellé', async () => {
    const row = await editedRow(withMasterKey(MASTER_A));
    const served = await revealAtRest(row, withMasterKey(MASTER_B));
    expect(served).toMatchObject({ content: EDITED, isEncrypted: false, encryptedContent: null });
  });

  it('la retraduction lit le texte édité', async () => {
    const service = withMasterKey(MASTER_A);
    const source = await translationSourceOf(await editedRow(service), service);
    expect(source).toMatchObject({ readable: true, row: { content: EDITED } });
  });

  it('une citation éditée sort aussi éditée', async () => {
    const service = withMasterKey(MASTER_A);
    const [served] = await revealAtRestRows([{ ...(await sealedRow(service)), replyTo: await editedRow(service) }], service);
    expect(served.replyTo).toMatchObject({ content: EDITED, isEncrypted: false });
  });
});
