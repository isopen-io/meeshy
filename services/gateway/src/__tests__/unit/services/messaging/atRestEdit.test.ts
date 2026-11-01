/**
 * Décision porteur du 2026-11-01 — un message `server`/`hybrid` se MODIFIE, et
 * le texte modifié se range SCELLÉ exactement comme un message neuf
 * (`MessageProcessor.saveMessage`) : `content: ''`, le chiffré et ses
 * métadonnées à côté. Le clair modifié ne touche jamais `content`.
 *
 * Modèle de menace couvert : une copie de la base sans l'environnement de la
 * passerelle ne livre ni le texte d'origine ni le texte modifié. Non couvert :
 * un serveur compromis, qui lit tout ce qu'il relaie (ce N'EST PAS du bout en
 * bout).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  editSealsAtRest,
  editedLinksFor,
  prepareEditedText,
  servedEditedRow,
  type AtRestEditCrypto,
} from '../../../../services/messaging/atRestEdit';
import { ServerAtRestUnavailableError, type AtRestEnvelope } from '../../../../services/messaging/serverAtRest';

const CONV = '507f1f77bcf86cd799439022';
const SECRET_BEFORE = 'le code est 4471';
const SECRET_AFTER = 'le code est 9902';

const encode = (text: string): string => Buffer.from(`sealed:${text}`, 'utf8').toString('base64');
const decode = (ciphertext: string): string => Buffer.from(ciphertext, 'base64').toString('utf8').replace(/^sealed:/, '');

function makeCrypto(overrides: Partial<AtRestEditCrypto> = {}) {
  const sealAtRest = jest.fn(async (params: { plaintext: string; conversationId: string; preferredKeyId?: string | null }) => ({
    ciphertext: encode(params.plaintext),
    metadata: { protocol: 'aes-256-gcm' as const, keyId: params.preferredKeyId ?? 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
  }));
  const openAtRest = jest.fn(async (envelope: AtRestEnvelope) => decode(envelope.ciphertext));
  return { sealAtRest, openAtRest, ...overrides } as unknown as AtRestEditCrypto & {
    sealAtRest: typeof sealAtRest;
    openAtRest: typeof openAtRest;
  };
}

const sealedRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  conversationId: CONV,
  content: '',
  isEncrypted: true,
  encryptionMode: 'server',
  encryptedContent: encode(SECRET_BEFORE),
  encryptionMetadata: { mode: 'server', keyId: 'key-conv', iv: 'aXY=', authTag: 'dGFn', aad: 'conversation:v1' },
  conversation: { encryptionMode: 'server', serverEncryptionKeyId: 'key-conv' },
  ...overrides,
});

const clearRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-2',
  conversationId: CONV,
  content: SECRET_BEFORE,
  isEncrypted: false,
  encryptionMode: null,
  encryptedContent: null,
  encryptionMetadata: null,
  conversation: { encryptionMode: null, serverEncryptionKeyId: null },
  ...overrides,
});

describe('editSealsAtRest — le régime qui décide si le texte modifié se scelle', () => {
  it.each([
    ['server', null, true],
    ['hybrid', null, true],
    ['HYBRID', null, true],
    [null, 'server', true],
    [null, null, false],
    ['e2ee', null, false],
  ])('conversation %s, ligne %s ⇒ %s', (conversationMode, rowMode, expected) => {
    expect(editSealsAtRest({ encryptionMode: rowMode, conversation: { encryptionMode: conversationMode } })).toBe(expected);
  });
});

describe('prepareEditedText — ce que l’écriture range', () => {
  it('au repos : content vide, le chiffré à côté, le mode et la clé de la conversation', async () => {
    const crypto = makeCrypto();

    const prepared = await prepareEditedText({ crypto, row: sealedRow(), text: SECRET_AFTER });

    expect(prepared.sealed).toBe(true);
    expect(prepared.columns).toEqual({
      content: '',
      isEncrypted: true,
      encryptionMode: 'server',
      encryptedContent: encode(SECRET_AFTER),
      encryptionMetadata: expect.objectContaining({ mode: 'server', keyId: 'key-conv', canTranslate: true }),
    });
    expect(crypto.sealAtRest).toHaveBeenCalledWith({ plaintext: SECRET_AFTER, conversationId: CONV, preferredKeyId: 'key-conv' });
  });

  it('aucune colonne écrite ne porte le clair modifié ni le clair d’avant', async () => {
    const prepared = await prepareEditedText({ crypto: makeCrypto(), row: sealedRow(), text: SECRET_AFTER });

    const written = JSON.stringify(prepared.columns);
    expect(written).not.toContain(SECRET_AFTER);
    expect(written).not.toContain(SECRET_BEFORE);
  });

  it('le texte d’AVANT se lit par la passerelle, pour les compteurs : jamais la chaîne vide de la ligne scellée', async () => {
    const prepared = await prepareEditedText({ crypto: makeCrypto(), row: sealedRow(), text: SECRET_AFTER });

    expect(prepared.previousContent).toBe(SECRET_BEFORE);
  });

  it('une ligne d’avant l’activation dans une conversation désormais au repos : le texte modifié se scelle quand même', async () => {
    const crypto = makeCrypto();

    const prepared = await prepareEditedText({
      crypto,
      row: clearRow({ conversation: { encryptionMode: 'hybrid', serverEncryptionKeyId: null } }),
      text: SECRET_AFTER,
    });

    expect(prepared.columns).toMatchObject({ content: '', isEncrypted: true, encryptionMode: 'hybrid' });
    expect(prepared.previousContent).toBe(SECRET_BEFORE);
  });

  it('un texte vidé (retrait de légende) n’a rien à sceller : rangé vide, non chiffré, mode gardé', async () => {
    const crypto = makeCrypto();

    const prepared = await prepareEditedText({ crypto, row: sealedRow(), text: '' });

    expect(prepared.columns).toEqual({ content: '', isEncrypted: false, encryptionMode: 'server', encryptedContent: null, encryptionMetadata: null });
    expect(crypto.sealAtRest).not.toHaveBeenCalled();
  });

  it('hors repos : le texte se range dans content, sans toucher au chiffrement', async () => {
    const crypto = makeCrypto();

    const prepared = await prepareEditedText({ crypto, row: clearRow(), text: SECRET_AFTER });

    expect(prepared).toEqual({ sealed: false, columns: { content: SECRET_AFTER }, previousContent: SECRET_BEFORE });
    expect(crypto.sealAtRest).not.toHaveBeenCalled();
    expect(crypto.openAtRest).not.toHaveBeenCalled();
  });

  it('sans clé maîtresse : l’erreur remonte, aucune colonne n’est rendue — jamais un repli en clair', async () => {
    const crypto = makeCrypto({ sealAtRest: jest.fn(async () => { throw new ServerAtRestUnavailableError('missing'); }) as never });

    await expect(prepareEditedText({ crypto, row: sealedRow(), text: SECRET_AFTER })).rejects.toBeInstanceOf(ServerAtRestUnavailableError);
  });

  it('une ligne d’avant qu’aucune clé n’ouvre compte pour vide, et le texte neuf se scelle', async () => {
    const crypto = makeCrypto({ openAtRest: jest.fn(async () => { throw new Error('authentication-failed'); }) as never });

    const prepared = await prepareEditedText({ crypto, row: sealedRow(), text: SECRET_AFTER });

    expect(prepared.previousContent).toBe('');
    expect(prepared.columns).toMatchObject({ content: '', isEncrypted: true });
  });
});

describe('editedLinksFor — au repos, aucune adresse ne se range en clair à côté du chiffré', () => {
  it('au repos : le texte reste tel quel, le mapping est établi VIDE, le service de liens n’est pas appelé', async () => {
    const linkService = { processExplicitLinksInContent: jest.fn(), collectContentTrackingLinks: jest.fn() };

    const links = await editedLinksFor(true, {
      linkService: linkService as never,
      message: { id: 'msg-1', conversationId: CONV, sender: null },
      content: 'voir https://exemple.org/secret',
      editorUserId: 'user-1',
    });

    expect(links).toEqual({ processedContent: 'voir https://exemple.org/secret', trackingLinks: [], reconciled: true });
    expect(linkService.processExplicitLinksInContent).not.toHaveBeenCalled();
    expect(linkService.collectContentTrackingLinks).not.toHaveBeenCalled();
  });
});

describe('servedEditedRow — ce qui part vers les clients : le clair, jamais le chiffré', () => {
  it('une ligne réécrite scellée est servie en clair, sans chiffré ni métadonnées', async () => {
    const crypto = makeCrypto();
    const prepared = await prepareEditedText({ crypto, row: sealedRow(), text: SECRET_AFTER });
    const written = { ...sealedRow(), ...prepared.columns };

    const served = await servedEditedRow(written, { prepared, text: SECRET_AFTER }, crypto);

    expect(served).toMatchObject({ content: SECRET_AFTER, isEncrypted: false, encryptionMode: 'server' });
    expect(served).not.toHaveProperty('encryptedContent');
    expect(served).not.toHaveProperty('encryptionMetadata');
  });

  it('la citation scellée est ouverte, et son chiffré ne part pas', async () => {
    const crypto = makeCrypto();
    const prepared = await prepareEditedText({ crypto, row: sealedRow(), text: SECRET_AFTER });
    const written = { ...sealedRow(), ...prepared.columns, replyTo: sealedRow({ id: 'msg-quoted' }) };

    const served = await servedEditedRow(written, { prepared, text: SECRET_AFTER }, crypto);

    expect(served.replyTo).toMatchObject({ id: 'msg-quoted', content: SECRET_BEFORE, isEncrypted: false });
    expect(served.replyTo).not.toHaveProperty('encryptedContent');
  });
});
