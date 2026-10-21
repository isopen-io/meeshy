import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog } from '@/lib/i18n-message-pieces-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { menuConversation, menuViewer } from '@/test-support/menu-viewer';

import { installHapticsDriver, type HapticCue } from './haptics';
import { LONG_PRESS_MS } from './long-press';
import { useMessageMenu } from './use-message-menu';

/**
 * EN SÉLECTION, L'APPUI LONG N'EXISTE PAS (revue #11207). iOS coupe le menu
 * contextuel en mode sélection ; le web, lui, enfonçait la rangée et vibrait
 * comme si un menu s'ouvrait, puis n'ouvrait rien (loi 4 : un contrôle existe
 * s'il a un effet). Le témoin passe par le GESTE sur une rangée qui porte les
 * gestionnaires que l'écran étale, et lit l'effet : ni pression, ni vibration,
 * ni menu.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
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

const textMessage = (id: string): Message =>
  message({
    id,
    conversationId: 'c-a',
    senderId: 'u-other',
    content: `texte ${id}`,
    originalLanguage: 'fr',
    createdAt: minutesAgo(5),
    translations: [],
    attachments: [],
  });

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  container.remove();
  installHapticsDriver(null);
});

type MenuApi = ReturnType<typeof useMessageMenu>;

function mount(lot: readonly Message[]): { api: () => MenuApi; cues: HapticCue[]; row: (id: string) => HTMLElement } {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesQueryKey('c-a'), { pages: [{ messages: lot, hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  const transport = { request: async <T,>(_request: HttpRequest): Promise<ApiResult<T>> => ({ ok: true, data: null as T }) };
  const cues: HapticCue[] = [];
  installHapticsDriver({ cue: (name) => (cues.push(name), true), pattern: () => true });
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages: lot,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewer: menuViewer({ hasAccount: false }),
      conversation: menuConversation(),
      reply: { setReplyTarget: () => {}, setReplyToMedia: () => {} },
      announce: () => {},
      queryClient,
      transport,
    });
    return (
      <div>
        {lot.map((m) => (
          <div key={m.id} data-row={m.id} tabIndex={0} {...latest?.longPress}>
            <p>{m.content}</p>
          </div>
        ))}
      </div>
    );
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );
  });
  return {
    api: () => {
      if (latest === undefined) throw new Error('hook non monté');
      return latest;
    },
    cues,
    row: (id) => {
      const el = container.querySelector<HTMLElement>(`[data-row="${id}"]`);
      if (el === null) throw new Error(`rangée ${id} absente`);
      return el;
    },
  };
}

const hold = async (el: HTMLElement): Promise<void> => {
  await act(async () => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: 20, clientY: 20, pointerType: 'touch', isPrimary: true }));
  });
};

const wait = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('l’appui long en mode sélection (revue #11207)', () => {
  test('hors sélection : la rangée s’enfonce, le menu s’ouvre, une vibration', async () => {
    const { api, cues, row } = mount([textMessage('m-1'), textMessage('m-2')]);
    await hold(row('m-1'));
    expect(row('m-1').hasAttribute('data-pressing')).toBe(true);
    await wait(LONG_PRESS_MS + 40);
    expect(api().menuTarget?.messageId).toBe('m-1');
    expect(cues).toEqual(['medium']);
  });

  test('en sélection : tenir un autre message ne l’enfonce pas, ne vibre pas, n’ouvre aucun menu', async () => {
    const { api, cues, row } = mount([textMessage('m-1'), textMessage('m-2')]);
    act(() => api().onMenuAction('m-1', 'select'));
    expect(api().selection?.ids).toEqual(['m-1']);
    await hold(row('m-2'));
    expect(row('m-2').hasAttribute('data-pressing')).toBe(false);
    await wait(LONG_PRESS_MS + 40);
    expect(api().menuTarget).toBeNull();
    expect(cues).toEqual([]);
  });
});
