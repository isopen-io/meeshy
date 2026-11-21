import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { Conversation } from '@/lib/api/types';
import { createPeerDeviceReachStore } from '@/lib/e2ee/peer-device-reach';
import { endToEndRegimeLedger } from '@/lib/end-to-end-regime-ledger';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadConversationEncryptionCatalog } from '@/lib/i18n-conversation-encryption-catalog';
import { composerRefills } from '@/lib/send/composer-refill';
import { entriesOf, outboxStore } from '@/lib/send/outbox-store';
import type { Draft } from '@/lib/send/perform-send';
import type { MessageSticker } from '@meeshy/shared/types/message-sticker';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { createReadableRedirectNotices, type ReadableRedirectPorts } from './readable-redirect';
import { useSend } from './use-send';

/**
 * **L'ENVOI D'UN TÊTE-À-TÊTE CHIFFRÉ DONT LE PAIR N'A AUCUN APPAREIL CHIFFRÉ**
 * (#20075) — le composeur revenu sous le bandeau envoie dans le tête-à-tête
 * LISIBLE de la paire, jamais dans le fil chiffré : aucune entrée d'outbox n'y
 * naît (#12949). Un pair dont on ne sait rien garde le refus d'avant.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadConversationEncryptionCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  endToEndRegimeLedger.getState().reset();
  composerRefills.setState({ refill: null });
});

const FROM = 'c-sealed-send';

const sealedDirect = (): Conversation =>
  ({
    id: FROM,
    type: 'direct',
    encryptionMode: 'e2ee',
    participants: [
      { id: 'p-moi', userId: 'u-viewer', displayName: 'Moi' },
      { id: 'p-ana', userId: 'u-ana', displayName: 'Ana Diallo' },
    ],
  }) as unknown as Conversation;

function harness(
  served: ApiResult<{ readonly id: string; readonly encryptionMode?: string | null }>,
  lacking: boolean,
  seenBefore = false,
  failSend?: () => never,
) {
  const reach = createPeerDeviceReachStore(null);
  if (seenBefore) reach.getState().noteDevice('u-ana');
  if (lacking) reach.getState().confirmWithoutDevice('u-ana');
  const sent: Array<{ readonly conversationId: string; readonly draft: Draft }> = [];
  const opened: string[] = [];
  const ports: ReadableRedirectPorts = {
    online: () => true,
    open: async () => served,
    go: (id) => opened.push(id),
    send: (conversationId, draft) => {
      failSend?.();
      sent.push({ conversationId, draft });
    },
    count: async () => 0,
    notices: createReadableRedirectNotices(),
  };
  const announced: string[] = [];
  let latest!: ReturnType<typeof useSend>;
  function Harness() {
    latest = useSend({ conversationId: FROM, viewerId: 'u-viewer', conversation: sealedDirect(), announce: (text) => announced.push(text), readableRedirect: { reach, ports } });
    return null;
  }
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
  return { send: () => latest.send, sent, opened, announced, notices: ports.notices };
}

describe('useSend — tête-à-tête chiffré, pair sans appareil chiffré', () => {
  test('le message part dans le tête-à-tête lisible, qui s’ouvre ; rien n’entre dans le fil chiffré', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: true, data: { id: 'c-readable', encryptionMode: 'server' } }, true);
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(h.sent).toEqual([{ conversationId: 'c-readable', draft: { content: 'On se voit ?', originalLanguage: 'fr' } }]);
    expect(h.opened).toEqual(['c-readable']);
    expect(h.notices.getState().notice).toEqual({ conversationId: 'c-readable', peerName: 'Ana Diallo', quoteDropped: false });
    expect(entriesOf(outboxStore.getState(), FROM)).toEqual([]);
    expect(h.announced).toEqual([]);
    expect(composerRefills.getState().refill).toBeNull();
  });

  test('la redirection échoue : rien ne part, le refus se dit', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: false, status: 500, error: 'boom' }, true);
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect([h.sent, h.opened]).toEqual([[], []]);
    expect(entriesOf(outboxStore.getState(), FROM)).toEqual([]);
    expect(h.announced).toEqual([
      translate('fr', 'announce.messageNotSent.reason', { reason: 'La conversation sans chiffrement de bout en bout n’a pas pu être ouverte. Réessayez.' }),
    ]);
    expect(composerRefills.getState().refill).toEqual({ conversationId: FROM, text: 'On se voit ?', attachments: [], place: null });
  });

  test('un pair dont on ne sait rien : le refus d’avant, sans requête', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: true, data: { id: 'c-readable' } }, false);
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect([h.sent, h.opened]).toEqual([[], []]);
    expect(h.announced).toHaveLength(1);
    expect(h.announced[0]).toContain('chiffrée de bout en bout');
  });

  test('un appareil déjà connu pour ce pair (#20181) : la liste vide ne redirige pas, le refus se dit', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: true, data: { id: 'c-readable' } }, true, true);
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect([h.sent, h.opened]).toEqual([[], []]);
    expect(entriesOf(outboxStore.getState(), FROM)).toEqual([]);
    expect(h.announced).toHaveLength(1);
    expect(composerRefills.getState().refill).toEqual({ conversationId: FROM, text: 'On se voit ?', attachments: [], place: null });
  });

  test('la conversation lisible servie chiffrée : rien ne part, le texte revient au composeur', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: true, data: { id: 'c-readable', encryptionMode: 'e2ee' } }, true);
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect([h.sent, h.opened]).toEqual([[], []]);
    expect(h.announced).toHaveLength(1);
    expect(composerRefills.getState().refill).toEqual({ conversationId: FROM, text: 'On se voit ?', attachments: [], place: null });
  });

  test('l’envoi lui-même lève : rien n’est ouvert, le texte revient au composeur', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: true, data: { id: 'c-readable', encryptionMode: 'server' } }, true, false, () => {
      throw new Error('outbox');
    });
    await act(async () => {
      h.send()('On se voit ?', [], null, 'fr');
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(h.opened).toEqual([]);
    expect(h.announced).toHaveLength(1);
    expect(composerRefills.getState().refill).toEqual({ conversationId: FROM, text: 'On se voit ?', attachments: [], place: null });
  });

  test('un échec rend tout le brouillon : pièces et lieu reviennent, le sticker perdu est dit', async () => {
    endToEndRegimeLedger.getState().learnEndToEnd(FROM);
    const h = harness({ ok: false, status: 500, error: 'boom' }, true);
    const photo = { localId: 'l-photo', file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }), kind: 'image', name: 'photo.jpg', size: 1 } as const;
    const place = { latitude: 48.85, longitude: 2.35 };
    const sticker = { id: 'st-1' } as unknown as MessageSticker;
    await act(async () => {
      h.send()('Regarde', [photo], null, 'fr', {}, place, sticker);
      await import('@/components/sealed-direct-chunk');
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(composerRefills.getState().refill).toEqual({ conversationId: FROM, text: 'Regarde', attachments: [photo], place });
    expect(h.announced).toHaveLength(1);
    expect(h.announced[0]).toContain('Le sticker n’est pas parti : choisissez-le de nouveau.');
  });
});

