import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';

import { appQueryClient } from '@/lib/api/query-client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { message, minutesAgo } from '@/lib/api/fixtures-base';
import type { Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useMessageMenu } from './use-message-menu';

/**
 * COPIER UN MESSAGE DIT LA VÉRITÉ (#8809) — « Message copié » ne s'annonce
 * qu'une fois le texte dans le presse-papier ; `copyPlainText` tente le repli
 * `execCommand('copy')` quand `navigator.clipboard` refuse, et l'échec se dit.
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

const say = (key: Parameters<typeof translate>[1]) => translate(currentInterfaceLanguage(), key);

let container: HTMLDivElement;
let root: Root;
let restoreClipboard: () => void = () => {};

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  restoreClipboard();
});

function clipboardThat(params: { readonly write: 'resolves' | 'rejects'; readonly legacy: boolean }): string[] {
  const written: string[] = [];
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const execCommand = Object.getOwnPropertyDescriptor(document, 'execCommand');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        if (params.write === 'rejects') return Promise.reject(new Error('NotAllowedError'));
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => params.legacy });
  restoreClipboard = () => {
    if (clipboard === undefined) delete (navigator as { clipboard?: unknown }).clipboard;
    else Object.defineProperty(navigator, 'clipboard', clipboard);
    if (execCommand === undefined) delete (document as { execCommand?: unknown }).execCommand;
    else Object.defineProperty(document, 'execCommand', execCommand);
  };
  return written;
}

function mount(messages: readonly Message[]): { api: () => MenuApi; announced: string[] } {
  const announced: string[] = [];
  let latest: MenuApi | undefined;

  function Harness() {
    latest = useMessageMenu({
      conversationId: 'c-a',
      messages,
      readerLanguages: ['fr'],
      readerLocale: 'fr-FR',
      viewerId: 'u-viewer',
      canStar: false,
      onReply: () => {},
      announce: (text) => announced.push(text),
    });
    return null;
  }

  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(
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

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

describe('« Copier » depuis le menu d’un message', () => {
  test('le texte écrit, « Message copié » s’annonce', async () => {
    const written = clipboardThat({ write: 'resolves', legacy: false });
    const { api, announced } = mount([ordinary('m1')]);
    act(() => api().onMenuAction('m1', 'copy'));
    await settle();
    expect(written).toEqual(['texte m1']);
    expect(announced).toEqual([say('announce.messageCopied')]);
  });

  test('le presse-papier refuse mais le repli copie : « Message copié »', async () => {
    clipboardThat({ write: 'rejects', legacy: true });
    const { api, announced } = mount([ordinary('m1')]);
    act(() => api().onMenuAction('m1', 'copy'));
    await settle();
    expect(announced).toEqual([say('announce.messageCopied')]);
  });

  test('rien n’a pu copier : l’échec s’annonce, jamais « Message copié »', async () => {
    clipboardThat({ write: 'rejects', legacy: false });
    const { api, announced } = mount([ordinary('m1')]);
    act(() => api().onMenuAction('m1', 'copy'));
    await settle();
    expect(announced).toEqual([say('feed.post.copy_failed')]);
  });
});

describe('« Copier » une sélection de messages', () => {
  test('rien n’a pu copier : l’échec s’annonce, jamais « Messages copiés »', async () => {
    clipboardThat({ write: 'rejects', legacy: false });
    const messages = [ordinary('m1'), ordinary('m2')];
    const { api, announced } = mount(messages);
    act(() => api().onMenuAction('m1', 'forward'));
    act(() => api().onRowTap('m2'));
    act(() => api().onCopySelection(messages.map((m) => ({ message: { id: m.id } }))));
    await settle();
    expect(announced.at(-1)).toBe(say('feed.post.copy_failed'));
  });

  test('la sélection écrite, « Messages copiés » s’annonce', async () => {
    const written = clipboardThat({ write: 'resolves', legacy: false });
    const messages = [ordinary('m1'), ordinary('m2')];
    const { api, announced } = mount(messages);
    act(() => api().onMenuAction('m1', 'forward'));
    act(() => api().onRowTap('m2'));
    act(() => api().onCopySelection(messages.map((m) => ({ message: { id: m.id } }))));
    await settle();
    expect(written).toHaveLength(1);
    expect(announced.at(-1)).toBe(say('announce.messagesCopied'));
  });
});
