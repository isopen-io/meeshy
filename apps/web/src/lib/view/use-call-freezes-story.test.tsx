import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { callStore } from '@/lib/calls/call-store';
import { baseCall } from '@/lib/calls/engine-session';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { useCallFreezesStory } from './use-call-freezes-story';

/**
 * UN APPEL GÈLE LA STORY (#8727, jumelle de #8725) — la minuterie s'arrête à
 * l'arrivée de l'appel, reprend EN PLACE à sa fin ; une pause voulue survit.
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

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  callStore.setState({ call: null });
});

type Props = { readonly paused: boolean; readonly pause: () => void; readonly resume: () => void };

function Harness(props: Props) {
  useCallFreezesStory(props);
  return null;
}

function mount(props: Props): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness {...props} />));
}

const ringing = () => baseCall({ conversationId: 'c1', media: 'audio', title: 'Grace', avatar: null, isGroup: false }, 'incoming', { kind: 'incoming' });

describe('useCallFreezesStory', () => {
  test('un appel qui arrive met la story en pause ; sa fin la reprend', () => {
    let paused = 0;
    let resumed = 0;
    mount({ paused: false, pause: () => paused++, resume: () => resumed++ });
    act(() => callStore.setState({ call: ringing() }));
    expect(paused).toBe(1);
    act(() => callStore.setState({ call: null }));
    expect(resumed).toBe(1);
  });

  test('une pause VOULUE survit à l’appel — sa fin ne la reprend pas', () => {
    let paused = 0;
    let resumed = 0;
    mount({ paused: true, pause: () => paused++, resume: () => resumed++ });
    act(() => callStore.setState({ call: ringing() }));
    act(() => callStore.setState({ call: null }));
    expect(paused).toBe(0);
    expect(resumed).toBe(0);
  });
});
