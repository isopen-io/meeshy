import { afterEach, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { Message } from '@/lib/api/types';
import { createPeerDeviceReachStore } from '@/lib/e2ee/peer-device-reach';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import type { Draft } from '@/lib/send/perform-send';

import { createReadableRedirectNotices, redirectedDraft, sendWithheld, type ReadableRedirectPorts } from './readable-redirect';

/**
 * **ÉCRIRE À UN PAIR SANS APPAREIL CHIFFRÉ MÈNE À NOTRE CONVERSATION EN CLAIR**
 * (#20075, décision porteur du 2026-11-20, jumelle de #20074) — dans un
 * tête-à-tête chiffré de bout en bout dont le pair n'a aucun appareil chiffré,
 * l'envoi part dans le tête-à-tête LISIBLE de la paire (retrouvé ou créé,
 * `plaintext: true`), qui s'ouvre, avec un avis qui dit pourquoi. Aucun clair
 * n'entre jamais dans le fil chiffré (#12949) ; un pair dont on ne sait rien,
 * ou qui a un appareil chiffré, garde le refus d'avant.
 */
const FROM = 'c-sealed';
const PEER = { id: 'u-ana', name: 'Ana Diallo' } as const;

type Served = { readonly id: string; readonly encryptionMode?: string | null };

function ports(served: ApiResult<Served> | Error = { ok: true, data: { id: 'c-readable', encryptionMode: 'server' } }, online = true) {
  const asked: string[] = [];
  const sent: Array<{ readonly conversationId: string; readonly draft: Draft }> = [];
  const opened: string[] = [];
  const notices = createReadableRedirectNotices();
  const value: ReadableRedirectPorts = {
    online: () => online,
    open: async (peerId) => {
      asked.push(peerId);
      if (served instanceof Error) throw served;
      return served;
    },
    go: (conversationId) => opened.push(conversationId),
    send: (conversationId, draft) => sent.push({ conversationId, draft }),
    notices,
  };
  return { value, asked, sent, opened, notices };
}

const knownWithoutDevice = () => {
  const store = createPeerDeviceReachStore(null);
  store.getState().confirmWithoutDevice(PEER.id);
  return store.getState();
};

const draft: Draft = {
  content: 'On se voit à 18 h ?',
  originalLanguage: 'fr',
  replyToId: 'm-quoted',
  replyTo: { id: 'm-quoted' } as Message,
  storyReplyToId: 's-1',
  protection: { viewOnce: true },
};

afterEach(() => endToEndRegimeLedger.getState().reset());

describe('sendWithheld', () => {
  test('pair su sans appareil : le message part dans le tête-à-tête lisible, qui s’ouvre, avec l’avis', async () => {
    const p = ports();
    expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: p.value })).toBe('redirected');
    expect(p.asked).toEqual(['u-ana']);
    expect(p.sent.map((entry) => entry.conversationId)).toEqual(['c-readable']);
    expect(p.opened).toEqual(['c-readable']);
    expect(p.notices.getState().notice).toEqual({ conversationId: 'c-readable', peerName: 'Ana Diallo' });
  });

  test('ce qui part : le texte, sa langue, sa protection — jamais la citation du fil chiffré', async () => {
    const p = ports();
    await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: p.value });
    expect(p.sent[0]?.draft).toEqual({ content: 'On se voit à 18 h ?', originalLanguage: 'fr', protection: { viewOnce: true } });
  });

  test('rien n’entre dans le fil chiffré, même quand tout échoue', async () => {
    for (const served of [{ ok: false, status: 500, error: 'boom' } as const, new Error('network'), { ok: true as const, data: { id: FROM, encryptionMode: null } }]) {
      const p = ports(served);
      expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: p.value })).toBe('failed');
      expect(p.sent).toEqual([]);
      expect(p.opened).toEqual([]);
      expect(p.notices.getState().notice).toBeNull();
    }
  });

  test('la passerelle rend un tête-à-tête servi ou vu chiffré : rien ne part (#12949)', async () => {
    const served = ports({ ok: true, data: { id: 'c-other', encryptionMode: 'e2ee' } });
    expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: served.value })).toBe('failed');
    endToEndRegimeLedger.getState().learnEndToEnd('c-seen');
    const seen = ports({ ok: true, data: { id: 'c-seen', encryptionMode: null } });
    expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: seen.value })).toBe('failed');
    expect([...served.sent, ...seen.sent]).toEqual([]);
  });

  test('hors connexion : rien ne part, aucune requête', async () => {
    const p = ports(undefined, false);
    expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: knownWithoutDevice(), ports: p.value })).toBe('offline');
    expect([p.asked, p.sent, p.opened]).toEqual([[], [], []]);
  });

  test('un pair dont on ne sait rien, ou qui a un appareil chiffré, ou aucun pair : le refus d’avant, sans requête', async () => {
    for (const [peer, reach] of [
      [PEER, createPeerDeviceReachStore(null).getState()],
      [undefined, knownWithoutDevice()],
    ] as const) {
      const p = ports();
      expect(await sendWithheld({ fromConversationId: FROM, peer, draft, reach, ports: p.value })).toBe('withheld');
      expect([p.asked, p.sent, p.opened]).toEqual([[], [], []]);
    }
  });
});

describe('un serveur qui cache les appareils du pair (#20181)', () => {
  test('un appareil déjà connu de ce navigateur, puis une liste vide : aucune redirection automatique, aucune requête', async () => {
    const store = createPeerDeviceReachStore(null);
    store.getState().noteDevice(PEER.id);
    store.getState().confirmWithoutDevice(PEER.id);
    const p = ports();
    expect(await sendWithheld({ fromConversationId: FROM, peer: PEER, draft, reach: store.getState(), ports: p.value })).toBe('withheld');
    expect([p.asked, p.sent, p.opened]).toEqual([[], [], []]);
  });
});

describe('redirectedDraft', () => {
  test('un brouillon sans citation passe tel quel', () => {
    const plain: Draft = { content: 'Salut', originalLanguage: 'fr' };
    expect(redirectedDraft(plain)).toEqual(plain);
  });
});

describe('l’avis de la conversation d’arrivée', () => {
  test('un avis se retire par sa conversation, jamais celui d’une autre', () => {
    const notices = createReadableRedirectNotices();
    notices.getState().post({ conversationId: 'c-readable', peerName: 'Ana' });
    notices.getState().clear('c-other');
    expect(notices.getState().notice?.conversationId).toBe('c-readable');
    notices.getState().clear('c-readable');
    expect(notices.getState().notice).toBeNull();
  });
});
