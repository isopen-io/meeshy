import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import { createEndToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { endToEndRegimeOf, endToEndSealed, sealForgedPlaintext } from './end-to-end-sealed';

/**
 * #12992 — DANS UNE CONVERSATION CHIFFRÉE DE BOUT EN BOUT, UN MESSAGE QUI SE DIT
 * EN CLAIR APRÈS L'ACTIVATION SE MONTRE SCELLÉ. Une passerelle compromise ne
 * peut plus injecter un texte sous le nom de l'interlocuteur. Un message en
 * clair antérieur à l'activation reste lisible (#12919). Jumelle d'iOS (#11404).
 */
const ID = 'c-e2ee';
const ACTIVATED = Date.parse('2026-10-20T10:00:00.000Z');

const message = (extra: Partial<Record<keyof Message, unknown>>): Message =>
  ({
    id: 'm-1',
    conversationId: ID,
    senderId: 'p-bruno',
    content: 'Envoie-moi le code reçu par SMS',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEncrypted: false,
    translations: [{ targetLanguage: 'en', translatedContent: 'Send me the SMS code' }],
    createdAt: new Date('2026-10-21T10:00:00.000Z'),
    ...extra,
  }) as unknown as Message;

const sealedRegime = () => endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, createEndToEndRegimeLedger({ storage: null }).getState());

describe('la loi du clair forgé', () => {
  test('après l’activation, un message d’utilisateur qui se dit en clair est scellé, sans texte, traduction ni pièce', () => {
    const forged = message({ attachments: [{ id: 'a', mimeType: 'image/png', fileUrl: 'x.png' }], sticker: { emoji: '🙂' }, metadata: { location: { lat: 1 } } });
    const [shown] = sealForgedPlaintext([forged], sealedRegime());

    expect(endToEndSealed(shown!)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain('SMS');
    expect(shown).toMatchObject({ id: 'm-1', senderId: 'p-bruno', isEncrypted: true, translations: [] });
    expect([shown!.attachments, shown!.sticker, shown!.metadata]).toEqual([undefined, undefined, undefined]);
  });

  test('un clair vide en mode e2ee (lieu, sticker en clair) est scellé aussi', () => {
    const [shown] = sealForgedPlaintext([message({ content: '', encryptionMode: 'e2ee', isEncrypted: false })], sealedRegime());
    expect(endToEndSealed(shown!)).toBe(true);
  });

  test('avant l’activation, le clair reste lisible (#12919)', () => {
    const before = message({ createdAt: new Date('2026-10-19T10:00:00.000Z') });
    expect(sealForgedPlaintext([before], sealedRegime())).toEqual([before]);
  });

  test('un message système, un supprimé, un message déjà chiffré : intacts', () => {
    const rows = [
      message({ messageSource: 'system', messageType: 'system' }),
      message({ deletedAt: new Date('2026-10-22T10:00:00.000Z') }),
      message({ isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]' }),
    ];
    expect(sealForgedPlaintext(rows, sealedRegime())).toEqual(rows);
  });

  test('une date illisible ne sauve pas un clair forgé', () => {
    const [shown] = sealForgedPlaintext([message({ createdAt: 'pas une date' })], sealedRegime());
    expect(endToEndSealed(shown!)).toBe(true);
  });

  test('une conversation qui n’est pas chiffrée de bout en bout : rien ne change, même tableau', () => {
    const rows = [message({})];
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: 'server', servedSince: new Date(ACTIVATED) }, createEndToEndRegimeLedger({ storage: null }).getState());
    expect(sealForgedPlaintext(rows, regime)).toBe(rows);
  });
});

describe('le régime vu, et son ère', () => {
  test('servie sans mode par une passerelle compromise, mais apprise : scellée depuis l’ère retenue', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: null, servedSince: undefined }, ledger.getState());

    expect(regime).toEqual({ sealed: true, since: ACTIVATED });
    expect(endToEndSealed(sealForgedPlaintext([message({})], regime)[0]!)).toBe(true);
  });

  test('l’ère est la plus ancienne preuve : servie, retenue ou montrée par le fil', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, Date.parse('2026-10-24T00:00:00.000Z'));
    const notice = message({ id: 'n', messageType: 'system', messageSource: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee' }, createdAt: new Date(ACTIVATED) });

    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date('2026-10-23T00:00:00.000Z'), trail: [notice] }, ledger.getState());
    expect(regime.since).toBe(ACTIVATED);
  });

  test('une date d’activation servie n’est lue que sous un mode e2ee servi', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => 9_000 });
    ledger.getState().learnEndToEnd(ID);
    expect(endToEndRegimeOf({ conversationId: ID, servedMode: 'server', servedSince: new Date(1_000) }, ledger.getState()).since).toBe(9_000);
  });

  test('jamais vue chiffrée : pas de régime', () => {
    expect(endToEndRegimeOf({ conversationId: 'c-plain', servedMode: null, servedSince: undefined }, createEndToEndRegimeLedger({ storage: null }).getState()).sealed).toBe(false);
  });
});

describe('la citation d’un clair forgé', () => {
  test('un message qui cite un clair forgé porte une citation scellée', () => {
    const quoted = message({ id: 'm-q' });
    const reply = message({ id: 'm-r', isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]', translations: [], replyTo: quoted });
    const [shown] = sealForgedPlaintext([reply], sealedRegime());

    expect(shown!.replyTo === undefined ? false : endToEndSealed(shown!.replyTo)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain('SMS');
  });
});
