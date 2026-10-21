import { describe, expect, test } from 'bun:test';

import { createBrowserCapture } from '@/lib/calls/call-recording-runtime';
import { createBrowserRecorderEngine } from '@/lib/view/use-recorder';

/**
 * CE QUE L'ENREGISTREUR DU NAVIGATEUR REÇOIT VRAIMENT (#11309) — la loi pure
 * (`recording-codec.test.ts`) ne prouve rien si un moteur construit son
 * `MediaRecorder` sans elle. Un `MediaRecorder` simulé relève les options
 * passées par le vocal et par l'enregistrement d'appel : 32 kb/s et le
 * conteneur de la loi, ou rien n'est branché.
 */

type Constructed = { readonly options: MediaRecorderOptions | undefined };

type Globals = { MediaRecorder?: unknown; window?: unknown };

function withFakeRecorder(supported: (type: string) => boolean, run: () => void): readonly Constructed[] {
  const globals = globalThis as unknown as Globals;
  const previousRecorder = globals.MediaRecorder;
  const previousWindow = globals.window;
  const hadWindowKey = 'window' in globalThis;
  const lacksWindow = typeof previousWindow !== 'object' || previousWindow === null;
  const constructed: Constructed[] = [];
  class FakeRecorder {
    static isTypeSupported = supported;
    readonly mimeType = '';
    readonly state = 'inactive';
    ondataavailable: unknown = null;
    onstop: unknown = null;
    constructor(_stream: unknown, options?: MediaRecorderOptions) {
      constructed.push({ options });
    }
    start(): void {}
    stop(): void {}
  }
  globals.MediaRecorder = FakeRecorder;
  if (lacksWindow) globals.window = {};
  try {
    run();
  } finally {
    globals.MediaRecorder = previousRecorder;
    if (lacksWindow && hadWindowKey) globals.window = previousWindow;
    if (lacksWindow && !hadWindowKey) delete globals.window;
  }
  return constructed;
}

const fakeStream = {} as MediaStream;

const recordVoice = (): void => {
  const engine = createBrowserRecorderEngine();
  engine.start(fakeStream, () => undefined);
  void engine.stop();
};

describe('le vocal enregistre à 32 kb/s dans le conteneur de la loi', () => {
  test('Chromium : webm opus, 32 000 b/s', () => {
    const constructed = withFakeRecorder(() => true, recordVoice);
    expect(constructed.map((entry) => entry.options)).toEqual([{ audioBitsPerSecond: 32_000, mimeType: 'audio/webm;codecs=opus' }]);
  });

  test('WebKit : audio/mp4, 32 000 b/s', () => {
    const constructed = withFakeRecorder((type) => type === 'audio/mp4', recordVoice);
    expect(constructed.map((entry) => entry.options)).toEqual([{ audioBitsPerSecond: 32_000, mimeType: 'audio/mp4' }]);
  });
});

describe('l’enregistrement d’appel garde la voix à 32 kb/s', () => {
  test('appel audio : webm opus, 32 000 b/s', () => {
    const constructed = withFakeRecorder(() => true, () => void createBrowserCapture(fakeStream, 'audio'));
    expect(constructed.map((entry) => entry.options)).toEqual([{ audioBitsPerSecond: 32_000, mimeType: 'audio/webm;codecs=opus' }]);
  });

  test('appel vidéo : mp4 avc1 d’abord, la voix à 32 000 b/s', () => {
    const constructed = withFakeRecorder(() => true, () => void createBrowserCapture(fakeStream, 'video'));
    expect(constructed.map((entry) => entry.options)).toEqual([{ audioBitsPerSecond: 32_000, mimeType: 'video/mp4;codecs=avc1,mp4a.40.2' }]);
  });

  test('appel vidéo sans conteneur annoncé : le débit seul, le navigateur choisit', () => {
    const constructed = withFakeRecorder(() => false, () => void createBrowserCapture(fakeStream, 'video'));
    expect(constructed.map((entry) => entry.options)).toEqual([{ audioBitsPerSecond: 32_000 }]);
  });
});
