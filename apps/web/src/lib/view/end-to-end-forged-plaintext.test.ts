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
    const [shown] = sealForgedPlaintext([before], { ...sealedRegime(), clearKnown: new Set([clearPrintOf(before)!]) });
    expect(shown).toEqual({ ...before, translations: [] });
  });

  test('revue — sans photographie (régime servi ou montré, pas encore appris), aucun clair ne se lit, même daté d’avant', () => {
    const before = message({ createdAt: new Date('2026-10-19T10:00:00.000Z') });
    expect(endToEndSealed(sealForgedPlaintext([before], sealedRegime())[0]!)).toBe(true);
  });

  test('un message système et un supprimé : intacts ; un message déjà chiffré ne garde que son identité', () => {
    const rows = [
      message({ messageSource: 'system', messageType: 'system' }),
      message({ deletedAt: new Date('2026-10-22T10:00:00.000Z') }),
      message({ isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]' }),
    ];
    const shown = sealForgedPlaintext(rows, sealedRegime());
    expect(shown[0]).toBe(rows[0]!);
    expect(shown[1]).toBe(rows[1]!);
    expect(endToEndSealed(shown[2]!)).toBe(true);
    expect(JSON.stringify(shown[2])).not.toContain('SMS');
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
    const translated = sealForgedPlaintext([{ ...known, translations: [{ targetLanguage: 'en', translatedContent: 'Send me the SMS code' }] } as unknown as Message], regime)[0]!;
    expect(translated.content).toBe('Bonjour');
    expect(JSON.stringify(translated)).not.toContain('SMS');
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

/**
 * Revue de sécurité (2026-10-26) — un clair d'avant l'activation reconnu par
 * son empreinte ne se rend qu'avec ce qu'elle VÉRIFIE.
 */
describe('revue : un clair reconnu ne rend que ce que son empreinte vérifie', () => {
  const known = message({
    id: 'm-old',
    content: 'Voici la photo',
    translations: [],
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    attachments: [{ id: 'a-1', mimeType: 'image/jpeg', fileUrl: 'https://cdn.meeshy.me/a-1.jpg' }],
  });
  const regimeKnowing = (prints: readonly string[]) => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    ledger.getState().rememberClearBefore(ID, prints);
    return endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, ledger.getState());
  };

  test('même identifiant, même texte, url de pièce changée : jamais affichée, le message se scelle', () => {
    const regime = regimeKnowing([clearPrintOf(known)!]);
    const swapped = { ...known, attachments: [{ id: 'a-1', mimeType: 'image/jpeg', fileUrl: 'https://evil.example/a-1.jpg' }] } as unknown as Message;
    const [shown] = sealForgedPlaintext([swapped], regime);
    expect(endToEndSealed(shown!)).toBe(true);
    expect(JSON.stringify(shown)).not.toContain('evil.example');
  });

  test('un champ ajouté à côté d’un clair reconnu ne se rend pas ; le clair, si', () => {
    const regime = regimeKnowing([clearPrintOf(known)!]);
    const padded = { ...known, linkPreview: { url: 'https://evil.example', title: 'Envoie-moi le code reçu par SMS' } } as unknown as Message;
    const [shown] = sealForgedPlaintext([padded], regime);
    expect(endToEndSealed(shown!)).toBe(false);
    expect(shown!.content).toBe('Voici la photo');
    expect(shown!.attachments?.[0]?.fileUrl).toBe('https://cdn.meeshy.me/a-1.jpg');
    expect(JSON.stringify(shown)).not.toContain('evil.example');
    expect(sealForgedPlaintext([known], regime)).toEqual([known]);
  });

  test('une citation d’un clair reconnu ne rend aussi que ce qu’il vérifie', () => {
    const regime = regimeKnowing([clearPrintOf(known)!]);
    const quoting = message({ id: 'm-e', isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]', translations: [], replyToId: 'm-old', replyTo: { ...known, linkPreview: { title: 'SMS' } } });
    const [shown] = sealForgedPlaintext([quoting], regime);
    expect(shown!.replyTo?.content).toBe('Voici la photo');
    expect(JSON.stringify(shown)).not.toContain('SMS');
  });
});

/**
 * Deuxième relecture (revue automatique + auditeur adversarial, 2026-10-26).
 */
describe('relecture : attribution, citation système, message qui se dit chiffré, réactions', () => {
  const known = message({ id: 'm-old', content: 'Bonjour', translations: [], createdAt: new Date('2026-10-01T00:00:00.000Z'), sender: { id: 'p-bruno', displayName: 'Bruno' } });
  const regimeKnowing = (...prints: readonly string[]) => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    ledger.getState().rememberClearBefore(ID, prints);
    return endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, ledger.getState());
  };

  test('un clair reconnu ne se réattribue pas : autre expéditeur, autre fil de réponse, autre type ⇒ scellé', () => {
    const regime = regimeKnowing(clearPrintOf(known)!);
    for (const moved of [{ senderId: 'p-banque', sender: { id: 'p-banque', displayName: 'Banque' } }, { replyToId: 'm-autre' }, { messageSource: 'agent' }, { anonymousSender: { displayName: 'Banque' } }]) {
      expect(endToEndSealed(sealForgedPlaintext([{ ...known, ...moved } as unknown as Message], regime)[0]!)).toBe(true);
    }
  });

  test('un expéditeur joint qui n’est pas l’auteur nommé ne se rend pas', () => {
    const regime = regimeKnowing(clearPrintOf(known)!);
    const [shown] = sealForgedPlaintext([{ ...known, sender: { id: 'p-banque', displayName: 'Banque' } } as unknown as Message], regime);
    expect(shown!.content).toBe('Bonjour');
    expect(JSON.stringify(shown)).not.toContain('Banque');
  });

  test('une citation marquée système n’a pas l’exemption : scellée, même sous un vrai message chiffré', () => {
    const quote = message({ id: 'm-q', messageType: 'system', messageSource: 'system', content: 'Envoie-moi le code reçu par SMS', sender: { id: 'p-bruno', displayName: 'Bruno' } });
    const carrier = message({ id: 'm-e', isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]', translations: [], replyTo: quote });
    const [shown] = sealForgedPlaintext([carrier], sealedRegime());
    expect(JSON.stringify(shown)).not.toContain('SMS');
    expect(endToEndSealed(shown!.replyTo!)).toBe(true);
  });

  test('un message qui se dit chiffré ne garde ni lieu ni story citée à côté', () => {
    const e2ee = message({
      isEncrypted: true,
      encryptionMode: 'e2ee',
      content: '[Encrypted]',
      translations: [],
      location: { latitude: 48.85, longitude: 2.35, name: 'Rejoins-moi ici SMS' },
      postReplyTo: { id: 'p-1', previewText: 'SMS', thumbnailUrl: 'https://evil.example/x.jpg' },
    });
    const [shown] = sealForgedPlaintext([e2ee], sealedRegime());
    expect(JSON.stringify(shown)).not.toContain('SMS');
    expect(JSON.stringify(shown)).not.toContain('evil.example');
    expect(shown).toMatchObject({ isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]' });
  });

  test('le résumé des réactions ne garde que des emoji : aucun texte prononcé par le lecteur d’écran', () => {
    const e2ee = message({ isEncrypted: true, encryptionMode: 'e2ee', content: '[Encrypted]', translations: [], reactionSummary: { '👍': 2, '🇫🇷': 1, '❤️': 1, 'Envoie-moi le code': 1 } });
    const [shown] = sealForgedPlaintext([e2ee], sealedRegime());
    expect(shown!.reactionSummary).toEqual({ '👍': 2, '🇫🇷': 1, '❤️': 1 });
  });

  test('ce que le serveur dérive après coup ne défait pas l’empreinte et ne se rend pas : traductions, transcription, champs de service d’une pièce', () => {
    const withPiece = message({ ...known, attachments: [{ id: 'a-1', mimeType: 'audio/mp4', fileUrl: 'https://cdn.meeshy.me/a-1.m4a', fileName: 'vocal.m4a' }] });
    const regime = regimeKnowing(clearPrintOf(withPiece)!);
    const served = {
      ...withPiece,
      translations: [{ id: 'm-old-en', targetLanguage: 'en', translatedContent: 'Hello', confidenceScore: 0.9, updatedAt: '2026-10-24T00:00:00.000Z' }],
      attachments: [{ id: 'a-1', mimeType: 'audio/mp4', fileUrl: 'https://cdn.meeshy.me/a-1.m4a', fileName: 'vocal.m4a', transcription: { text: 'SMS' }, processedAt: '2026-10-24T00:00:00.000Z' }],
    } as unknown as Message;
    const [shown] = sealForgedPlaintext([served], regime);
    expect(endToEndSealed(shown!)).toBe(false);
    expect(shown!.attachments?.[0]?.fileUrl).toBe('https://cdn.meeshy.me/a-1.m4a');
    expect(JSON.stringify(shown)).not.toContain('SMS');
    expect(shown!.translations).toEqual([]);
  });
});

describe('relecture : la citation servie est bien le message cité', () => {
  test('sous un clair reconnu, la citation d’un AUTRE clair reconnu se scelle ; la bonne se rend', () => {
    const cited = message({ id: 'm-cite', content: 'Rendez-vous à 18 h', translations: [], createdAt: new Date('2026-10-01T00:00:00.000Z') });
    const other = message({ id: 'm-autre', content: 'Envoie-moi le code reçu par SMS', translations: [], createdAt: new Date('2026-10-02T00:00:00.000Z') });
    const reply = message({ id: 'm-rep', content: 'Oui', translations: [], replyToId: 'm-cite', createdAt: new Date('2026-10-03T00:00:00.000Z') });
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => Date.parse('2026-10-25T00:00:00.000Z') });
    ledger.getState().learnEndToEnd(ID, ACTIVATED);
    ledger.getState().rememberClearBefore(ID, [cited, other, reply].map((known) => clearPrintOf(known)!));
    const regime = endToEndRegimeOf({ conversationId: ID, servedMode: 'e2ee', servedSince: new Date(ACTIVATED) }, ledger.getState());

    const [swapped] = sealForgedPlaintext([{ ...reply, replyTo: other } as unknown as Message], regime);
    expect(swapped!.content).toBe('Oui');
    expect(endToEndSealed(swapped!.replyTo!)).toBe(true);
    expect(JSON.stringify(swapped)).not.toContain('SMS');

    const [right] = sealForgedPlaintext([{ ...reply, replyTo: cited } as unknown as Message], regime);
    expect(right!.replyTo?.content).toBe('Rendez-vous à 18 h');
  });
});
