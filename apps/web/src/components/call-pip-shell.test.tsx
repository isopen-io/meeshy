import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { shellPipStore } from '@/lib/calls/call-pip';
import { callStore, type ActiveCall } from '@/lib/calls/call-store';

import { CallPipLayer } from './call-pip-window';

/**
 * **L'APPEL FLOTTE AUSSI DANS LA COQUE ANDROID** (#8144) — quand la coque
 * passe l'activité en image dans l'image, la WebView entière devient la
 * fenêtre flottante : la page n'y dessine plus que la vidéo et le nom, pas
 * l'écran d'appel et ses boutons (une fenêtre PiP d'Android ne transmet aucun
 * toucher à la page).
 */

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: false,
  title: 'Amina Diallo',
  avatar: null,
  callerName: null,
  phase: { kind: 'connected' },
  connectedAt: 0,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: true,
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

const layer = (active: ActiveCall, floating: boolean): string => {
  callStore.setState({ call: active });
  shellPipStore.setState({ active: floating });
  return renderToStaticMarkup(<CallPipLayer />);
};

afterEach(() => {
  callStore.setState({ call: null });
  shellPipStore.setState({ active: false });
});

describe('l’appel dans la fenêtre flottante de la coque (#8144)', () => {
  test('la page se réduit à l’image et au nom, sans aucun bouton', () => {
    const html = layer(call(), true);
    expect(html).toContain('data-call-pip-shell');
    expect(html).toContain('Amina Diallo');
    expect(html).not.toContain('<button');
  });

  test('hors de l’image dans l’image, l’écran d’appel reste seul', () => {
    expect(layer(call(), false)).not.toContain('data-call-pip-shell');
  });

  test('un appel fini ne flotte plus', () => {
    expect(layer(call({ phase: { kind: 'ended', reason: 'remote', detail: null } }), true)).not.toContain('data-call-pip-shell');
  });
});
