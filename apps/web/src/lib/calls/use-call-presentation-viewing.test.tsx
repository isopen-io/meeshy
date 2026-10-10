import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { acquireConversationViewing, bindConversationViewing, createViewingStore } from '@/lib/api/conversation-viewing';
import type { SocketClient } from '@/lib/net/socket';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { callStore, type ActiveCall } from './call-store';
import { baseCall } from './engine-session';
import { useCallPresentation } from './use-call-presentation';

/**
 * **UN APPEL FAIT QUITTER « ICI »** (#9065) — tant que l'écran d'appel couvre
 * (sonnerie, plein écran, fin), la conversation ouverte sous lui est retirée ;
 * réduire l'appel la rend : l'utilisateur est de nouveau dans le fil qu'il a
 * sous les yeux.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const CONV = 'conv-a';

let cleanups: readonly (() => void)[] = [];
let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  callStore.setState({ call: null });
  for (const cleanup of [...cleanups].reverse()) cleanup();
  cleanups = [];
});

function Harness() {
  const layer = useRef<HTMLDialogElement | null>(null);
  useCallPresentation(layer);
  return <dialog ref={layer} open />;
}

function setup() {
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
  const unbind = bindConversationViewing({
    socket,
    visibility: { visibilityState: () => 'visible', onChange: () => () => undefined },
    store: createViewingStore(),
    viewerId: () => 'viewer-1',
  });
  const release = acquireConversationViewing(CONV);
  cleanups = [unbind, release];
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return () => emitted.filter((e) => e.event === CLIENT_EVENTS.VIEWING_START || e.event === CLIENT_EVENTS.VIEWING_STOP).map((e) => e.event);
}

const call = (phase: ActiveCall['phase'], display: ActiveCall['display']): ActiveCall => ({
  ...baseCall({ conversationId: 'c-call', media: 'audio', title: 'Grace', avatar: null, isGroup: false }, 'incoming', phase),
  display,
});

describe('l’écran d’appel et « ici »', () => {
  test('la sonnerie fait quitter la conversation ouverte', () => {
    const sent = setup();
    act(() => callStore.setState({ call: call({ kind: 'incoming' }, 'full') }));

    expect(sent()).toEqual([CLIENT_EVENTS.VIEWING_START, CLIENT_EVENTS.VIEWING_STOP]);
  });

  test('réduire l’appel rend la conversation ; le rouvrir en grand la retire', () => {
    const sent = setup();
    act(() => callStore.setState({ call: call({ kind: 'connected' }, 'full') }));
    act(() => callStore.setState({ call: call({ kind: 'connected' }, 'bubble') }));
    expect(sent()).toEqual([CLIENT_EVENTS.VIEWING_START, CLIENT_EVENTS.VIEWING_STOP, CLIENT_EVENTS.VIEWING_START]);

    act(() => callStore.setState({ call: call({ kind: 'connected' }, 'full') }));
    expect(sent().at(-1)).toBe(CLIENT_EVENTS.VIEWING_STOP);
  });

  test('sans appel, rien ne bouge', () => {
    const sent = setup();
    expect(sent()).toEqual([CLIENT_EVENTS.VIEWING_START]);
  });
});
