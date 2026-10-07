import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import { contentCaptureBodySchema } from '@meeshy/shared/types/content-capture';
import { CONTENT_CAPTURE_NOTICES_PER_REPORT } from '@meeshy/shared/types/content-capture-kinds';

import type { CoqueNative } from '@/lib/native-shell';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import type { CaptureJob, CaptureJobInput } from './capture-outbox';
import { CAPTURE_SHIELD_PLUGIN } from './capture-shield';
import {
  captureJobs,
  newCaptureId,
  rowIsSeen,
  sendCaptureJob,
  startCaptureReports,
  visibleCaptureSubjects,
  type CaptureSubjects,
} from './screen-capture-reports';

/* LA CAPTURE DÉTECTÉE PAR LA COQUE S'ANNONCE (#9617) — une capture déclare ce
   qui est visible sous un identifiant neuf, en lots de dix ; un enregistrement
   déclare l'écran de son démarrage puis noircit les éphémères jusqu'à sa fin ;
   chaque déclaration passe par la file durable. */

beforeAll(() => ensureHappyDomRegistered());
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

type Listener = (data: unknown) => void;

function reporter(params: { readonly visible: () => CaptureSubjects; readonly recording?: boolean }) {
  const listeners = new Map<string, Listener>();
  const removed: string[] = [];
  const coque: CoqueNative = {
    getPlatform: () => 'android',
    PluginHeaders: [{ name: CAPTURE_SHIELD_PLUGIN, methods: [{ name: 'setSecure' }, { name: 'getState' }] }],
    nativePromise: async () => ({ recording: params.recording === true }),
    addListener: (_plugin, event, callback) => {
      listeners.set(event, callback);
      return { remove: async () => void removed.push(event) };
    },
  };
  const queued: CaptureJobInput[] = [];
  const recordingNotes: boolean[] = [];
  const shownWatchers: (() => void)[] = [];
  const shown: { ids: readonly string[] } = { ids: [] };
  let ids = 0;
  const stop = startCaptureReports({
    coque,
    conversationId: 'c-1',
    collect: params.visible,
    outbox: { enqueue: (jobs) => void queued.push(...jobs), flush: async () => {} },
    shield: {
      noteRecording: (now) => void recordingNotes.push(now),
      shown: () => shown.ids,
      watchShown: (listener) => {
        shownWatchers.push(listener);
        return () => void shownWatchers.splice(shownWatchers.indexOf(listener), 1);
      },
    },
    newCaptureId: () => `capture-${++ids}`,
  });
  const openViewOnce = (next: readonly string[]) => {
    shown.ids = next;
    [...shownWatchers].forEach((watcher) => watcher());
  };
  return { emit: (event: string, data: unknown = {}) => listeners.get(event)?.(data), queued, recordingNotes, shownWatchers, openViewOnce, stop, removed };
}

const rowsOnly = (rows: readonly string[]): CaptureSubjects => ({ viewOnce: [], rows });
const many = (count: number) => Array.from({ length: count }, (_, i) => `m${i}`);

describe('la capture d’écran', () => {
  test('chaque capture déclare les messages visibles sous un identifiant neuf', () => {
    const { emit, queued } = reporter({ visible: () => rowsOnly(['m1', 'm2']) });
    emit('screenCaptured');
    emit('screenCaptured');
    expect(queued.map((job) => [job.captureId, job.kind, job.messageIds, job.readUpTo])).toEqual([
      ['capture-1', 'screenshot', ['m1', 'm2'], 'm2'],
      ['capture-2', 'screenshot', ['m1', 'm2'], 'm2'],
    ]);
  });

  test('plus de dix messages : des déclarations de dix, sous le même identifiant', () => {
    const { emit, queued } = reporter({ visible: () => rowsOnly(many(25)) });
    emit('screenCaptured');
    expect(queued.map((job) => job.messageIds.length)).toEqual([10, 10, 5]);
    expect(new Set(queued.map((job) => job.captureId))).toEqual(new Set(['capture-1']));
    expect(new Set(queued.map((job) => job.id)).size).toBe(3);
    expect(Math.max(...queued.map((job) => job.messageIds.length))).toBe(CONTENT_CAPTURE_NOTICES_PER_REPORT);
  });

  test('une vue unique affichée se déclare sans accusé de lecture (son ouverture fait foi)', () => {
    const { emit, queued } = reporter({ visible: () => ({ viewOnce: ['m-vu'], rows: [] }) });
    emit('screenCaptured');
    expect(queued.map((job) => [job.messageIds, job.readUpTo])).toEqual([[['m-vu'], undefined]]);
  });

  test('rien de visible : rien ne part', () => {
    const { emit, queued } = reporter({ visible: () => rowsOnly([]) });
    emit('screenCaptured');
    expect(queued).toEqual([]);
  });
});

describe('l’enregistrement et la recopie d’écran', () => {
  test('l’écran du démarrage est annoncé, puis les éphémères sont noirs jusqu’à la fin', () => {
    let visible: readonly string[] = ['m1'];
    const { emit, queued, recordingNotes } = reporter({ visible: () => rowsOnly(visible) });
    emit('recordingChanged', { recording: true });
    expect(queued.map((job) => [job.kind, job.messageIds])).toEqual([['recording', ['m1']]]);
    expect(recordingNotes).toEqual([true]);
    visible = ['m1', 'm2'];
    emit('recordingChanged', { recording: false });
    expect(recordingNotes).toEqual([true, false]);
    expect(queued).toHaveLength(1);
  });

  test('une flamme qui passe deux secondes à l’écran pendant l’enregistrement est noire : rien n’attend un balayage', () => {
    const { emit, recordingNotes, queued } = reporter({ visible: () => rowsOnly([]) });
    emit('recordingChanged', { recording: true });
    expect(recordingNotes).toEqual([true]);
    expect(queued).toEqual([]);
  });

  test('une vue unique ouverte pendant l’enregistrement déclare sa tentative à l’ouverture, sous le même identifiant', () => {
    const { emit, queued, openViewOnce } = reporter({ visible: () => rowsOnly(['m1']) });
    emit('recordingChanged', { recording: true });
    openViewOnce(['m-vu']);
    openViewOnce(['m-vu']);
    expect(queued.map((job) => [job.captureId, job.messageIds])).toEqual([
      ['capture-1', ['m1']],
      ['capture-1', ['m-vu']],
    ]);
    expect(new Set(queued.map((job) => job.id)).size).toBe(2);
  });

  test('un enregistrement déjà en cours à l’ouverture du fil est repris', async () => {
    const { recordingNotes } = reporter({ visible: () => rowsOnly(['m1']), recording: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(recordingNotes).toEqual([true]);
  });

  test('quitter le fil retire les écoutes', () => {
    const { emit, stop, removed, shownWatchers } = reporter({ visible: () => rowsOnly(['m1']) });
    emit('recordingChanged', { recording: true });
    stop();
    expect(shownWatchers).toHaveLength(0);
    expect(removed.sort()).toEqual(['recordingChanged', 'screenCaptured']);
  });
});

describe('ce qui part au réseau', () => {
  const job = (overrides: Partial<CaptureJob> = {}): CaptureJob => ({
    id: 'j1',
    conversationId: 'c-1',
    messageIds: ['0123456789abcdef01234567'],
    kind: 'screenshot',
    captureId: newCaptureId(),
    readUpTo: '0123456789abcdef01234567',
    createdAt: 0,
    attempts: 0,
    nextAt: 0,
    ...overrides,
  });
  const ledger = () => {
    const notes: string[] = [];
    return {
      notes,
      shield: {
        noteDeclaration: (conversationId: string) => void notes.push(`declared:${conversationId}`),
        noteNotices: (conversationId: string, kind: string, ids: readonly string[]) => void notes.push(`noticed:${conversationId}:${kind}:${ids.join(',')}`),
      },
    };
  };
  type Request = { readonly method: string; readonly path: string; readonly body?: unknown };

  test('l’accusé de lecture part d’abord, puis le corps qui passe le schéma de la passerelle ; les avis confirmés sont comptés', async () => {
    const requests: Request[] = [];
    const { notes, shield } = ledger();
    const outcome = await sendCaptureJob(
      async (request: Request) => {
        requests.push(request);
        return { ok: true, data: { noticedMessageIds: ['0123456789abcdef01234567'] } };
      },
      shield,
      job(),
    );
    expect(outcome).toBe('success');
    expect(requests.map((request) => request.path)).toEqual([
      conversationsEndpoints.byConversationIdReceipts('c-1'),
      conversationsEndpoints.byIdMessagesCapture('c-1'),
    ]);
    expect(requests[0]?.body).toEqual({ type: 'read', caughtUpToMessageId: '0123456789abcdef01234567' });
    expect(contentCaptureBodySchema.safeParse(requests[1]?.body).success).toBe(true);
    expect(notes).toEqual(['declared:c-1', 'noticed:c-1:screenshot:0123456789abcdef01234567']);
  });

  test('réseau coupé : à rejouer', async () => {
    const outcome = await sendCaptureJob(
      async () => {
        throw new Error('hors ligne');
      },
      ledger().shield,
      job(),
    );
    expect(outcome).toBe('transient');
  });

  test('une conversation close (410) : verdict final, rien ne se rejoue', async () => {
    const outcome = await sendCaptureJob(
      async (request: Request) =>
        request.path.endsWith('/receipts') ? { ok: true, data: {} } : { ok: false, status: 410, error: 'closed', code: 'CONVERSATION_CLOSED' },
      ledger().shield,
      job(),
    );
    expect(outcome).toBe('permanent');
  });

  test('trop de déclarations (429) : à rejouer plus tard', async () => {
    const outcome = await sendCaptureJob(
      async (request: Request) => (request.path.endsWith('/receipts') ? { ok: true, data: {} } : { ok: false, status: 429, error: 'rate' }),
      ledger().shield,
      job(),
    );
    expect(outcome).toBe('transient');
  });

  test('les déclarations d’une capture ont la forme que la passerelle exige', () => {
    const jobs = captureJobs({ conversationId: 'c-1', kind: 'screenshot', captureId: newCaptureId(), subjects: rowsOnly(many(12)) });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((item) => /^[A-Za-z0-9_-]{8,64}$/.test(item.captureId))).toBe(true);
    expect(newCaptureId()).not.toBe(newCaptureId());
  });
});

describe('ce qui est VU, pas seulement monté', () => {
  const viewport = { width: 400, height: 800 };
  const rectOf = (top: number, bottom: number, right = 400) => () => ({
    top,
    bottom,
    left: 0,
    right,
    width: right,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  const rowAt = (top: number, bottom: number): Element => {
    const row = document.createElement('div');
    row.getBoundingClientRect = rectOf(top, bottom);
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

  test('le relevé prend les rangées annoncées et vues, plus les vues uniques ; une fenêtre noire ne montre aucune rangée', () => {
    const flame = document.createElement('div');
    flame.setAttribute('data-row', 'm-flame');
    flame.setAttribute('data-capture', 'announced');
    flame.getBoundingClientRect = rectOf(10, 60, 300);
    const unknown = document.createElement('div');
    unknown.setAttribute('data-row', 'm-unknown');
    unknown.setAttribute('data-capture', 'blocked');
    document.body.append(flame, unknown);
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
      flame.remove();
      unknown.remove();
    }
  });
});
