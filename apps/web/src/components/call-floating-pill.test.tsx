import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { callActions } from '@/lib/calls/call-actions';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallPillBar } from './call-floating-pill';

/**
 * **PENDANT MON PARTAGE, L'APPEL RÉDUIT RESTE LA CAPSULE** (P18.10, #17756) — la bulle n'offre pas « Arrêter » :
 * un glissé horizontal de la capsule ne la replie pas en bulle, et ce glissé n'est pas non plus le toucher qui
 * rouvrirait l'appel. Hors partage, le même glissé la replie, comme sur iOS.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: '',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: false,
  facing: 'user',
  screenSharing: false,
  members: {},
  display: 'pill',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  preview: null,
  previewed: false,
  transcription: 'idle',
  initiatorId: null,
  invitedBy: null,
  quality: null,
  ...overrides,
});

const swipeThenRelease = async (active: ActiveCall) => {
  const seen: string[] = [];
  const original = { collapse: callActions.collapse, expand: callActions.expand };
  callActions.collapse = () => void seen.push('collapse');
  callActions.expand = () => void seen.push('expand');
  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  try {
    await act(async () => root.render(<CallPillBar call={active} away={false} />));
    const bar = host.querySelector('[data-call-pill-bar]');
    const body = host.querySelector('button');
    if (bar === null || body === null) throw new Error('capsule absente');
    const pointer = (type: string, clientX: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, clientX, clientY: 20, button: 0, pointerType: 'mouse' });
    await act(async () => void body.dispatchEvent(pointer('pointerdown', 40)));
    await act(async () => void body.dispatchEvent(pointer('pointerup', 240)));
    await act(async () => void body.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 240, clientY: 20 })));
    return seen;
  } finally {
    await act(async () => root.unmount());
    host.remove();
    callActions.collapse = original.collapse;
    callActions.expand = original.expand;
  }
};

describe('le glissé de la capsule (P18.10)', () => {
  test('hors partage, il replie la capsule en bulle, sans rouvrir l’appel', async () => {
    expect(await swipeThenRelease(call())).toEqual(['collapse']);
  });

  test('pendant mon partage, il ne replie pas la capsule et ne rouvre pas l’appel non plus', async () => {
    expect(await swipeThenRelease(call({ screenSharing: true }))).toEqual([]);
  });
});
