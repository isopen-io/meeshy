import { useRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { acquireConversationViewing, bindConversationViewing, createViewingStore } from '@/lib/api/conversation-viewing';
import type { SocketClient } from '@/lib/net/socket';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useConversationActivity } from './use-conversation-viewing';

/**
 * **CE QUE L'UTILISATEUR FAIT DANS LE FIL LE REND ACTIF** (#9061) — toucher,
 * écrire, faire défiler du doigt ou de la molette, lire un média. Un
 * défilement PROGRAMMATIQUE (le fil qui se recale sur un message reçu) n'est
 * le geste de personne.
 */

const CONV = 'conv-activity';
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/c' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
let cleanups: readonly (() => void)[] = [];
afterEach(() => {
  mounter.unmountAll();
  for (const cleanup of [...cleanups].reverse()) cleanup();
  cleanups = [];
});

function Thread({ conversationId }: { readonly conversationId: string }) {
  const root = useRef<HTMLDivElement | null>(null);
  useConversationActivity(conversationId, root);
  return (
    <div ref={root} data-thread>
      <div data-scroller>
        <audio data-audio />
      </div>
    </div>
  );
}

function wire() {
  const emitted: string[] = [];
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: () => undefined,
    off: () => undefined,
    emit: (event) => {
      emitted.push(event);
    },
  };
  let clock = 0;
  const unbind = bindConversationViewing({
    socket,
    visibility: { visibilityState: () => 'visible', onChange: () => () => undefined },
    store: createViewingStore(),
    viewerId: () => 'me',
    now: () => (clock += 5_000),
  });
  const release = acquireConversationViewing(CONV);
  cleanups = [...cleanups, unbind, release];
  return { activities: () => emitted.filter((event) => event === CLIENT_EVENTS.VIEWING_ACTIVITY).length };
}

const fire = (target: Element | null, type: string, bubbles: boolean): void => {
  target?.dispatchEvent(new Event(type, { bubbles }));
};

describe('les gestes dans le fil', () => {
  test('toucher, écrire, défiler du doigt ou de la molette rend actif', async () => {
    const { activities } = wire();
    const host = await mounter.mount(<Thread conversationId={CONV} />);
    const scroller = host.querySelector('[data-scroller]');

    fire(scroller, 'pointerdown', true);
    fire(scroller, 'keydown', true);
    fire(scroller, 'wheel', true);
    fire(scroller, 'touchmove', true);

    expect(activities()).toBe(4);
  });

  test('écouter un média rend actif, même si son événement ne remonte pas', async () => {
    const { activities } = wire();
    const host = await mounter.mount(<Thread conversationId={CONV} />);

    fire(host.querySelector('[data-audio]'), 'timeupdate', false);

    expect(activities()).toBe(1);
  });

  test('un défilement programmatique n’est le geste de personne', async () => {
    const { activities } = wire();
    const host = await mounter.mount(<Thread conversationId={CONV} />);

    fire(host.querySelector('[data-scroller]'), 'scroll', false);

    expect(activities()).toBe(0);
  });

  test('l’écran démonté n’écoute plus rien', async () => {
    const { activities } = wire();
    const host = await mounter.mount(<Thread conversationId={CONV} />);
    const thread = host.querySelector('[data-thread]');
    mounter.unmountAll();

    fire(thread, 'pointerdown', true);

    expect(activities()).toBe(0);
  });
});
