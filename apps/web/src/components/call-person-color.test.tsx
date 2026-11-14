import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { shellPipStore } from '@/lib/calls/call-pip';
import { personTint, speakerColor } from '@/lib/calls/call-speaker-color';
import { callStore, type ActiveCall, type CallMember, type WaitingCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallButton } from './call-glass-button';
import { CallPeopleSheet } from './call-people-sheet';
import { CallPipLayer } from './call-pip-window';
import { Portrait } from './call-portrait';
import { CallWaitingBanner } from './call-waiting-banner';

/**
 * **UNE SEULE COULEUR PAR PERSONNE, PARTOUT DANS L'APPEL** (loi 18.2) — la couleur d'une personne vient de son
 * IDENTIFIANT (`speakerColor`, celle de ses sous-titres et du liseré de sa vignette), jamais de son nom : le médaillon
 * de qui partage, la feuille « Ajouter », la fenêtre flottante, l'appel en attente et le portrait par défaut la
 * portent toutes. Sans identifiant connu, le nom reste le seul repère.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadCallControlsCatalog('fr');
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();

afterEach(() => {
  mounter.unmountAll();
  callStore.setState({ call: null });
  shellPipStore.setState({ active: false });
});

const gradient = (color: string) => `linear-gradient(135deg, ${color}`;

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
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

const waiting = (overrides: Partial<WaitingCall> = {}): WaitingCall => ({ callId: 'call-2', conversationId: 'c-2', media: 'audio', callerName: 'Awa Ndiaye', callerAvatar: null, callerKey: null, isGroup: false, title: 'Awa Ndiaye', ...overrides });

describe('la couleur d’une personne (loi 18.2)', () => {
  test('son identifiant prime ; sans identifiant, son nom', () => {
    expect(personTint('u-awa', 'Awa')).toBe(speakerColor('u-awa', 'Awa'));
    expect(personTint('u-awa', 'Un autre nom')).toBe(speakerColor('u-awa'));
    expect(personTint(null, 'Awa')).toBe(colorForName('Awa'));
    expect(personTint(undefined, 'Awa')).toBe(colorForName('Awa'));
    expect(personTint('', 'Awa')).toBe(colorForName('Awa'));
  });

  test('le portrait sans teinte donnée prend la couleur de la personne qu’il dit (`presenceKey`), pas celle de son nom', () => {
    expect(renderToStaticMarkup(<Portrait name="Amina" avatar={null} size={96} pulse={false} presenceKey="u-amina" />)).toContain(gradient(speakerColor('u-amina', 'Amina')));
    expect(renderToStaticMarkup(<Portrait name="Moi" avatar={null} size={96} pulse={false} presenceKey={undefined} />)).toContain(gradient(colorForName('Moi')));
  });

  test('l’appel en attente peint qui appelle à sa couleur d’identifiant', () => {
    expect(renderToStaticMarkup(<CallWaitingBanner waiting={waiting({ callerKey: 'u-awa' })} />)).toContain(gradient(speakerColor('u-awa', 'Awa Ndiaye')));
    expect(renderToStaticMarkup(<CallWaitingBanner waiting={waiting()} />)).toContain(gradient(colorForName('Awa Ndiaye')));
  });

  test('la fenêtre flottante peint l’autre à sa couleur, comme l’écran d’appel', async () => {
    callStore.setState({ call: call({ peerKey: 'u-amina' }) });
    shellPipStore.setState({ active: true });
    const host = await mounter.mount(<CallPipLayer />);
    expect(host.innerHTML).toContain(gradient(speakerColor('u-amina', 'Amina Diallo')));
  });

  test('la feuille « Ajouter » peint chaque participant à sa couleur d’identifiant', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CallPeopleSheet Button={CallButton} id="people" closeGlyph="x" language="fr" members={[member('u-awa', 'Awa')]} onClose={() => undefined} renderModeration={() => null} />));
    expect(host.querySelector('[data-call-person="u-awa"]')?.innerHTML).toContain(gradient(speakerColor('u-awa', 'Awa')));
    act(() => root.unmount());
    host.remove();
  });
});
