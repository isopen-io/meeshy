import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ActiveCall, CallMember } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadPillMotion } from '@/lib/calls/use-pill-motion';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ActiveCallView } from './call-overlay';
import { CallScreen, loadColdCallViews } from './call-screen';

/**
 * LE CODE FROID DE L'ÉCRAN D'APPEL VIT HORS DE `call_overlay` (#17650) — la
 * réponse à un appel entrant et la grille d'un groupe se chargent à part, et ne
 * perdent rien : l'état qui les annonce les précharge, et une fois là elles se
 * dessinent dans le MÊME rendu que l'écran, jamais un demi-écran.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadPillMotion();
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({
  userId: 'u-a',
  name: 'Awa',
  avatar: null,
  micMuted: false,
  cameraOn: false,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...overrides,
});

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-cold',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Famille',
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
  display: 'full',
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

const group = { isGroup: true, members: { 'u-a': member(), 'u-b': member({ userId: 'u-b', name: 'Bintou' }) } } as const;

describe('le code froid de l’écran d’appel', () => {
  test('un appel de groupe qui sonne encore précharge sa grille : connecté, elle est là au premier rendu', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallScreen call={call({ ...group, phase: { kind: 'outgoing' } })} />));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(renderToStaticMarkup(<CallScreen call={call(group)} />)).toContain('data-call-tile="u-b"');
    act(() => root.unmount());
    host.remove();
  });

  test('préchargés, la réponse d’un appel entrant et la grille se dessinent dans le même rendu que l’écran', async () => {
    await loadColdCallViews();
    const ringing = renderToStaticMarkup(<CallScreen call={call({ phase: { kind: 'incoming' }, direction: 'incoming', media: 'video', callerName: 'Awa' })} />);
    expect(ringing).toContain('data-call-incoming-accept');
    expect(ringing).toContain('data-call-incoming-audio-only');
    expect(ringing).toContain('data-call-incoming-decline');
    expect(renderToStaticMarkup(<CallScreen call={call(group)} />)).toContain('data-call-tile-self');
  });

  test('un appel entrant se montre entier — portrait ET réponses — jamais l’un sans l’autre', async () => {
    await loadColdCallViews();
    const html = renderToStaticMarkup(<ActiveCallView call={call({ phase: { kind: 'incoming' }, direction: 'incoming', callerName: 'Awa' })} />);
    expect(html).toContain('data-call-incoming-portrait');
    expect(html).toContain('data-call-incoming-accept');
  });
});
