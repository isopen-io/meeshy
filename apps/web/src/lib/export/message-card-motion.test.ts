import { describe, expect, test } from 'bun:test';

import type { MessageCardInput } from './message-card-layout';
import { recordCardGif, recordCardVideo } from './message-card-motion';

const input: MessageCardInput = {
  quoted: null,
  reply: { author: 'Jacques', text: 'Regarde' },
  handle: 'jacques',
  template: 'aurore.rond.orbite',
  media: [{ kind: 'video', width: 16, height: 9 }],
};

const unusedDocument = { createElement: () => ({ getContext: () => null }) } as unknown as Document;

describe('l’export animé — ce qui manque rend null, jamais une exception', () => {
  test('sans enregistreur, pas de vidéo', async () => {
    const blob = await recordCardVideo({
      input,
      sources: [null],
      track: { url: 'blob:v', kind: 'video', index: 0 },
      durationMs: 1000,
      env: { doc: unusedDocument, requestFrame: () => undefined, MediaRecorder: undefined, AudioContext: undefined },
    });
    expect(blob).toBeNull();
  });

  test('un enregistreur qui ne sait écrire aucun conteneur ne filme rien', async () => {
    const Recorder = { isTypeSupported: () => false } as unknown as typeof MediaRecorder;
    const blob = await recordCardVideo({
      input,
      sources: [null],
      track: { url: 'blob:v', kind: 'video', index: 0 },
      durationMs: 1000,
      env: { doc: unusedDocument, requestFrame: () => undefined, MediaRecorder: Recorder, AudioContext: undefined },
    });
    expect(blob).toBeNull();
  });

  test('un GIF ne se fait jamais d’un audio', async () => {
    const blob = await recordCardGif({ input, sources: [null], track: { url: 'blob:a', kind: 'audio', index: null }, durationMs: 1000, env: { doc: unusedDocument } });
    expect(blob).toBeNull();
  });

  test('un canvas refusé ne donne pas de GIF', async () => {
    const blob = await recordCardGif({ input, sources: [null], track: { url: 'blob:v', kind: 'video', index: 0 }, durationMs: 1000, env: { doc: unusedDocument } });
    expect(blob).toBeNull();
  });
});
