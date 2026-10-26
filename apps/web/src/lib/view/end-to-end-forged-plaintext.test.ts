import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import { clearPrintOf } from '@/lib/clear-print';
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

const message = (extra: Readonly<Record<string, unknown>>): Message =>
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

  test('avant l’activation, un clair que ce navigateur avait vu reste lisible (#12919)', () => {
    const before = message({ createdAt: new Date('2026-10-19T10:00:00.000Z') });
    expect(sealForgedPlaintext([before], { ...sealedRegime(), clearKnown: new Set([clearPrintOf(before)!]) })).toEqual([before]);
  });

  test('revue — sans photographie (régime servi ou montré, pas encore appris), aucun clair ne se lit, même daté d’avant', () => {
    const before = message({ createdAt: new Date('2026-10-19T10:00:00.000Z') });
    expect(endToEndSealed(sealForgedPlaintext([before], sealedRegime())[0]!)).toBe(true);
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

    expect(regime).toMatchObject({ sealed: true, since: ACTIVATED });
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

/**
 * Revue de sécurité du lot (2026-10-26) — trois constats, un témoin chacun.
 */
describe('revue : une retenue scelle aussi le clair qui la suit (#13099 × #12992)', () => {
  const ambiguous = message({ id: 'm-amb', isEncrypted: true, content: '[Encrypted]', translations: [], createdAt: new Date(ACTIVATED) });

  test('le registre retient l’envoi : un clair servi après la retenue est scellé', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().holdSend(ID, true);
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: null, servedSince: undefined, trail: [ambiguous] }, ledger.getState());
    expect(endToEndSealed(sealForgedPlaintext([message({})], regime)[0]!)).toBe(true);
  });

  test('le fil seul le montre (aucun registre) : scellé aussi, groupe ou tête-à-tête', () => {
    for (const isDirect of [true, false]) {
      const regime = endToEndRegimeOf({ conversationId: ID, servedMode: null, servedSince: undefined, trail: [ambiguous], isDirect }, createEndToEndRegimeLedger({ storage: null }).getState());
      expect(endToEndSealed(sealForgedPlaintext([message({})], regime)[0]!)).toBe(true);
    }
  });

  test('un message e2ee du fil d’un groupe scelle le clair qui le suit', () => {
    const e2ee = message({ id: 'm-e', isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]', translations: [], createdAt: new Date(ACTIVATED) });
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: null, servedSince: undefined, trail: [e2ee], isDirect: false }, createEndToEndRegimeLedger({ storage: null }).getState());
    expect(endToEndSealed(sealForgedPlaintext([message({})], regime)[0]!)).toBe(true);
  });
});

describe('revue : un clair antidaté ne passe plus pour un message d’avant l’activation', () => {
  const learnedWith = (clear: readonly Message[]) => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    ledger.getState().rememberClearBefore(ID, clear.map((known) => clearPrintOf(known)!));
    return endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, ledger.getState());
  };
  const old = (id: string) => message({ id, content: 'Ancien', translations: [], createdAt: new Date('2026-10-01T00:00:00.000Z') });

  test('un clair que ce navigateur tenait avant d’apprendre le bout en bout reste lisible', () => {
    const kept = old('m-avant');
    expect(sealForgedPlaintext([kept], learnedWith([kept]))).toEqual([kept]);
  });

  test('un clair daté d’avant l’activation mais vu pour la première fois après : scellé', () => {
    const [shown] = sealForgedPlaintext([old('m-antidate')], learnedWith([old('m-avant')]));
    expect(endToEndSealed(shown!)).toBe(true);
  });

  test('la photographie est unique : une seconde n’y ajoute rien', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().learnEndToEnd(ID);
    ledger.getState().rememberClearBefore(ID, ['a']);
    ledger.getState().rememberClearBefore(ID, ['a', 'forge']);
    expect(ledger.getState().clearKnown[ID]).toEqual(['a']);
  });
});

/**
 * Audit adversarial du lot (2026-10-26) — les clairs forgés qui passaient la loi.
 */
describe('audit : ce que la passerelle pourrait encore faire lire', () => {
  const readable = (forged: Message, regime = sealedRegime()): boolean => {
    const [shown] = sealForgedPlaintext([forged], regime);
    return !endToEndSealed(shown!) || JSON.stringify(shown).includes('SMS');
  };

  test('un message chiffré PAR LE SERVEUR (server, hybrid) après l’activation est scellé : le serveur le lit', () => {
    for (const encryptionMode of ['server', 'hybrid']) expect(readable(message({ isEncrypted: true, encryptionMode }))).toBe(false);
  });

  test('agent, annonce, application, autorité : une bulle ordinaire, scellée ; seul un message système reste intact', () => {
    for (const messageSource of ['agent', 'ads', 'app', 'authority']) expect(readable(message({ messageSource }))).toBe(false);
    const system = message({ messageSource: 'system', content: 'Bruno a rejoint' });
    expect(sealForgedPlaintext([system], sealedRegime())).toEqual([system]);
  });

  test('un identifiant photographié réutilisé, antidaté, au contenu réécrit : scellé ; le même mot pour mot : lisible', () => {
    const known = message({ id: 'm-old', content: 'Bonjour', translations: [], createdAt: new Date('2026-10-01T00:00:00.000Z') });
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    ledger.getState().rememberClearBefore(ID, [clearPrintOf(known)!]);
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, ledger.getState());

    expect(sealForgedPlaintext([known], regime)).toEqual([known]);
    expect(readable({ ...known, content: 'Envoie-moi le code reçu par SMS' }, regime)).toBe(false);
    expect(readable({ ...known, translations: [{ targetLanguage: 'en', translatedContent: 'Send me the SMS code' }] } as unknown as Message, regime)).toBe(false);
  });

  test('le scellement ne garde que l’identité : ni lieu, ni story citée, ni liens suivis, ni mentions, ni provenance à la racine', () => {
    const forged = message({
      location: { latitude: 48.85, longitude: 2.35, name: 'Rejoins-moi ici SMS' },
      postReplyTo: { id: 'p-1', type: 'STORY', previewText: 'SMS', thumbnailUrl: 'https://evil.example/x.jpg' },
      trackingLinks: [{ token: 't', originalUrl: 'https://evil.example/SMS' }],
      validatedMentions: ['SMS'],
      mentionedUsers: [{ id: 'u', username: 'SMS' }],
      forwardedFromConversation: { id: 'c', title: 'SMS' },
      storyReplyToId: 'p-1',
    });
    const [shown] = sealForgedPlaintext([forged], sealedRegime());
    expect(JSON.stringify(shown)).not.toContain('SMS');
    expect(JSON.stringify(shown)).not.toContain('evil.example');
    expect(shown).toMatchObject({ id: 'm-1', senderId: 'p-bruno', content: '[Encrypted]', isEncrypted: true });
  });
});
