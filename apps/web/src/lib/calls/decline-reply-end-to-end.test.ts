import { afterEach, describe, expect, test } from 'bun:test';

import { createHttpTransport } from '@/lib/api/http';
import { createAppQueryClient, type StorageLike } from '@/lib/api/query-client';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { createOutboxStore, entriesOf } from '@/lib/send/outbox-store';
import { performSend } from '@/lib/send/perform-send';

import { declineWithReply } from './decline-reply';

/**
 * #13171 — REFUSER UN APPEL PAR UN MESSAGE DANS UNE CONVERSATION CHIFFRÉE DE
 * BOUT EN BOUT NE LAISSE AUCUN CLAIR : ni dans le cache rangé du navigateur
 * (la ligne de liste optimiste), ni dans l'outbox, ni dans une requête. Le web
 * ne sait pas sceller (#12975) : rien ne naît, et la feuille le dit.
 */
const ID = 'c-e2ee-call';
const SECRET = 'Je te rappelle depuis la gare';

afterEach(() => endToEndRegimeLedger.getState().reset());

const memoryStorage = (): StorageLike & { readonly raw: Map<string, string> } => {
  const raw = new Map<string, string>();
  return { raw, getItem: (key) => raw.get(key) ?? null, setItem: (key, value) => void raw.set(key, value), removeItem: (key) => void raw.delete(key) };
};

const recordingTransport = () => {
  const bodies: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(`${String(input)} ${String(init?.body ?? '')}`);
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
  }) as typeof fetch;
  return { bodies, transport: createHttpTransport({ base: '', fetchImpl: impl }) };
};

describe('le refus d’appel par message, conversation e2ee (#13171)', () => {
  test('aucun octet du clair dans le cache rangé, l’outbox ni une requête', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(ID);
    const storage = memoryStorage();
    const queryClient = createAppQueryClient({ storage, buster: '0.0.0-test:u1' });
    queryClient.setQueryData(['conversations'], { pages: [{ conversations: [{ id: ID, type: 'direct', encryptionMode: 'e2ee' }] }], pageParams: [undefined] });
    const outbox = createOutboxStore();
    const { bodies, transport } = recordingTransport();
    const sends: Promise<void>[] = [];
    const declined: string[] = [];

    const accepted = declineWithReply({
      call: { conversationId: ID, phase: { kind: 'incoming' } },
      text: SECRET,
      language: 'fr',
      deps: {
        decline: () => declined.push('decline'),
        send: ({ conversationId, content, language }) =>
          void sends.push(
            performSend({
              conversationId,
              draft: { content, originalLanguage: language },
              viewerId: 'u-moi',
              deps: { source: 'gateway', transport, queryClient, outbox, online: true },
            }),
          ),
      },
    });
    await Promise.all(sends);
    queryClient.persist();

    expect(accepted).toBe(true);
    expect([...storage.raw.values()].join('')).not.toContain(SECRET);
    expect(JSON.stringify(entriesOf(outbox.getState(), ID))).not.toContain(SECRET);
    expect(bodies).toEqual([]);
  });

  test('la feuille sait d’avance qu’elle ne peut pas répondre : ni refus, ni envoi', () => {
    const events: string[] = [];
    const accepted = declineWithReply({
      call: { conversationId: ID, phase: { kind: 'incoming' } },
      text: SECRET,
      language: 'fr',
      deps: { decline: () => events.push('decline'), send: () => events.push('send'), canReply: () => false },
    });
    expect(accepted).toBe(false);
    expect(events).toEqual([]);
  });
});
