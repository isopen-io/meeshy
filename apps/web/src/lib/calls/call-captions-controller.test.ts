import { describe, expect, test } from 'bun:test';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { CHANNEL_PING_MS, createCaptions, type SpeechResult, type SpeechSource } from './call-captions-controller';
import { createCallStore, type ActiveCall, type CallMember } from './call-store';

/**
 * LES SOUS-TITRES D'UN APPEL, VIVANTS (#8048) — le contrôleur contre un vrai
 * magasin d'appel, un socket, un canal de données et une reconnaissance vocale
 * simulés : ce qu'il ÉMET (charges exactes) et ce que le lecteur LIT.
 */

const ME = 'u-me';
const PEER = 'u-peer';

const member = (userId: string, name: string): CallMember => ({ userId, name, avatar: null, micMuted: false, cameraOn: false, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' });

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
  members: { [PEER]: member(PEER, 'Nadia Benali') },
  display: 'full',
  localStream: null,
  remoteStreams: {},
  captions: [],
  captionsMode: 'off',
  captionPeers: [],
  transcription: 'idle',
  quality: null,
  ...overrides,
});

type FakeChannel = { readyState: string; sent: string[]; send: (raw: string) => void; onmessage: ((event: { data: unknown }) => void) | null; onclose: (() => void) | null };

const channel = (): FakeChannel => {
  const self: FakeChannel = { readyState: 'open', sent: [], send: (raw) => void self.sent.push(raw), onmessage: null, onclose: null };
  return self;
};

function harness(options: { readonly speech?: 'supported' | 'unsupported' | 'denied' } = {}) {
  const store = createCallStore();
  store.setState({ call: activeCall() });
  const emitted: Array<readonly [string, unknown]> = [];
  const repeats: Array<{ readonly fn: () => void; readonly ms: number; stopped: boolean }> = [];
  const captures: Array<{ readonly language: string; readonly onResult: (result: SpeechResult) => void; stopped: boolean }> = [];
  let clock = 10_000;
  let shown = 0;
  let byes = 0;
  let ids = 0;
  const speech: SpeechSource | null =
    options.speech === 'unsupported'
      ? null
      : ({ language, onResult, onFailure }) => {
          if (options.speech === 'denied') {
            onFailure('denied');
            return { stop: () => undefined };
          }
          const capture = { language, onResult, stopped: false };
          captures.push(capture);
          return { stop: () => void (capture.stopped = true) };
        };
  const port = createCaptions(
    {
      callId: 'call-1',
      read: () => store.getState().call,
      update: (fn) => {
        const call = store.getState().call;
        if (call !== null) store.setState({ call: fn(call) });
      },
      emit: (event, payload) => void emitted.push([event, payload]),
      viewerId: () => ME,
      now: () => clock,
      repeat: (fn, ms) => repeats.push({ fn, ms, stopped: false }) - 1,
      stopRepeat: (handle) => {
        const entry = repeats[handle as number];
        if (entry !== undefined) entry.stopped = true;
      },
      shown: () => void (shown += 1),
      bye: () => void (byes += 1),
    },
    { speech, language: () => 'fr', viewerName: () => 'Moi Même', newId: () => `w-${++ids}` },
  );
  return {
    port,
    store,
    emitted,
    repeats,
    captures,
    call: () => store.getState().call,
    tick: (ms: number) => void (clock += ms),
    shown: () => shown,
    byes: () => byes,
    say: (text: string, isFinal: boolean, confidence = 0.9) => captures.at(-1)?.onResult({ text, isFinal, confidence }),
    events: (name: string) => emitted.filter(([event]) => event === name).map(([, payload]) => payload),
  };
}

const translated = (overrides: Record<string, unknown> = {}) => ({
  callId: 'call-1',
  segment: { id: 'w-peer-1', text: 'Hello everyone', translatedText: 'Bonjour à tous', speakerId: PEER, speakerDisplayName: 'Nadia Benali', startMs: 0, endMs: 900, isFinal: true, sourceLanguage: 'en', targetLanguage: 'fr', confidence: 0.9, capturedAtMs: 5_000, ...overrides },
});

describe('recevoir les sous-titres (G1, G2, G4)', () => {
  test('un segment traduit entre au journal ; le mode traduit le lit traduit, le mode original tel qu’il a été dit', () => {
    const h = harness();
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated());
    expect(h.call()?.captions).toEqual([{ id: 'w-peer-1', speakerId: PEER, speakerName: 'Nadia Benali', original: 'Hello everyone', translated: 'Bonjour à tous', isFinal: true, at: 5_000, mine: false }]);
  });

  test('un segment d’un AUTRE appel ou que je prétendrais avoir dit est écarté', () => {
    const h = harness();
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, { ...translated(), callId: 'call-2' });
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated({ speakerId: ME }));
    expect(h.call()?.captions).toEqual([]);
  });

  test('le bouton suit off → traduit → original → off et le dit au pair par call:transcription-active', () => {
    const h = harness();
    h.port.toggle();
    expect(h.call()?.captionsMode).toBe('translated');
    h.port.toggle();
    expect(h.call()?.captionsMode).toBe('original');
    h.port.toggle();
    expect(h.call()?.captionsMode).toBe('off');
    expect(h.events(CLIENT_EVENTS.CALL_TRANSCRIPTION_ACTIVE)).toEqual([
      { callId: 'call-1', active: true },
      { callId: 'call-1', active: false },
    ]);
  });

  test('des sous-titres AFFICHÉS comptent pour call:analytics ; reçus panneau fermé, non', () => {
    const h = harness();
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated());
    expect(h.shown()).toBe(0);
    h.port.toggle();
    expect(h.shown()).toBe(1);
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated({ id: 'w-peer-2' }));
    expect(h.shown()).toBe(2);
  });

  test('un pair qui ouvre son panneau est retenu, puis oublié quand il le ferme', () => {
    const h = harness();
    h.port.receive(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', speakerId: PEER, active: true });
    expect(h.call()?.captionPeers).toEqual([PEER]);
    h.port.receive(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', speakerId: PEER, active: false });
    expect(h.call()?.captionPeers).toEqual([]);
  });
});

describe('le canal de données (B10)', () => {
  test('une entrée P2P est attribuée au pair du LIEN, puis enrichie par la traduction de la passerelle en UNE ligne', () => {
    const h = harness();
    const peer = channel();
    h.port.attach(PEER, peer as unknown as RTCDataChannel);
    peer.onmessage?.({ data: JSON.stringify({ type: 'transcript-entry', entry: { id: 'w-peer-1', callId: 'call-1', speakerId: 'u-quelqu-un', speakerDisplayName: 'Usurpateur', text: 'Hello everyone', language: 'en', capturedAtMs: 5_000, isFinal: true, confidence: 0.9 } }) });
    expect(h.call()?.captions[0]).toMatchObject({ speakerId: PEER, speakerName: 'Nadia Benali', original: 'Hello everyone', translated: null });
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated());
    expect(h.call()?.captions).toHaveLength(1);
    expect(h.call()?.captions[0]?.translated).toBe('Bonjour à tous');
  });

  test('un « bye » du pair raccroche aussitôt ; un ping est du bruit', () => {
    const h = harness();
    const peer = channel();
    h.port.attach(PEER, peer as unknown as RTCDataChannel);
    peer.onmessage?.({ data: '{"type":"ping"}' });
    expect(h.byes()).toBe(0);
    peer.onmessage?.({ data: '{"type":"bye","reason":"completed"}' });
    expect(h.byes()).toBe(1);
  });

  test('un ping part toutes les 15 s ; raccrocher envoie « bye » puis se tait', () => {
    const h = harness();
    const peer = channel();
    h.port.attach(PEER, peer as unknown as RTCDataChannel);
    expect(h.repeats.map((entry) => entry.ms)).toEqual([CHANNEL_PING_MS]);
    h.repeats[0]?.fn();
    expect(peer.sent).toEqual(['{"type":"ping"}']);
    h.port.stop(true);
    expect(JSON.parse(peer.sent.at(-1) ?? '{}')).toEqual({ type: 'bye', reason: 'completed' });
    expect(h.repeats[0]?.stopped).toBe(true);
    expect(peer.onmessage).toBeNull();
  });
});

describe('le web transcrit son micro (G3, G5)', () => {
  test('rien n’est capté tant que personne n’écoute ; mon panneau ouvert lance la reconnaissance dans la langue du lecteur', () => {
    const h = harness();
    expect(h.captures).toHaveLength(0);
    h.port.toggle();
    expect(h.captures.map((capture) => capture.language)).toEqual(['fr']);
    expect(h.call()?.transcription).toBe('listening');
    h.port.toggle();
    h.port.toggle();
    expect(h.captures[0]?.stopped).toBe(true);
    expect(h.call()?.transcription).toBe('idle');
  });

  test('un PAIR qui écoute fait transcrire mon micro, même panneau fermé (TranscriptionCapturePolicy)', () => {
    const h = harness();
    h.port.receive(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', speakerId: PEER, active: true });
    expect(h.captures).toHaveLength(1);
    h.port.receive(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'call-1', speakerId: PEER, active: false });
    expect(h.captures[0]?.stopped).toBe(true);
  });

  test('les révisions partent en P2P ; le FINAL part AUSSI par call:transcription-segment, à la charge exacte', () => {
    const h = harness();
    const peer = channel();
    h.port.attach(PEER, peer as unknown as RTCDataChannel);
    h.port.toggle();
    h.tick(1_200);
    h.say('Bonjour', false, 0);
    h.tick(800);
    h.say(' Bonjour à tous ', true, 0.87);
    const entries = peer.sent.map((raw) => JSON.parse(raw) as { type: string; entry: { id: string; text: string; isFinal: boolean } });
    expect(entries.map((message) => [message.type, message.entry.id, message.entry.text, message.entry.isFinal])).toEqual([
      ['transcript-entry', 'w-1', 'Bonjour', false],
      ['transcript-entry', 'w-1', 'Bonjour à tous', true],
    ]);
    expect(h.events(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT)).toEqual([
      { callId: 'call-1', segment: { id: 'w-1', text: 'Bonjour à tous', speakerId: ME, startMs: 1_200, endMs: 2_000, isFinal: true, confidence: 0.87, language: 'fr', capturedAtMs: 11_200 } },
    ]);
    expect(h.call()?.captions).toEqual([{ id: 'w-1', speakerId: ME, speakerName: 'Moi Même', original: 'Bonjour à tous', translated: null, isFinal: true, at: 11_200, mine: true }]);
    h.say('Deuxième phrase', true);
    expect(h.events(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT).map((payload) => (payload as { segment: { id: string } }).segment.id)).toEqual(['w-1', 'w-2']);
  });

  test('sans reconnaissance vocale, on REÇOIT quand même, et l’état le dit', () => {
    const h = harness({ speech: 'unsupported' });
    expect(h.call()?.transcription).toBe('unsupported');
    h.port.toggle();
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated());
    expect(h.call()?.captions).toHaveLength(1);
    expect(h.events(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT)).toEqual([]);
  });

  test('un micro refusé à la reconnaissance se dit, et n’est pas réclamé en boucle', () => {
    const h = harness({ speech: 'denied' });
    h.port.toggle();
    expect(h.call()?.transcription).toBe('denied');
    h.port.toggle();
    h.port.toggle();
    h.port.toggle();
    expect(h.call()?.transcription).toBe('denied');
  });

  test('la fin de l’appel coupe la capture ; plus rien ne part ensuite', () => {
    const h = harness();
    h.port.toggle();
    h.port.stop(false);
    expect(h.captures[0]?.stopped).toBe(true);
    h.say('trop tard', true);
    h.port.receive(SERVER_EVENTS.CALL_TRANSLATED_SEGMENT, translated());
    expect(h.events(CLIENT_EVENTS.CALL_TRANSCRIPTION_SEGMENT)).toEqual([]);
    expect(h.call()?.captions).toEqual([]);
  });
});
