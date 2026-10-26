import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, test } from 'bun:test';

import { recipientRows } from '@/components/send-sheet-model';
import { performMessageEdit } from '@/lib/api/edit-message';
import { watchEndToEndConversations } from '@/lib/api/end-to-end-cache-watch';
import { createHttpTransport } from '@/lib/api/http';
import { watchIdentityScopedStores } from '@/lib/api/identity-scoped-stores';
import { messagesQueryKey, sendMessage } from '@/lib/api/messages';
import { createSessionStore, type SessionStoreApi } from '@/lib/api/session';
import type { Conversation, Message } from '@/lib/api/types';
import { createTypingStore } from '@/lib/api/typing-store';
import { conversationStore } from '@/lib/conversation-store';
import { createEndToEndRegimeLedger, E2EE_PLAINTEXT_WITHHELD, endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';

import { pendingAttachmentOf } from './attachments';
import { createOutboxStore, entriesOf } from './outbox-store';
import { performSend, type SendDeps } from './perform-send';
import { planSend, type SendPayload } from './send-sheet-plan';
import { createSendRun, type SendSheetPorts } from './send-sheet-run';

/**
 * #12949 — UNE CONVERSATION VUE e2ee RESTE FERMÉE AU CLAIR, POUR TOUT ENVOI.
 *
 * Relevé des sites du web : `sendMessage` (`lib/api/messages.ts`) est le SEUL
 * `POST conversations.byIdMessages` — composeur (`perform-send.ts`), outbox,
 * file hors connexion, transfert (`forward.ts`), feuille d'envoi et partage
 * entrant (`send-sheet-run.ts` par `send-sheet-ports.ts`) y passent. Deux
 * chemins TÉLÉVERSENT avant de l'appeler (le composeur, la feuille d'envoi de
 * fichiers) : la garde y est lue AVANT le téléversement, sinon le fichier
 * partirait en clair au serveur même si le message était retenu. La
 * modification d'un message (`PUT messages.byMessageId`) la lit aussi.
 */
const ID = 'c-sealed';

afterEach(() => {
  endToEndRegimeLedger.getState().reset();
});

const recordingFetch = () => {
  const urls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return new Response(JSON.stringify({ success: true, data: { id: 'm1', conversationId: ID, createdAt: '2026-10-25T12:00:00.000Z' } }), { status: 200 });
  }) as typeof fetch;
  return { urls, transport: createHttpTransport({ base: '', fetchImpl: impl }) };
};

describe('l’envoi unique du web', () => {
  test('vue e2ee puis servie sans mode : sendMessage refuse SANS toucher au réseau', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(ID);
    const { urls, transport } = recordingFetch();

    const result = await sendMessage({ source: 'gateway', transport, conversationId: ID, body: { content: 'clair', originalLanguage: 'fr', clientMessageId: 'cid_1' } });

    expect(result).toMatchObject({ ok: false, code: E2EE_PLAINTEXT_WITHHELD });
    expect(urls).toEqual([]);
  });

  test('une conversation jamais vue chiffrée : le message part', async () => {
    const { urls, transport } = recordingFetch();

    await sendMessage({ source: 'gateway', transport, conversationId: 'c-plain', body: { content: 'clair', originalLanguage: 'fr', clientMessageId: 'cid_2' } });

    expect(urls).toHaveLength(1);
  });
});

describe('un fil chargé qui porte un message chiffré de bout en bout scelle tout envoi (#12986)', () => {
  test('le fil est en cache, le serveur sert la conversation sans mode : sendMessage refuse SANS toucher au réseau', async () => {
    const client = new QueryClient();
    const unwatch = watchEndToEndConversations(client, endToEndRegimeLedger);
    client.setQueryData(messagesQueryKey(ID), {
      pages: [{ messages: [{ id: 'e1', conversationId: ID, messageType: 'text', content: '', isEncrypted: true, encryptionMode: 'e2ee' }], hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
    const { urls, transport } = recordingFetch();

    const result = await sendMessage({ source: 'gateway', transport, conversationId: ID, body: { content: 'clair', originalLanguage: 'fr', clientMessageId: 'cid_t' } });

    expect(result).toMatchObject({ ok: false, code: E2EE_PLAINTEXT_WITHHELD });
    expect(urls).toEqual([]);
    unwatch();
  });
});

describe('un fil servi sans mode qui affiche un chiffré sans mode retient l’envoi sans rien apprendre (#13099)', () => {
  test('sendMessage refuse SANS toucher au réseau, et le registre du compte reste vide', async () => {
    const client = new QueryClient();
    const unwatch = watchEndToEndConversations(client, endToEndRegimeLedger);
    client.setQueryData(messagesQueryKey(ID), {
      pages: [{ messages: [{ id: 'n1', conversationId: ID, messageType: 'text', messageSource: 'user', content: '[Encrypted]', isEncrypted: true }], hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
    const { urls, transport } = recordingFetch();

    const result = await sendMessage({ source: 'gateway', transport, conversationId: ID, body: { content: 'clair', originalLanguage: 'fr', clientMessageId: 'cid_h' } });

    expect(result).toMatchObject({ ok: false, code: E2EE_PLAINTEXT_WITHHELD });
    expect(urls).toEqual([]);
    expect(endToEndRegimeLedger.getState().sealed).toEqual({});
    unwatch();
  });
});

describe('le composeur ne téléverse rien vers une conversation vue e2ee', () => {
  test('photo jointe : aucun téléversement, aucun message, l’envoi est marqué retenu', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(ID);
    const { urls, transport } = recordingFetch();
    const outbox = createOutboxStore();
    const deps: SendDeps = { source: 'gateway', transport, queryClient: new QueryClient(), outbox, online: true };

    await performSend({
      conversationId: ID,
      draft: { content: 'regarde', originalLanguage: 'fr', attachments: [pendingAttachmentOf(new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }))] },
      viewerId: 'u-moi',
      deps,
    });

    expect(urls).toEqual([]);
    expect(entriesOf(outbox.getState(), ID)[0]?.lastError?.code).toBe(E2EE_PLAINTEXT_WITHHELD);
  });
});

describe('la feuille d’envoi ne téléverse ni n’envoie vers une conversation vue e2ee', () => {
  const ports = (calls: string[]): SendSheetPorts => ({
    online: () => true,
    openDirect: async () => ({ ok: true, data: { id: ID } }),
    openGroup: async () => ({ ok: true, data: { id: 'g' } }),
    forward: async () => {
      calls.push('forward');
      return { ok: true, count: 1 };
    },
    sendMessage: async (p) => {
      calls.push(`sendMessage:${p.conversationId}`);
      return { ok: true, data: { id: 'm', conversationId: p.conversationId, createdAt: '2026-10-25T12:00:00.000Z' } };
    },
    uploadFiles: async () => {
      calls.push('uploadFiles');
      return { ok: true, data: { attachmentIds: ['att'] } };
    },
    fetchFile: async () => null,
    uploadMedia: async () => ({ ok: false, status: 0, error: 'x' }),
    publishMedia: async () => ({ ok: false, status: 0, error: 'x' }),
    publishFromAttachment: async () => ({ ok: false, status: 0, error: 'x' }),
    repost: async () => ({ ok: false, status: 0, error: 'x' }),
    createTextPost: async () => ({ ok: false, status: 0, error: 'x' }),
    newClientMessageId: () => 'cid',
  });

  const run = (payload: SendPayload, conversationId: string, calls: string[]) => {
    const planned = planSend({ payload, targets: [{ kind: 'conversation', conversationId, label: conversationId }], caption: 'légende', viewerId: 'me' });
    if (!planned.ok) throw new Error('plan refusé');
    return createSendRun({ entries: planned.entries, payload, language: 'fr', ports: ports(calls) });
  };

  const payloads: ReadonlyArray<readonly [string, SendPayload]> = [
    ['des fichiers partagés', { kind: 'files', files: [new File([new Uint8Array(2)], 'a.png', { type: 'image/png' })] }],
    ['un message transféré', { kind: 'messages', conversationId: 'src', messages: [{ id: 'm1', content: 'Salut', originalLanguage: 'fr' }], exit: [{ id: 'm1', text: 'Salut' }], preview: { kind: 'text' } }],
  ];
  for (const [label, payload] of payloads) {
    test(`${label} : rien ne part, la cible est refusée`, async () => {
      endToEndRegimeLedger.getState().learnEndToEnd(ID);
      const calls: string[] = [];
      const sheet = run(payload, ID, calls);

      await sheet.start();

      expect(calls).toEqual([]);
      const status = Object.values(sheet.getState().statuses)[0];
      expect(status).toMatchObject({ state: 'failed', failure: { kind: 'refused', code: E2EE_PLAINTEXT_WITHHELD } });
    });
  }

  test('vers une conversation jamais vue chiffrée, les fichiers partent', async () => {
    const calls: string[] = [];
    await run({ kind: 'files', files: [new File([new Uint8Array(2)], 'a.png', { type: 'image/png' })] }, 'c-plain', calls).start();
    expect(calls).toContain('uploadFiles');
  });
});

describe('la modification d’un message', () => {
  test('vue e2ee : le nouveau texte ne part pas', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(ID);
    const { urls, transport } = recordingFetch();
    const message = { id: 'm1', conversationId: ID, content: 'avant', isEdited: false, translations: [] } as unknown as Message;

    const outcome = await performMessageEdit({ queryClient: new QueryClient(), conversationId: ID, message, content: 'après', transport });

    expect(outcome).toBe('refused');
    expect(urls).toEqual([]);
  });
});

describe('la feuille d’envoi montre la conversation vue e2ee avec son cadenas', () => {
  const conversation = (id: string, encryptionMode: string | null): Conversation =>
    ({ id, type: 'group', title: id, isActive: true, participants: [], memberCount: 3, encryptionMode }) as unknown as Conversation;

  test('servie sans mode mais vue e2ee : verrouillée comme une conversation servie e2ee ; jamais vue : en clair', () => {
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen');
    const rows = recipientRows({
      conversations: [conversation('c-e2ee', 'e2ee'), conversation('c-seen', null), conversation('c-plain', null)],
      friends: [],
      searchResults: undefined,
      viewerId: 'u-moi',
      query: '',
    });
    expect(rows.conversations.map((row) => [row.key, row.encrypted])).toEqual([
      ['conversation:c-e2ee', true],
      ['conversation:c-seen', true],
      ['conversation:c-plain', false],
    ]);
  });
});

describe('le registre appartient à une identité', () => {
  const memory = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
  };
  const signIn = (session: SessionStoreApi, id: string) =>
    session.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `s-${id}`, expiresIn: 86_400 });
  const noStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

  test('lié au compte ouvert dès la surveillance, puis au suivant : ce qu’A a vu ne vaut pas pour B, et revient pour A', () => {
    const ledger = createEndToEndRegimeLedger({ storage: memory() });
    const session = createSessionStore({ storage: noStorage });
    signIn(session, 'a');
    const unwatch = watchIdentityScopedStores({ session, outbox: createOutboxStore(), conversations: conversationStore, typing: createTypingStore(), endToEndRegime: ledger });
    ledger.getState().learnEndToEnd(ID);

    signIn(session, 'b');
    expect(ledger.getState().sealed).toEqual({});

    signIn(session, 'a');
    expect(ledger.getState().sealed).toEqual({ [ID]: true });
    unwatch();
  });

  test('la déconnexion vide la mémoire', () => {
    const ledger = createEndToEndRegimeLedger({ storage: memory() });
    const session = createSessionStore({ storage: noStorage });
    signIn(session, 'a');
    const unwatch = watchIdentityScopedStores({ session, outbox: createOutboxStore(), conversations: conversationStore, typing: createTypingStore(), endToEndRegime: ledger });
    ledger.getState().learnEndToEnd(ID);

    session.getState().clearSession();

    expect(ledger.getState().sealed).toEqual({});
    unwatch();
  });
});
