import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import { CONTENT_CAPTURE_MAX_MESSAGES, contentCaptureBodySchema } from '@meeshy/shared/types/content-capture';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CAPTURE_SHIELD_PLUGIN } from './capture-shield';
import {
  RECORDING_SWEEP_MS,
  newCaptureId,
  rowIsSeen,
  sendCaptureDeclaration,
  startCaptureReports,
  visibleCaptureSubjects,
  type CaptureDeclaration,
  type CaptureSubjects,
} from './screen-capture-reports';

/* LA CAPTURE DÉTECTÉE PAR LA COQUE S'ANNONCE (#9617) — une capture d'écran
   déclare ce qui est visible sous un identifiant neuf ; un enregistrement
   garde UN identifiant du début à la fin et ne redéclare jamais un message. */

beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

type Listener = (data: unknown) => void;

function fakeShell(state: { readonly recording: boolean } = { recording: false }) {
  const listeners = new Map<string, Listener>();
  const removed: string[] = [];
  const coque: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
    nativePromise: async () => state,
    addListener: (plugin, event, callback) => {
      expect(plugin).toBe(CAPTURE_SHIELD_PLUGIN);
      listeners.set(event, callback);
      return { remove: async () => void removed.push(event) };
    },
  };
  return { coque, emit: (event: string, data: unknown = {}) => listeners.get(event)?.(data), removed };
}

const rowsOnly = (rows: readonly string[]) => ({ viewOnce: [], rows });

function reporter(params: { readonly visible: () => CaptureSubjects; readonly recording?: boolean }) {
  const shell = fakeShell({ recording: params.recording === true });
  const sent: CaptureDeclaration[] = [];
  const ticks: (() => void)[] = [];
  let ids = 0;
  const stop = startCaptureReports({
    coque: shell.coque,
    conversationId: 'c-1',
    collect: params.visible,
    send: async (declaration) => void sent.push(declaration),
    newCaptureId: () => `capture-${++ids}`,
    every: (run, ms) => {
      expect(ms).toBe(RECORDING_SWEEP_MS);
      ticks.push(run);
      return () => void ticks.splice(ticks.indexOf(run), 1);
    },
  });
  return { ...shell, sent, ticks, stop };
}

describe('la capture d’écran', () => {
  test('chaque capture déclare les messages visibles sous un identifiant neuf', () => {
    const { emit, sent } = reporter({ visible: () => rowsOnly(['m1', 'm2']) });
    emit('screenCaptured');
    emit('screenCaptured');
    expect(sent).toEqual([
      { conversationId: 'c-1', messageIds: ['m1', 'm2'], kind: 'screenshot', captureId: 'capture-1', readUpTo: 'm2' },
      { conversationId: 'c-1', messageIds: ['m1', 'm2'], kind: 'screenshot', captureId: 'capture-2', readUpTo: 'm2' },
    ]);
  });

  test('une vue unique affichée se déclare sans accusé de lecture (son ouverture fait foi)', () => {
    const { emit, sent } = reporter({ visible: () => ({ viewOnce: ['m-vu'], rows: [] }) });
    emit('screenCaptured');
    expect(sent).toEqual([{ conversationId: 'c-1', messageIds: ['m-vu'], kind: 'screenshot', captureId: 'capture-1' }]);
  });

  test('rien de visible : rien ne part', () => {
    const { emit, sent } = reporter({ visible: () => rowsOnly([]) });
    emit('screenCaptured');
    expect(sent).toEqual([]);
  });

  test('jamais plus que ce que la passerelle accepte', () => {
    const many = Array.from({ length: 80 }, (_, i) => `m${i}`);
    const { emit, sent } = reporter({ visible: () => rowsOnly(many) });
    emit('screenCaptured');
    expect(sent[0]?.messageIds).toHaveLength(CONTENT_CAPTURE_MAX_MESSAGES);
  });
});

describe('l’enregistrement et la recopie d’écran', () => {
  test('un enregistrement garde UN identifiant et ne redéclare jamais un message', () => {
    let visible: readonly string[] = ['m1'];
    const { emit, sent, ticks } = reporter({ visible: () => rowsOnly(visible) });
    emit('recordingChanged', { recording: true });
    visible = ['m1', 'm2'];
    ticks.forEach((tick) => tick());
    ticks.forEach((tick) => tick());
    expect(sent).toEqual([
      { conversationId: 'c-1', messageIds: ['m1'], kind: 'recording', captureId: 'capture-1', readUpTo: 'm1' },
      { conversationId: 'c-1', messageIds: ['m2'], kind: 'recording', captureId: 'capture-1', readUpTo: 'm2' },
    ]);
  });

  test('la fin de l’enregistrement arrête le balayage ; le suivant a un identifiant neuf', () => {
    const { emit, sent, ticks } = reporter({ visible: () => rowsOnly(['m1']) });
    emit('recordingChanged', { recording: true });
    emit('recordingChanged', { recording: false });
    expect(ticks).toHaveLength(0);
    emit('recordingChanged', { recording: true });
    expect(sent.map((declaration) => declaration.captureId)).toEqual(['capture-1', 'capture-2']);
  });

  test('un enregistrement déjà en cours à l’ouverture du fil est repris', async () => {
    const { sent } = reporter({ visible: () => rowsOnly(['m1']), recording: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([{ conversationId: 'c-1', messageIds: ['m1'], kind: 'recording', captureId: 'capture-1', readUpTo: 'm1' }]);
  });

  test('quitter le fil retire les écoutes et le balayage', () => {
    const { emit, ticks, stop, removed } = reporter({ visible: () => rowsOnly(['m1']) });
    emit('recordingChanged', { recording: true });
    stop();
    expect(ticks).toHaveLength(0);
    expect(removed.sort()).toEqual(['recordingChanged', 'screenCaptured']);
  });
});

describe('ce qui part au réseau', () => {
  test('l’accusé de lecture part d’abord, puis le corps REST qui passe le schéma de la passerelle', async () => {
    const requests: { method: string; path: string; body?: unknown }[] = [];
    await sendCaptureDeclaration(
      async (request) => {
        requests.push(request);
        return { ok: true };
      },
      { conversationId: 'c-1', messageIds: ['0123456789abcdef01234567'], kind: 'screenshot', captureId: newCaptureId(), readUpTo: '0123456789abcdef01234567' },
    );
    expect(requests.map((request) => request.path)).toEqual([
      conversationsEndpoints.byConversationIdReceipts('c-1'),
      conversationsEndpoints.byIdMessagesCapture('c-1'),
    ]);
    expect(requests[0]?.body).toEqual({ type: 'read', caughtUpToMessageId: '0123456789abcdef01234567' });
    expect(requests[1]?.method).toBe('POST');
    expect(contentCaptureBodySchema.safeParse(requests[1]?.body).success).toBe(true);
  });

  test('un accusé refusé n’empêche pas la déclaration, et rien ne se réessaie', async () => {
    const paths: string[] = [];
    await sendCaptureDeclaration(
      async (request) => {
        paths.push(request.path);
        if (request.path.endsWith('/receipts')) throw new Error('refus');
        return { ok: true };
      },
      { conversationId: 'c-1', messageIds: ['0123456789abcdef01234567'], kind: 'screenshot', captureId: newCaptureId(), readUpTo: '0123456789abcdef01234567' },
    );
    expect(paths).toHaveLength(2);
  });

  test('l’identifiant de capture a la forme que la passerelle exige', () => {
    expect(newCaptureId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newCaptureId()).not.toBe(newCaptureId());
  });
});

describe('ce qui est VU, pas seulement monté', () => {
  const viewport = { width: 400, height: 800 };
  const rowAt = (top: number, bottom: number): Element => {
    const row = document.createElement('div');
    row.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 400, width: 400, height: bottom - top, x: 0, y: top, toJSON: () => ({}) });
    return row;
  };

  test('une rangée hors cadre (marge du virtualiseur) n’est pas vue', () => {
    const row = rowAt(900, 1000);
    expect(rowIsSeen(row, viewport, () => row)).toBe(false);
  });

  test('une rangée recouverte par une couche n’est pas vue', () => {
    const row = rowAt(100, 200);
    const layer = document.createElement('div');
    expect(rowIsSeen(row, viewport, () => layer)).toBe(false);
  });

  test('une rangée à moitié à l’écran et découverte est vue', () => {
    const row = rowAt(-50, 60);
    expect(rowIsSeen(row, viewport, () => row)).toBe(true);
  });

  test('le relevé prend les rangées marquées et vues, plus les vues uniques affichées', () => {
    document.body.innerHTML = `
      <div data-row="m-flame" data-capture="announced"></div>
      <div data-row="m-unknown" data-capture="blocked"></div>
      <div data-row="m-plain"></div>`;
    const flame = document.querySelector('[data-row="m-flame"]');
    if (flame === null) throw new Error('rangée attendue');
    flame.getBoundingClientRect = () => ({ top: 10, bottom: 60, left: 0, right: 300, width: 300, height: 50, x: 0, y: 10, toJSON: () => ({}) });
    const original = document.elementFromPoint.bind(document);
    document.elementFromPoint = () => flame;
    try {
      expect(visibleCaptureSubjects(document, { shown: () => ['m-view-once'], secured: () => false })).toEqual({
        viewOnce: ['m-view-once'],
        rows: ['m-flame'],
      });
      expect(visibleCaptureSubjects(document, { shown: () => ['m-view-once'], secured: () => true })).toEqual({
        viewOnce: ['m-view-once'],
        rows: [],
      });
    } finally {
      document.elementFromPoint = original;
      document.body.innerHTML = '';
    }
  });
});
