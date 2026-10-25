import { describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';

import { LIBSIGNAL_PROTOCOL } from '@meeshy/shared/types/e2ee-directory';

import { canSendPlaintext, createEndToEndRegimeLedger, endToEndSealed, isEndToEndMode, type SealedStorage } from './end-to-end-regime-ledger';
import { LIBSIGNAL_PROTOCOL_MARK, threadShowsEndToEnd } from './end-to-end-thread-signal';

/**
 * #12949 — UNE CONVERSATION VUE CHIFFRÉE DE BOUT EN BOUT RESTE FERMÉE AU CLAIR
 * (décision porteur du 2026-10-25). Le bout en bout ne se désactive pas : toute
 * rétrogradation servie (mode absent, bascule à `null`, avis de désactivation)
 * est ignorée. Il n'y a ni confirmation, ni époque à départager.
 */
const ID = 'c-0001';

const memoryStorage = (): SealedStorage & { readonly data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

const message = (extra: Record<string, unknown>): Message =>
  ({ id: 'm', conversationId: ID, messageType: 'text', messageSource: 'user', content: 'x', isEncrypted: false, createdAt: new Date(), ...extra }) as unknown as Message;

describe('le protocole libsignal', () => {
  test('la marque écrite à la main est celle du contrat partagé', () => {
    expect(LIBSIGNAL_PROTOCOL_MARK).toBe(LIBSIGNAL_PROTOCOL);
  });
});

describe('le mode de bout en bout', () => {
  test('quelle que soit la casse, et rien d’autre', () => {
    expect(isEndToEndMode('e2ee')).toBe(true);
    expect(isEndToEndMode('E2EE')).toBe(true);
    expect(isEndToEndMode('server')).toBe(false);
    expect(isEndToEndMode('hybrid')).toBe(false);
    expect(isEndToEndMode(null)).toBe(false);
    expect(isEndToEndMode(undefined)).toBe(false);
  });
});

describe('ce que le fil montre du bout en bout', () => {
  test('un message chiffré de bout en bout affiché suffit, même sans régime servi (#12986, option 2)', () => {
    expect(threadShowsEndToEnd([message({}), message({ encryptionMode: 'e2ee', isEncrypted: true, content: '' })])).toBe(true);
    expect(threadShowsEndToEnd([message({ encryptionMode: 'E2EE', isEncrypted: true, content: '' })])).toBe(true);
  });

  test('un envoi libsignal se reconnaît aussi à ses métadonnées', () => {
    expect(threadShowsEndToEnd([message({ isEncrypted: true, content: '', encryptionMetadata: { protocol: 'libsignal-v1' } })])).toBe(true);
  });

  test('un message chiffré SUPPRIMÉ ne scelle pas : la passerelle ne le sert plus, seul un cache local en garde la trace (audit #12986)', () => {
    expect(threadShowsEndToEnd([message({ encryptionMode: 'e2ee', isEncrypted: true, content: '', deletedAt: new Date() })])).toBe(false);
    expect(threadShowsEndToEnd([message({ encryptionMode: 'e2ee', isEncrypted: true, content: '', deletedAt: '2026-10-25T02:07:01.630Z' })])).toBe(false);
    expect(threadShowsEndToEnd([message({ encryptionMode: 'e2ee', isEncrypted: true, content: '', deletedAt: null })])).toBe(true);
  });

  test('seul un marqueur que la passerelle admet comme e2ee scelle : ni un chiffré sans mode, ni un mode inconnu, ni un mode de métadonnées seul (revue #12986)', () => {
    expect(
      threadShowsEndToEnd([
        message({ isEncrypted: true, content: '[Encrypted]', encryptionMode: null }),
        message({ isEncrypted: true, content: '[Encrypted]' }),
        message({ isEncrypted: true, content: '[Encrypted]', encryptionMode: 'signal_v4' }),
        message({ isEncrypted: true, content: '', encryptionMetadata: { mode: 'e2ee' } }),
        message({ isEncrypted: true, content: '', encryptedContent: 'libsignal-v1' }),
      ]),
    ).toBe(false);
  });

  test('un chiffré SERVEUR ou hybride n’est pas du bout en bout', () => {
    expect(
      threadShowsEndToEnd([
        message({ isEncrypted: true, encryptionMode: 'server', encryptionMetadata: { mode: 'server', protocol: 'aes-256-gcm' } }),
        message({ isEncrypted: true, encryptionMode: 'hybrid' }),
        message({ isEncrypted: true, encryptionMode: 'SERVER' }),
        message({ encryptedContent: 'Y2xhaXI=' }),
      ]),
    ).toBe(false);
  });

  test('l’avis système d’activation du bout en bout, par métadonnée ou par évènement', () => {
    expect(threadShowsEndToEnd([message({ messageType: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee', epoch: 1 } })])).toBe(true);
    expect(threadShowsEndToEnd([message({ messageType: 'system', systemEvent: { key: 'system.encryption-enabled', params: { mode: 'e2ee' } } })])).toBe(true);
  });

  test('ni le clair, ni un avis d’un autre mode, ni un texte d’utilisateur qui imiterait l’avis', () => {
    expect(
      threadShowsEndToEnd([
        message({}),
        message({ encryptionMode: 'server' }),
        message({ messageType: 'system', metadata: { kind: 'encryption-enabled', mode: 'server' } }),
        message({ metadata: { kind: 'encryption-enabled', mode: 'e2ee' } }),
      ]),
    ).toBe(false);
  });

  test('un avis de désactivation ne retire RIEN : le fil qui montre le bout en bout le montre encore', () => {
    expect(
      threadShowsEndToEnd([
        message({ messageType: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee', epoch: 1 } }),
        message({ messageType: 'system', metadata: { kind: 'encryption-disabled', previousMode: 'e2ee', epoch: 2 } }),
      ]),
    ).toBe(true);
  });
});

describe('une conversation vue e2ee reste fermée au clair', () => {
  test('servie e2ee : fermée', () => {
    const ledger = createEndToEndRegimeLedger();
    expect(endToEndSealed(ledger.getState(), { conversationId: ID, servedMode: 'e2ee' })).toBe(true);
  });

  test('apprise e2ee, puis servie sans mode par le serveur : fermée — la rétrogradation est ignorée', () => {
    const ledger = createEndToEndRegimeLedger();
    ledger.getState().learnEndToEnd(ID);
    expect(endToEndSealed(ledger.getState(), { conversationId: ID, servedMode: null })).toBe(true);
    expect(endToEndSealed(ledger.getState(), { conversationId: ID, servedMode: 'server' })).toBe(true);
  });

  /* Que le fil montré FERME la conversation se prouve là où il est lu : le fil
     ouvert (`thread-write-lock.test.tsx`) et la surveillance du cache
     (`api/end-to-end-cache-watch.test.ts`, `send/plaintext-guard.test.ts`). */

  test('jamais vue chiffrée par ce navigateur : le clair, sans rien demander', () => {
    const ledger = createEndToEndRegimeLedger();
    expect(endToEndSealed(ledger.getState(), { conversationId: ID, servedMode: null })).toBe(false);
    expect(endToEndSealed(ledger.getState(), { conversationId: ID, servedMode: 'server' })).toBe(false);
  });

  test('aucun geste ne la rouvre : le registre n’a ni confirmation ni oubli par conversation', () => {
    const state = createEndToEndRegimeLedger().getState() as unknown as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(['bind', 'identity', 'learnEndToEnd', 'reset', 'sealed']);
  });

  test('la garde partagée de l’envoi lit le registre', () => {
    const ledger = createEndToEndRegimeLedger();
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(true);
    ledger.getState().learnEndToEnd(ID);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
    expect(canSendPlaintext({ conversationId: 'c-autre' }, ledger.getState())).toBe(true);
  });
});

describe('le registre appartient à une identité et survit au rechargement', () => {
  test('appris sous A, retrouvé par un registre neuf lié à A', () => {
    const storage = memoryStorage();
    const first = createEndToEndRegimeLedger({ storage });
    first.getState().bind('u:a');
    first.getState().learnEndToEnd(ID);

    const reloaded = createEndToEndRegimeLedger({ storage });
    reloaded.getState().bind('u:a');

    expect(canSendPlaintext({ conversationId: ID }, reloaded.getState())).toBe(false);
  });

  test('sous B, le registre de A ne vaut rien ; de retour sous A, il revient', () => {
    const storage = memoryStorage();
    const ledger = createEndToEndRegimeLedger({ storage });
    ledger.getState().bind('u:a');
    ledger.getState().learnEndToEnd(ID);

    ledger.getState().bind('u:b');
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(true);

    ledger.getState().bind('u:a');
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });

  test('sans identité (déconnexion), rien n’est retenu ni écrit', () => {
    const storage = memoryStorage();
    const ledger = createEndToEndRegimeLedger({ storage });
    ledger.getState().bind('u:a');
    ledger.getState().learnEndToEnd(ID);
    ledger.getState().bind(null);

    expect(ledger.getState().sealed).toEqual({});
    ledger.getState().learnEndToEnd('c-sans-compte');
    expect([...storage.data.keys()]).toEqual(['meeshy.e2ee-sealed.u:a']);
  });

  test('un stockage illisible, plein ou corrompu ne rouvre rien de ce qui est en mémoire', () => {
    const broken: SealedStorage = {
      getItem: () => '{pas du json',
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const ledger = createEndToEndRegimeLedger({ storage: broken });
    ledger.getState().bind('u:a');
    ledger.getState().learnEndToEnd(ID);
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });

  test('appris AVANT toute liaison (démarrage), puis lié au compte : rien n’est perdu, et c’est rangé sous le compte (audit #12949)', () => {
    const storage = memoryStorage();
    const previous = createEndToEndRegimeLedger({ storage });
    previous.getState().bind('u:a');
    previous.getState().learnEndToEnd('c-x');

    const booting = createEndToEndRegimeLedger({ storage });
    booting.getState().learnEndToEnd('c-y');
    booting.getState().bind('u:a');

    expect(canSendPlaintext({ conversationId: 'c-x' }, booting.getState())).toBe(false);
    expect(canSendPlaintext({ conversationId: 'c-y' }, booting.getState())).toBe(false);
    expect(JSON.parse(storage.data.get('meeshy.e2ee-sealed.u:a') ?? '[]').sort()).toEqual(['c-x', 'c-y']);
  });

  test('relier au MÊME compte ne perd rien de la mémoire', () => {
    const ledger = createEndToEndRegimeLedger({ storage: null });
    ledger.getState().bind('u:a');
    ledger.getState().learnEndToEnd(ID);
    ledger.getState().bind('u:a');
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });

  test('reset vide la mémoire sans effacer ce que le compte a vu', () => {
    const storage = memoryStorage();
    const ledger = createEndToEndRegimeLedger({ storage });
    ledger.getState().bind('u:a');
    ledger.getState().learnEndToEnd(ID);
    ledger.getState().reset();
    expect(ledger.getState().sealed).toEqual({});
    ledger.getState().bind('u:a');
    expect(canSendPlaintext({ conversationId: ID }, ledger.getState())).toBe(false);
  });
});
