import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CallButton } from '@/components/call-glass-button';
import { CALL_VIEW_GLYPHS } from '@/components/glyphs-call-view';
import { callRecordingStore } from '@/lib/calls/call-recording-store';
import type { ActiveCall } from '@/lib/calls/call-store';
import { loadCallControlsCatalog } from '@/lib/i18n-call-controls-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CallActionRows, type CallRowsKit } from './call-control-actions';
import { PanelRow } from './call-panel-frame';

/**
 * **LA PILULE D'APPEL COMME iOS : L'ENREGISTREMENT EN COURS EST ROUGE, ET LES
 * RANGÉES S'EFFACENT À LEURS BORDS** (#17700, P12.5 et P12.8) — témoins de
 * rendu des rangées du `(…)` et de la rangée d'un panneau.
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadCallControlsCatalog('fr')]);
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  callRecordingStore.setState({ view: { kind: 'idle' }, notice: null });
});

const call: ActiveCall = {
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  direction: 'outgoing',
  isGroup: true,
  title: 'Équipe',
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
};

const kit: CallRowsKit = {
  Button: CallButton,
  glyphs: CALL_VIEW_GLYPHS,
  actionsId: 'actions',
  panelIds: { react: 'p-react', record: 'p-record', people: 'p-people', journal: 'p-journal' },
  useEffectsActive: () => false,
  cameraSourceOf: (track) => track,
};

const panels = { open: null, toggle: () => {}, enter: () => {} };

const renderRows = () => renderToStaticMarkup(<CallActionRows call={call} rows={[{ family: 'call', actions: ['record'] }]} language="fr" panels={panels} kit={kit} />);

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/** Le magasin d'enregistrement se lit au rendu CLIENT (le rendu serveur de zustand rend l'état initial). */
const recordRound = () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<CallActionRows call={call} rows={[{ family: 'call', actions: ['record'] }]} language="fr" panels={panels} kit={kit} />));
  const round = host.querySelector<HTMLElement>('[data-call-record] > span');
  const snapshot = { style: round?.getAttribute('style') ?? '', className: round?.className ?? '', glyph: round?.querySelector('span')?.getAttribute('style') ?? null };
  act(() => root.unmount());
  host.remove();
  return snapshot;
};

describe('l’enregistrement en cours est un bouton destructif rouge, comme sur iOS (P12.5)', () => {
  test('au repos, le bouton est un disque de verre, ni rouge ni blanc', () => {
    const round = recordRound();
    expect(round.style).not.toContain('background');
    expect(round.className).toContain('glass-call-disc');
  });

  test('pendant l’enregistrement, il est plein rouge — le ton de Fin — et son glyphe se lit sur le rouge', () => {
    callRecordingStore.setState({ view: { kind: 'recording', callId: 'call-1', recordingKind: 'audio', recordingId: 'r-1', recorderId: 'u-1', mine: true }, notice: null });
    const round = recordRound();
    expect(round.style).toContain('background: var(--ios-error-strong)');
    expect(round.style).not.toContain('background: var(--color-on-media)');
    expect(round.glyph).toBeNull();
  });

  test('pendant la demande d’accord, il est déjà destructif (iOS : tout état non repos)', () => {
    callRecordingStore.setState({ view: { kind: 'asking', callId: 'call-1', recordingKind: 'audio' }, notice: null });
    expect(recordRound().style).toContain('background: var(--ios-error-strong)');
  });
});

/** Un fondu à chaque bord, de la largeur du retrait de la rangée : au repos, aucun bouton n’est estompé. */
const edgeFade = (markup: string) => {
  const host = document.createElement('div');
  host.innerHTML = markup;
  const row = host.querySelector<HTMLElement>('[data-call-row-scroll]');
  return { mask: row?.getAttribute('style') ?? '', className: row?.className ?? '' };
};

describe('une rangée qui défile s’efface en fondu à ses deux bords (P12.8)', () => {
  test('la rangée du (…) porte un masque à deux bords transparents, symétrique donc juste en arabe', () => {
    const { mask, className } = edgeFade(renderRows());
    expect(mask).toContain('mask-image:linear-gradient(to right, transparent, #000 8px, #000 calc(100% - 8px), transparent)');
    expect(className).toContain('px-2');
  });

  test('la rangée d’un panneau (Réagir, Journal, Ajouter) fait de même', () => {
    const panel = renderToStaticMarkup(
      <PanelRow title="Réactions" role="toolbar" onRowKeyDown={() => {}}>
        <button type="button">a</button>
      </PanelRow>,
    );
    const { mask, className } = edgeFade(panel);
    expect(mask).toContain('mask-image:linear-gradient(to right, transparent, #000 8px, #000 calc(100% - 8px), transparent)');
    expect(className).toContain('px-2');
  });
});
