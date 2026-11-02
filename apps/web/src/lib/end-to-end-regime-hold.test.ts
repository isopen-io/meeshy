import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { canSendPlaintext, createEndToEndRegimeLedger, type SealedStorage } from './end-to-end-regime-ledger';
import { threadHoldsSend, threadShowsEndToEnd } from './end-to-end-thread-signal';

/**
 * #13099 — LES TROIS CLASSES D'iOS (`EndToEndRegimeLedger.seals(for:…trail:isDirect:)`).
 * Un message e2ee ou l'avis d'activation s'apprennent (le message seulement dans
 * un tête-à-tête) ; un message chiffré SANS mode, d'un mode inconnu, ou e2ee
 * dans un groupe scelle l'envoi EN COURS sans jamais s'écrire dans la mémoire
 * du compte ; `server`, `hybrid` et le clair ne font rien.
 */
const ID = 'c-hold';

const memoryStorage = (): SealedStorage & { readonly data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => void data.set(key, value) };
};

const message = (extra: Record<string, unknown>): Message =>
  ({ id: 'm', conversationId: ID, messageType: 'text', messageSource: 'user', content: 'x', isEncrypted: false, createdAt: new Date('2026-10-26T10:00:00.000Z'), ...extra }) as unknown as Message;

const noMode = message({ isEncrypted: true, content: '[Encrypted]' });
const unknownMode = message({ isEncrypted: true, content: '[Encrypted]', encryptionMode: 'signal_v4' });
const endToEnd = message({ isEncrypted: true, content: '[Encrypted]', encryptionMode: 'e2ee' });

describe('ce qui scelle l’envoi en cours sans s’apprendre', () => {
  test('un chiffré sans mode ou d’un mode inconnu retient l’envoi, dans un tête-à-tête comme dans un groupe', () => {
    for (const isDirect of [true, false]) {
      expect(threadHoldsSend([noMode], { isDirect })).toBe(true);
      expect(threadHoldsSend([unknownMode], { isDirect })).toBe(true);
      expect(threadShowsEndToEnd([noMode, unknownMode], { isDirect })).toBe(false);
    }
  });

  test('un message e2ee s’apprend dans un tête-à-tête ; dans un groupe il retient sans s’apprendre', () => {
    expect(threadShowsEndToEnd([endToEnd], { isDirect: true })).toBe(true);
    expect(threadShowsEndToEnd([endToEnd], { isDirect: false })).toBe(false);
    expect(threadHoldsSend([endToEnd], { isDirect: false })).toBe(true);
  });

  test('l’avis d’activation s’apprend partout', () => {
    const notice = message({ messageType: 'system', messageSource: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee', epoch: 1 } });
    expect(threadShowsEndToEnd([notice], { isDirect: false })).toBe(true);
  });

  test('server, hybrid, le clair, un supprimé ou un message système ne retiennent rien', () => {
    const quiet = [
      message({}),
      message({ isEncrypted: true, encryptionMode: 'server' }),
      message({ isEncrypted: true, encryptionMode: 'HYBRID' }),
      message({ isEncrypted: true, deletedAt: '2026-10-25T02:07:01.630Z' }),
      message({ isEncrypted: true, messageType: 'system', messageSource: 'system' }),
    ];
    expect(threadHoldsSend(quiet, { isDirect: false })).toBe(false);
  });
});

describe('la retenue vit en mémoire, jamais dans le registre du compte', () => {
  test('retenue : rien ne part ; relâchée : le clair repart, et le stockage n’a rien appris', () => {
    const storage = memoryStorage();
    const ledger = createEndToEndRegimeLedger({ storage });
    ledger.getState().bind('u:a');

    ledger.getState().holdSend(ID, true);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
    expect(ledger.getState().sealed).toEqual({});
    expect(storage.data.get('meeshy.e2ee-sealed.u:a') ?? '[]').toBe('[]');

    ledger.getState().holdSend(ID, false);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(true);
  });

  test('relâcher une retenue ne rouvre jamais une conversation apprise', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().learnEndToEnd(ID);
    ledger.getState().holdSend(ID, true);
    ledger.getState().holdSend(ID, false);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });

  test('un changement de compte vide les retenues', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().bind('u:a');
    ledger.getState().holdSend(ID, true);
    ledger.getState().bind('u:b');
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(true);
  });
});

/**
 * #12992 — L'ÈRE DU RÉGIME. Le registre retient, avec la conversation,
 * l'instant à partir duquel elle est chiffrée de bout en bout : la plus
 * ancienne preuve reçue, bornée par l'horloge de ce navigateur au moment où il
 * l'apprend (#12936). Un registre d'avant ce lot (sans ère) est borné à sa
 * première lecture.
 */
describe('l’ère du bout en bout', () => {
  test('apprise sans preuve datée : l’instant où ce navigateur l’apprend', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => 5_000 });
    ledger.getState().learnEndToEnd(ID);
    expect(ledger.getState().since[ID]).toBe(5_000);
  });

  test('la preuve la plus ancienne l’emporte, jamais une plus récente', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => 9_000 });
    ledger.getState().learnEndToEnd(ID, 4_000);
    ledger.getState().learnEndToEnd(ID, 6_000);
    ledger.getState().learnEndToEnd(ID, 2_000);
    expect(ledger.getState().since[ID]).toBe(2_000);
  });

  test('une preuve datée dans le futur est bornée par l’horloge', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null, now: () => 9_000 });
    ledger.getState().learnEndToEnd(ID, 50_000);
    expect(ledger.getState().since[ID]).toBe(9_000);
  });

  test('elle survit au rechargement, sous le compte', () => {
    const storage = memoryStorage();
    const first = createEndToEndRegimeLedger({ storage, now: () => 9_000 });
    first.getState().bind('u:a');
    first.getState().learnEndToEnd(ID, 3_000);

    const reloaded = createEndToEndRegimeLedger({ storage, now: () => 99_000 });
    reloaded.getState().bind('u:a');
    expect(reloaded.getState().since[ID]).toBe(3_000);
  });

  test('un registre d’avant l’ère : chaque conversation scellée prend l’instant de sa première lecture', () => {
    const storage = memoryStorage();
    storage.setItem('meeshy.e2ee-sealed.u:a', JSON.stringify([ID]));
    const ledger = createEndToEndRegimeLedger({ storage, now: () => 7_000 });
    ledger.getState().bind('u:a');
    expect(ledger.getState().since[ID]).toBe(7_000);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });
});
