import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { messagesOf } from '@/lib/api/fixtures';
import { MEDIA_CONVERSATION_ID } from '@/lib/api/fixtures-media';
import { MEDIA_GRID_QUAD_WITNESS_ID } from '@/lib/api/fixtures-media-grid';
import { acquireConversationViewing, bindConversationViewing, createViewingStore } from '@/lib/api/conversation-viewing';
import type { SocketClient } from '@/lib/net/socket';

import MediaViewer from './media-viewer';

/**
 * #9052 — ouvrir une image depuis le fil, c'est QUITTER la conversation : le
 * pair voit le point « ici » s'éteindre, et se rallumer à la fermeture.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function recordingSocket() {
  const emitted: { readonly event: string; readonly payload: unknown }[] = [];
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: () => undefined,
    off: () => undefined,
    emit: (event, payload) => {
      emitted.push({ event, payload });
    },
  };
  return { socket, emitted };
}

describe('MediaViewer — la visionneuse couvre le fil (#9052)', () => {
  test('monter la visionneuse retire la présence, la démonter la rend', () => {
    const { socket, emitted } = recordingSocket();
    const unbind = bindConversationViewing({
      socket,
      visibility: { visibilityState: () => 'visible', onChange: () => () => undefined },
      store: createViewingStore(),
      viewerId: () => 'viewer',
    });
    const release = acquireConversationViewing('conv-a');
    const items = messagesOf(MEDIA_CONVERSATION_ID).find((m) => m.id === MEDIA_GRID_QUAD_WITNESS_ID)?.attachments ?? [];

    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    act(() => {
      root.render(<MediaViewer items={items} startIndex={0} onClose={() => {}} languages={['fr']} fallbackLanguage="fr" />);
    });
    const whileOpen = emitted.map((e) => e.event);
    act(() => root.unmount());
    container.remove();
    document.body.removeAttribute('id');
    const afterClose = emitted.map((e) => e.event);
    release();
    unbind();

    expect(whileOpen).toEqual([CLIENT_EVENTS.VIEWING_START, CLIENT_EVENTS.VIEWING_STOP]);
    expect(afterClose).toEqual([CLIENT_EVENTS.VIEWING_START, CLIENT_EVENTS.VIEWING_STOP, CLIENT_EVENTS.VIEWING_START]);
  });
});
