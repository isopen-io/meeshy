import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPEECH_AUDIO_BITS_PER_SECOND, recordingMimeOf, speechRecorderOptionsOf } from './recording-codec';

const everything = () => true;
const nothing = () => false;
const onlyWebm = (type: string) => type.startsWith('video/webm') || type === 'audio/webm;codecs=opus';

describe('recordingMimeOf — une seule loi de codecs par nature d’enregistrement (#11309)', () => {
  test('vocal : webm opus d’abord (Chromium, Android), mp4 ensuite (WebKit)', () => {
    expect(recordingMimeOf('audio', everything)).toBe('audio/webm;codecs=opus');
    expect(recordingMimeOf('audio', (type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(recordingMimeOf('audio', nothing)).toBeUndefined();
  });

  test('vidéo : mp4 (avc1) d’abord, webm ensuite — le même ordre pour la caméra, le clip et l’export', () => {
    expect(recordingMimeOf('video', everything)).toBe('video/mp4;codecs=avc1,mp4a.40.2');
    expect(recordingMimeOf('video', onlyWebm)).toBe('video/webm;codecs=vp9,opus');
    expect(recordingMimeOf('video', (type) => type === 'video/webm')).toBe('video/webm');
    expect(recordingMimeOf('video', nothing)).toBeUndefined();
  });
});

describe('speechRecorderOptionsOf — 32 kb/s pour la parole (vocaux, enregistrements d’appel)', () => {
  test('le débit audio est 32 000 b/s', () => {
    expect(SPEECH_AUDIO_BITS_PER_SECOND).toBe(32_000);
  });

  test('un vocal reçoit le type choisi ET le débit', () => {
    expect(speechRecorderOptionsOf('audio', everything)).toEqual({ audioBitsPerSecond: 32_000, mimeType: 'audio/webm;codecs=opus' });
  });

  test('un enregistrement d’appel vidéo garde le débit parole sans type imposé quand rien n’est servi', () => {
    expect(speechRecorderOptionsOf('video', nothing)).toEqual({ audioBitsPerSecond: 32_000 });
    expect(Object.keys(speechRecorderOptionsOf('video', nothing))).not.toContain('mimeType');
  });
});

describe('garde — les littéraux de codecs ne vivent qu’à un seul endroit de production', () => {
  test('aucune autre source de production ne redéclare la liste', () => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const sources = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return sources(path);
        return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
      });
    const offenders = sources(root)
      .filter((path) => !relative(root, path).endsWith(join('lib', 'media', 'recording-codec.ts')))
      .filter((path) => /codecs=vp9|codecs=vp8|codecs=opus|codecs=avc1/.test(readFileSync(path, 'utf8')));
    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });
});
