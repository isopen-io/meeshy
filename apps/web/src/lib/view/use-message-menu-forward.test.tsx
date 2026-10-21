import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { sendSheetStore, type SendSheetRequest } from '@/lib/send/send-sheet-store';
import { menuViewer } from '@/test-support/menu-viewer';

import { useMessageMenu } from './use-message-menu';

/**
 * « TRANSFÉRER » OUVRE L'ÉCRAN DE PARTAGE (D1, #10949, porteur 2026-10-18 —
 * supplante #5989) — depuis toutes les portes, avec CE message. La sélection
 * multiple reste « Sélectionner ». Une sélection qui mêle un protégé retire le
 * protégé et envoie le reste (D6) ; seule une sélection où rien ne sort est
 * refusée, avec son motif.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

type MenuApi = ReturnType<typeof useMessageMenu>;

const ordinary = (id: string): Message =>
  message({ id, senderId: 'u-other', content: `texte ${id}`, originalLanguage: 'fr', createdAt: minutesAgo(5), translations: [] });

const viewOnce = (id: string): Message =>
  message({
    id,
    senderId: 'u-other',
    content: 'secret',
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    isViewOnce: true,
    translations: [],
  });

let container: HTMLDivElement;
let root: Root;

const openedRequest = (): SendSheetRequest | null => sendSheetStore.getState().request;

afterEach(() => {
  sendSheetStore.getState().close();
  act(() => root.unmount());
  container.remove();
});

function mount(messages: readonly Message[]): { api: () => MenuApi; announced: string[] } {
  const announced: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      // #7377 — ce témoin garde le TRANSFERT, pas le favori. `hasAccount: false` le dit et
      // évite d'exiger ici un QueryClientProvider : l'état d'étoile d'un
      // message se LIT du serveur, donc `hasAccount: true` monterait une requête
      // qui n'a rien à voir avec ce qui est mesuré.
      viewer: menuViewer({ hasAccount: false }),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: (text) => announced.push(text),
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      // #7378 — `useMessageMenu` lit l'état de favori par `useQuery`. Même
      // `enabled: false` (ce que pose `hasAccount: false` ci-dessus), le hook
      // exige un client dans l'arbre pour exister : `enabled` gouverne la
      // REQUÊTE, jamais la présence du fournisseur.
      <QueryClientProvider client={appQueryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });

  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    announced,
  };
}

const placedOf = (messages: readonly Message[]) => messages.map((m) => ({ message: { id: m.id } }));

describe('« Transférer » depuis le MENU — ouvre l’écran de partage avec CE message (D1)', () => {
  test('l’écran s’ouvre sur ce seul message, sans armer de sélection', () => {
    const { api } = mount([ordinary('m1'), ordinary('m2')]);
    act(() => {
      api().onMenuAction('m1', 'forward');
    });
    const request = openedRequest();
    expect(request?.intent).toBe('forward');
    expect(request?.payload.kind === 'messages' ? request.payload.messages.map((m) => m.id) : null).toEqual(['m1']);
    expect(api().selection).toBe(null);
  });

  test('une vue unique ne s’ouvre pas : le refus DIT pourquoi', () => {
    const { api, announced } = mount([viewOnce('m9')]);
    act(() => {
      api().onMenuAction('m9', 'forward');
    });
    expect(openedRequest()).toBe(null);
    expect(announced).toEqual(['Un message à vue unique ne peut pas être transféré']);
  });
});

describe('« Transférer » depuis la BARRE — ouvre la feuille, ou refuse avec un motif', () => {
  test('une sélection ordinaire ouvre la feuille d’envoi avec les messages, dans l’ordre du fil', () => {
    const messages = [ordinary('m1'), ordinary('m2')];
    const { api } = mount(messages);
    act(() => {
      api().onMenuAction('m2', 'select');
    });
    act(() => {
      api().onRowTap('m1');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    const request = openedRequest();
    expect(request?.intent).toBe('forward');
    expect(request?.payload.kind === 'messages' ? request.payload.messages.map((m) => m.id) : null).toEqual(['m1', 'm2']);
  });

  test('la charge nomme la conversation du fil comme SOURCE du transfert', () => {
    const messages = [ordinary('m1')];
    const { api } = mount(messages);
    act(() => {
      api().onMenuAction('m1', 'select');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    const request = openedRequest();
    expect(request?.payload.kind === 'messages' ? request.payload.conversationId : null).toBe('c-a');
  });

  test('la sélection SE TERMINE à l’ouverture : la barre rend la main au composeur', () => {
    const messages = [ordinary('m1')];
    const { api } = mount(messages);
    act(() => {
      api().onMenuAction('m1', 'select');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    expect(api().selection).toBe(null);
  });

  test('D6 — une sélection qui mêle une vue unique ouvre l’écran : le protégé y sera retiré, le reste part', () => {
    const messages = [ordinary('m1'), viewOnce('m2')];
    const { api } = mount(messages);
    act(() => {
      api().onMenuAction('m1', 'select');
    });
    act(() => {
      api().onRowTap('m2');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    const request = openedRequest();
    expect(request?.payload.kind === 'messages' ? request.payload.exit.map((m) => [m.id, m.isViewOnce]) : null).toEqual([
      ['m1', false],
      ['m2', true],
    ]);
  });

  test('une VUE UNIQUE est REFUSÉE côté client, et le refus DIT pourquoi', () => {
    const messages = [viewOnce('m9')];
    const { api, announced } = mount(messages);
    act(() => {
      api().onMenuAction('m9', 'select');
    });
    act(() => {
      api().onForwardSelection(placedOf(messages));
    });
    expect(openedRequest()).toBe(null);
    expect(api().selection).not.toBe(null);
    expect(announced).toEqual(['Un message à vue unique ne peut pas être transféré']);
  });
});

/**
 * LE GLISSÉ ET L'ICÔNE « RÉPONDRE » (#7559, #8899) PASSENT PAR LE MENU : même
 * offre (`messageMenuItems`), et rien ne s'offre en sélection.
 */
describe('l’offre du glissé est celle du menu', () => {
  test('un message ordinaire se répond et se transfère', () => {
    const { api } = mount([ordinary('m1')]);
    expect(api().swipeActionsOf(ordinary('m1'))).toEqual({ canReply: true, canForward: true });
  });

  test('une vue unique ne se cite ni ne se transfère', () => {
    const { api } = mount([viewOnce('v1')]);
    expect(api().swipeActionsOf(viewOnce('v1'))).toEqual({ canReply: false, canForward: false });
  });

  test('en sélection, rien ne s’offre', () => {
    const { api } = mount([ordinary('m1'), ordinary('m2')]);
    act(() => {
      api().onMenuAction('m1', 'select');
    });
    expect(api().selection).toEqual({ ids: ['m1'] });
    expect(api().swipeActionsOf(ordinary('m2'))).toBeUndefined();
  });
});

/**
 * #9039 — « IMAGER LA DISCUSSION », depuis le sous-menu de Transférer, ouvre
 * l'atelier d'Imager sur la DISCUSSION qui mène à ce message — ni sélection,
 * ni feuille d'envoi.
 */
describe('« Imager la discussion » depuis le menu (#9039)', () => {
  test('l’atelier s’ouvre sur la discussion de ce message, sans armer de sélection', () => {
    const { api } = mount([ordinary('m1'), ordinary('m2')]);
    act(() => {
      api().onMenuAction('m2', 'exportDiscussion');
    });
    expect(api().exportFor).toEqual({ messageId: 'm2', quick: false, scope: 'discussion' });
    expect(api().selection).toBe(null);
    expect(openedRequest()).toBe(null);
  });

  test('« Imager » seul reste la carte d’UN message', () => {
    const { api } = mount([ordinary('m1')]);
    act(() => {
      api().onMenuAction('m1', 'export');
    });
    expect(api().exportFor?.scope ?? 'message').toBe('message');
  });
});
