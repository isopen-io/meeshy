import { describe, expect, test } from 'bun:test';

import { createCallRecorder, type CallRecordingLinkResult } from './call-recording-runtime';
import { createCallStore, type ActiveCall } from './call-store';

/**
 * CE QUI CAPTE, CHEZ L'ENREGISTREUR SEUL (#8064) — le mélange des voix (la
 * sienne et celle de chaque pair, y compris un pair arrivé en cours de route),
 * le fichier audio, son dépôt par le chemin des pièces jointes et son
 * rattachement à la bulle de l'appel. Mélangeur, capture, dépôt et
 * rattachement sont simulés : on lit ce qui est BRANCHÉ et ce qui PART.
 */

const stream = (id: string): MediaStream => ({ id }) as unknown as MediaStream;

const activeCall = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'audio',
  direction: 'outgoing',
  isGroup: false,
  title: 'Nadia',
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
  localStream: stream('local'),
  remoteStreams: { 'u-peer': stream('peer') },
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  ...overrides,
});

function harness(options: { readonly blob?: Blob; readonly uploaded?: string | null; readonly links?: readonly CallRecordingLinkResult[] } = {}) {
  const calls = createCallStore();
  calls.setState({ call: activeCall() });
  const mixed: string[] = [];
  const uploads: Array<{ readonly name: string; readonly type: string; readonly durationMs: number }> = [];
  const links: Array<{ readonly callId: string; readonly recordingId: string; readonly attachmentId: string }> = [];
  const log: string[] = [];
  const clock = { now: 1_000 };
  const answers = [...(options.links ?? ['linked'])];
  const start = createCallRecorder({
    calls,
    createMixer: () => ({
      output: stream('mix'),
      add: (key) => void mixed.push(key),
      close: () => void log.push('mixer-closed'),
    }),
    createCapture: () => ({
      start: () => void log.push('capture-started'),
      stop: async () => {
        log.push('capture-stopped');
        return options.blob ?? new Blob(['voix'], { type: 'audio/webm;codecs=opus' });
      },
    }),
    upload: async (file, durationMs) => {
      uploads.push({ name: file.name, type: file.type, durationMs });
      return options.uploaded === undefined ? 'att-rec' : options.uploaded;
    },
    link: async (target, attachmentId) => {
      links.push({ ...target, attachmentId });
      return answers.shift() ?? 'failed';
    },
    now: () => clock.now,
    wait: async () => undefined,
  });
  return { calls, start, mixed, uploads, links, log, clock };
}

describe('le mélange — la voix de chacun', () => {
  test('la voix locale et celle du pair sont branchées au départ, puis la capture démarre', () => {
    const h = harness();
    h.start({ callId: 'call-1', recordingId: 'rec-1' });
    expect(h.mixed).toEqual(['local:local', 'remote:u-peer:peer']);
    expect(h.log).toEqual(['capture-started']);
  });

  test('un pair arrivé en cours de route rejoint le mélange, une seule fois', () => {
    const h = harness();
    h.start({ callId: 'call-1', recordingId: 'rec-1' });
    const call = h.calls.getState().call as ActiveCall;
    h.calls.setState({ call: { ...call, remoteStreams: { ...call.remoteStreams, 'u-third': stream('third') } } });
    h.calls.setState({ call: { ...(h.calls.getState().call as ActiveCall), micMuted: true } });
    expect(h.mixed).toEqual(['local:local', 'remote:u-peer:peer', 'remote:u-third:third']);
  });

  test('après l’arrêt, plus rien ne se branche', async () => {
    const h = harness();
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1' });
    await handle.stop();
    const call = h.calls.getState().call as ActiveCall;
    h.calls.setState({ call: { ...call, remoteStreams: { 'u-late': stream('late') } } });
    expect(h.mixed).not.toContain('remote:u-late:late');
    expect(h.log).toEqual(['capture-started', 'capture-stopped', 'mixer-closed']);
  });
});

describe('le dépôt — un fichier audio rattaché à la bulle de l’appel', () => {
  test('le fichier part par le chemin des pièces jointes, avec sa durée, puis rejoint la bulle', async () => {
    const h = harness();
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1' });
    h.clock.now = 273_000;
    expect(await handle.stop()).toBe('saved');
    expect(h.uploads).toEqual([{ name: 'appel-call-1.webm', type: 'audio/webm;codecs=opus', durationMs: 272_000 }]);
    expect(h.links).toEqual([{ callId: 'call-1', recordingId: 'rec-1', attachmentId: 'att-rec' }]);
  });

  test('un enregistrement WebKit part en .m4a', async () => {
    const h = harness({ blob: new Blob(['voix'], { type: 'audio/mp4' }) });
    await h.start({ callId: 'call-1', recordingId: 'rec-1' }).stop();
    expect(h.uploads[0]?.name).toBe('appel-call-1.m4a');
  });

  test('une capture vide ne dépose rien', async () => {
    const h = harness({ blob: new Blob([], { type: 'audio/webm' }) });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1' }).stop()).toBe('empty');
    expect(h.uploads).toEqual([]);
  });

  test('un dépôt refusé ne tente aucun rattachement', async () => {
    const h = harness({ uploaded: null });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1' }).stop()).toBe('save-failed');
    expect(h.links).toEqual([]);
  });

  test('la bulle pas encore écrite : le rattachement réessaie, puis abandonne', async () => {
    const late = harness({ links: ['bubble-missing', 'linked'] });
    expect(await late.start({ callId: 'call-1', recordingId: 'rec-1' }).stop()).toBe('saved');
    expect(late.links).toHaveLength(2);

    const never = harness({ links: ['bubble-missing', 'bubble-missing', 'bubble-missing', 'bubble-missing'] });
    expect(await never.start({ callId: 'call-1', recordingId: 'rec-1' }).stop()).toBe('save-failed');
    expect(never.links).toHaveLength(3);
  });

  test('un refus définitif de la passerelle ne réessaie pas', async () => {
    const h = harness({ links: ['failed'] });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1' }).stop()).toBe('save-failed');
    expect(h.links).toHaveLength(1);
  });

  test('arrêter deux fois ne dépose qu’une fois', async () => {
    const h = harness();
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1' });
    await Promise.all([handle.stop(), handle.stop()]);
    expect(h.uploads).toHaveLength(1);
  });
});
