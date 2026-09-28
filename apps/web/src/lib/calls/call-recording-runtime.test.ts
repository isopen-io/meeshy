import { describe, expect, test } from 'bun:test';

import { compositeRects, createCallRecorder, recordingTilesOf, type CallRecordingLinkResult, type CompositeTile } from './call-recording-runtime';
import { createCallStore, type ActiveCall, type CallMember } from './call-store';

/**
 * CE QUI CAPTE, CHEZ L'ENREGISTREUR SEUL (#8064) — le mélange des voix (la
 * sienne et celle de chaque pair, y compris un pair arrivé en cours de route),
 * le fichier audio, son dépôt par le chemin des pièces jointes et son
 * rattachement à la bulle de l'appel. Mélangeur, capture, dépôt et
 * rattachement sont simulés : on lit ce qui est BRANCHÉ et ce qui PART.
 */

const stream = (id: string): MediaStream => ({ id, getVideoTracks: () => [{ readyState: 'live' }] }) as unknown as MediaStream;

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
  initiatorId: null,
  invitedBy: null,
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
  const tiles: Array<readonly CompositeTile[]> = [];
  const captured: Array<{ readonly stream: string; readonly kind: string }> = [];
  const clock = { now: 1_000 };
  const answers = [...(options.links ?? ['linked'])];
  const start = createCallRecorder({
    calls,
    createMixer: () => ({
      output: stream('mix'),
      add: (key) => void mixed.push(key),
      close: () => void log.push('mixer-closed'),
    }),
    createCompositor: () => ({
      output: 'canvas-track' as unknown as MediaStreamTrack,
      setTiles: (next) => void tiles.push(next),
      close: () => void log.push('compositor-closed'),
    }),
    combine: (audio, video) => ({ id: `${audio.id}+${String(video)}` }) as unknown as MediaStream,
    createCapture: (captureStream, kind) => ({
      start: () => {
        captured.push({ stream: captureStream.id, kind });
        log.push('capture-started');
      },
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
  return { calls, start, mixed, uploads, links, log, clock, tiles, captured };
}

describe('le mélange — la voix de chacun', () => {
  test('la voix locale et celle du pair sont branchées au départ, puis la capture démarre', () => {
    const h = harness();
    h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
    expect(h.mixed).toEqual(['local:local', 'remote:u-peer:peer']);
    expect(h.log).toEqual(['capture-started']);
  });

  test('un pair arrivé en cours de route rejoint le mélange, une seule fois', () => {
    const h = harness();
    h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
    const call = h.calls.getState().call as ActiveCall;
    h.calls.setState({ call: { ...call, remoteStreams: { ...call.remoteStreams, 'u-third': stream('third') } } });
    h.calls.setState({ call: { ...(h.calls.getState().call as ActiveCall), micMuted: true } });
    expect(h.mixed).toEqual(['local:local', 'remote:u-peer:peer', 'remote:u-third:third']);
  });

  test('après l’arrêt, plus rien ne se branche', async () => {
    const h = harness();
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
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
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
    h.clock.now = 273_000;
    expect(await handle.stop()).toBe('saved');
    expect(h.uploads).toEqual([{ name: 'appel-call-1.webm', type: 'audio/webm;codecs=opus', durationMs: 272_000 }]);
    expect(h.links).toEqual([{ callId: 'call-1', recordingId: 'rec-1', kind: 'audio', attachmentId: 'att-rec' }]);
  });

  test('un enregistrement WebKit part en .m4a', async () => {
    const h = harness({ blob: new Blob(['voix'], { type: 'audio/mp4' }) });
    await h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop();
    expect(h.uploads[0]?.name).toBe('appel-call-1.m4a');
  });

  test('une capture vide ne dépose rien', async () => {
    const h = harness({ blob: new Blob([], { type: 'audio/webm' }) });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop()).toBe('empty');
    expect(h.uploads).toEqual([]);
  });

  test('un dépôt refusé ne tente aucun rattachement', async () => {
    const h = harness({ uploaded: null });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop()).toBe('save-failed');
    expect(h.links).toEqual([]);
  });

  test('la bulle pas encore écrite : le rattachement réessaie, puis abandonne', async () => {
    const late = harness({ links: ['bubble-missing', 'linked'] });
    expect(await late.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop()).toBe('saved');
    expect(late.links).toHaveLength(2);

    const never = harness({ links: ['bubble-missing', 'bubble-missing', 'bubble-missing', 'bubble-missing'] });
    expect(await never.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop()).toBe('save-failed');
    expect(never.links).toHaveLength(3);
  });

  test('un refus définitif de la passerelle ne réessaie pas', async () => {
    const h = harness({ links: ['failed'] });
    expect(await h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' }).stop()).toBe('save-failed');
    expect(h.links).toHaveLength(1);
  });

  test('arrêter deux fois ne dépose qu’une fois', async () => {
    const h = harness();
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
    await Promise.all([handle.stop(), handle.stop()]);
    expect(h.uploads).toHaveLength(1);
  });
});

const peer = (patch: Partial<CallMember> = {}): CallMember => ({
  userId: 'u-peer',
  name: 'Nadia',
  avatar: null,
  micMuted: false,
  cameraOn: true,
  screenSharing: false,
  weakNetwork: false,
  capturing: false,
  link: 'connected',
  ...patch,
});

describe('la vidéo — les tuiles visibles, composées, avec le mélange des voix (#8437)', () => {
  test('les tuiles sont celles de l’écran : chaque pair (image s’il en a une), puis moi', () => {
    const call = activeCall({ cameraOn: true, members: { 'u-peer': peer(), 'u-off': peer({ userId: 'u-off', name: 'Léo', cameraOn: false }), 'u-ring': peer({ userId: 'u-ring', link: 'ringing' }) }, remoteStreams: { 'u-peer': stream('peer'), 'u-off': stream('off') } });
    expect(recordingTilesOf(call).map((tile) => [tile.key, tile.name, tile.stream?.id ?? null])).toEqual([
      ['u-off', 'Léo', null],
      ['u-peer', 'Nadia', 'peer'],
      ['self', '', 'local'],
    ]);
  });

  test('une vidéo compose les tuiles, y mêle les voix, et suit l’appel', () => {
    const h = harness();
    h.calls.setState({ call: activeCall({ members: { 'u-peer': peer() } }) });
    h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'video' });
    expect(h.captured).toEqual([{ stream: 'mix+canvas-track', kind: 'video' }]);
    expect(h.tiles.at(-1)?.map((tile) => tile.key)).toEqual(['u-peer', 'self']);
    h.calls.setState({ call: activeCall({ members: {} }) });
    expect(h.tiles.at(-1)?.map((tile) => tile.key)).toEqual(['self']);
  });

  test('l’arrêt ferme la composition et dépose un fichier vidéo', async () => {
    const h = harness({ blob: new Blob(['image'], { type: 'video/webm;codecs=vp8,opus' }) });
    const handle = h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'video' });
    expect(await handle.stop()).toBe('saved');
    expect(h.log).toContain('compositor-closed');
    expect(h.uploads[0]).toMatchObject({ name: 'appel-call-1.webm', type: 'video/webm;codecs=vp8,opus' });
  });

  test('une vidéo WebKit part en .mp4', async () => {
    const h = harness({ blob: new Blob(['image'], { type: 'video/mp4' }) });
    await h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'video' }).stop();
    expect(h.uploads[0]?.name).toBe('appel-call-1.mp4');
  });

  test('l’audio seul ne compose rien', () => {
    const h = harness();
    h.start({ callId: 'call-1', recordingId: 'rec-1', kind: 'audio' });
    expect(h.tiles).toEqual([]);
    expect(h.captured).toEqual([{ stream: 'mix', kind: 'audio' }]);
  });

  test('la grille de composition : une tuile pleine, puis des colonnes qui couvrent le cadre sans déborder', () => {
    expect(compositeRects(1, 1280, 720)).toEqual([{ x: 0, y: 0, width: 1280, height: 720 }]);
    const four = compositeRects(4, 1280, 720);
    expect(four).toHaveLength(4);
    expect(four[3]).toEqual({ x: 640, y: 360, width: 640, height: 360 });
    const three = compositeRects(3, 1280, 720);
    expect(three.every((rect) => rect.x + rect.width <= 1280 && rect.y + rect.height <= 720)).toBe(true);
    expect(compositeRects(0, 1280, 720)).toEqual([]);
  });
});
