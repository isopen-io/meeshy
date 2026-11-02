import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import { createEndToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { endToEndRegimeOf, endToEndSealed, sealForgedPlaintext, withOpenedTexts } from './end-to-end-sealed';

/**
 * #14592 — LE NAVIGATEUR LIT CE QUE LIBSIGNAL A OUVERT ICI. Le texte vient de
 * la mémoire du navigateur, jamais d'un champ servi : la provenance est
 * l'identité de l'objet fabriqué, qu'aucune charge réseau ne peut reproduire.
 */
const ID = 'c-e2ee';
const regime = () => endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date('2026-10-20T10:00:00.000Z') }, createEndToEndRegimeLedger({ storage: null }).getState());

const served = (extra: Readonly<Record<string, unknown>>): Message =>
  ({
    id: 'm-1',
    conversationId: ID,
    senderId: 'p-bruno',
    content: '[Encrypted]',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEncrypted: true,
    encryptionMode: 'e2ee',
    encryptionMetadata: { protocol: 'libsignal-v1' },
    translations: [],
    createdAt: new Date('2026-10-21T10:00:00.000Z'),
    ...extra,
  }) as unknown as Message;

const opened = { 'm-1': { text: 'Rendez-vous à 18 h', language: 'fr', senderUserId: 'p-bruno' } };

describe('le clair ouvert sur ce navigateur', () => {
  test('un message e2ee ouvert ici se rend avec son texte et cesse d\'être scellé', () => {
    const [shown] = withOpenedTexts(sealForgedPlaintext([served({})], regime()), opened);
    expect(shown?.content).toBe('Rendez-vous à 18 h');
    expect(endToEndSealed(shown!)).toBe(false);
  });

  test('un message servi qui se prétend ouvert (champ forgé) reste scellé', () => {
    const forged = served({ e2eeOpened: true, openedOnDevice: true });
    const [shown] = sealForgedPlaintext([forged], regime());
    expect(endToEndSealed(shown!)).toBe(true);
    expect(shown?.content).toBe('[Encrypted]');
  });

  test('un clair servi ne prend jamais le texte d\'un message ouvert de même identifiant', () => {
    const plain = served({ isEncrypted: false, encryptionMode: null, encryptionMetadata: null, content: 'clair', createdAt: new Date('2026-10-01T10:00:00.000Z') });
    const messages = [plain];
    const shown = withOpenedTexts(messages, opened);
    expect(shown).toBe(messages);
  });

  test('rien à ouvrir : le même tableau, aucun rendu de plus', () => {
    const messages = sealForgedPlaintext([served({ id: 'm-2' })], regime());
    expect(withOpenedTexts(messages, opened)).toBe(messages);
  });
});
