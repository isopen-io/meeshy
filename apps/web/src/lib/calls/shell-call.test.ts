import { describe, expect, test } from 'bun:test';

import type { DeliveryReceiptCredential } from '@/lib/notifications/delivery-receipt-credential';

import { createCallStore, type ActiveCall, type CallMedia, type CallPhase } from './call-store';
import {
  audioRouteLabelKey,
  bindShellCall,
  shellCallCommands,
  shellCallSnapshot,
  type ShellCallCommand,
  type ShellCallEnvironment,
} from './shell-call';

/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — la page pilote `MeeshyCallPlugin`
 * depuis le magasin d'appel : service au premier plan tant qu'un appel vit,
 * haptique aux transitions, décroché depuis la notification, credential du
 * refus sans socket.
 */

const call = (phase: CallPhase, media: CallMedia = 'audio', callId: string | null = 'call-1'): ActiveCall => ({
  callId,
  conversationId: 'conv-1',
  media,
  direction: 'incoming',
  isGroup: false,
  title: 'Awa',
  avatar: null,
  callerName: null,
  phase,
  connectedAt: null,
  endedDurationSec: null,
  micMuted: false,
  cameraOn: media === 'video',
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
});

const snap = (phase: CallPhase | null, media: CallMedia = 'audio') =>
  shellCallSnapshot(phase === null ? null : call(phase, media));

const methods = (commands: readonly ShellCallCommand[]): readonly string[] =>
  commands.map((command) => `${command.method}${'kind' in command.options ? `:${String(command.options.kind)}` : ''}`);

describe('shellCallCommands — ce que la coque fait à chaque changement du magasin', () => {
  test('un appel qui sort de la sonnerie démarre le service au premier plan, en audio', () => {
    expect(shellCallCommands(snap({ kind: 'incoming' }), snap({ kind: 'connecting' }))).toEqual([
      { method: 'startCallService', options: { video: false } },
    ]);
  });

  test('un appel sortant tient le service dès la numérotation', () => {
    expect(shellCallCommands(snap(null), snap({ kind: 'outgoing' }, 'video'))).toEqual([
      { method: 'startCallService', options: { video: true } },
    ]);
  });

  test('une sonnerie seule ne démarre rien : le micro n’est pas encore pris', () => {
    expect(shellCallCommands(snap(null), snap({ kind: 'incoming' }))).toEqual([]);
  });

  test('connecté → vibration courte, sans redémarrer le service', () => {
    expect(methods(shellCallCommands(snap({ kind: 'connecting' }), snap({ kind: 'connected' })))).toEqual([
      'haptic:connected',
    ]);
  });

  test('reconnexion → vibration de reconnexion', () => {
    expect(methods(shellCallCommands(snap({ kind: 'connected' }), snap({ kind: 'reconnecting' })))).toEqual([
      'haptic:reconnecting',
    ]);
  });

  test('fin d’un appel vivant → service arrêté et vibration de fin', () => {
    const ended = snap({ kind: 'ended', reason: 'remote', detail: null });
    expect(methods(shellCallCommands(snap({ kind: 'connected' }), ended))).toEqual(['stopCallService', 'haptic:ended']);
  });

  test('l’appel retiré du magasin arrête aussi le service', () => {
    expect(methods(shellCallCommands(snap({ kind: 'connected' }), snap(null)))).toEqual(['stopCallService']);
  });

  test('une sonnerie refusée ne vibre pas et n’arrête rien de démarré', () => {
    const ended = snap({ kind: 'ended', reason: 'rejected', detail: null });
    expect(shellCallCommands(snap({ kind: 'incoming' }), ended)).toEqual([]);
  });

  test('passer en vidéo en cours d’appel réclame le type caméra au service', () => {
    expect(shellCallCommands(snap({ kind: 'connected' }), snap({ kind: 'connected' }, 'video'))).toEqual([
      { method: 'startCallService', options: { video: true } },
    ]);
  });

  test('couper le micro pendant l’appel le dit à la fenêtre flottante de la coque (#8144)', () => {
    const live = snap({ kind: 'connected' }, 'video');
    const muted = shellCallSnapshot({ ...call({ kind: 'connected' }, 'video'), micMuted: true });
    expect(shellCallCommands(live, muted)).toEqual([{ method: 'setPictureInPictureControls', options: { micMuted: true } }]);
    expect(shellCallCommands(muted, live)).toEqual([{ method: 'setPictureInPictureControls', options: { micMuted: false } }]);
  });

  test('un appel qui démarre micro coupé le dit dès le service', () => {
    const muted = shellCallSnapshot({ ...call({ kind: 'outgoing' }, 'video'), micMuted: true });
    expect(methods(shellCallCommands(snap(null), muted))).toEqual(['startCallService', 'setPictureInPictureControls']);
  });

  test('un micro coupé pendant la sonnerie n’envoie rien : aucune fenêtre ne flotte', () => {
    const ringing = shellCallSnapshot({ ...call({ kind: 'incoming' }), micMuted: true });
    expect(shellCallCommands(snap({ kind: 'incoming' }), ringing)).toEqual([]);
  });

  test('la fenêtre flottante prend le format de la vidéo du pair, et le suit quand il change (#8144)', () => {
    const peer = { userId: 'u-a', name: 'Awa', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connected' as const };
    const sized = (width: number, height: number) =>
      ({ getVideoTracks: () => [{ readyState: 'live', getSettings: () => ({ width, height }) }] }) as unknown as MediaStream;
    const live = snap({ kind: 'connected' }, 'video');
    const portrait = shellCallSnapshot({ ...call({ kind: 'connected' }, 'video'), members: { 'u-a': peer }, remoteStreams: { 'u-a': sized(720, 1280) } });
    const landscape = shellCallSnapshot({ ...call({ kind: 'connected' }, 'video'), members: { 'u-a': peer }, remoteStreams: { 'u-a': sized(1280, 720) } });
    expect(shellCallCommands(live, portrait)).toEqual([
      { method: 'setPictureInPictureControls', options: { micMuted: false, aspectWidth: 720, aspectHeight: 1280 } },
    ]);
    expect(shellCallCommands(portrait, landscape)).toEqual([
      { method: 'setPictureInPictureControls', options: { micMuted: false, aspectWidth: 1280, aspectHeight: 720 } },
    ]);
    expect(shellCallCommands(portrait, portrait)).toEqual([]);
  });

  test('aucun changement → aucune commande', () => {
    expect(shellCallCommands(snap({ kind: 'connected' }), snap({ kind: 'connected' }))).toEqual([]);
  });
});

function harness(options: { readonly failing?: boolean } = {}) {
  const store = createCallStore();
  const sent: Array<{ readonly method: string; readonly options: object }> = [];
  const events: Array<(data: unknown) => void> = [];
  const credentialWriters: Array<(value: DeliveryReceiptCredential) => void> = [];
  const accepted: number[] = [];
  const floating: Array<(data: unknown) => void> = [];
  const pictureInPicture: boolean[] = [];
  const windowButtons: Array<(data: unknown) => void> = [];
  const gestures: string[] = [];
  const env: ShellCallEnvironment = {
    native: (method, payload) => {
      sent.push({ method, options: payload });
      return options.failing === true ? Promise.reject(new Error('natif')) : Promise.resolve({});
    },
    listen: (event, listener) => {
      if (event === 'callAnswer') events.push(listener);
      if (event === 'pictureInPictureModeChanged') floating.push(listener);
      if (event === 'pictureInPictureAction') windowButtons.push(listener);
    },
    toggleMic: () => void gestures.push('mic'),
    hangup: () => void gestures.push('hangup'),
    pictureInPicture: (active) => void pictureInPicture.push(active),
    store,
    accept: () => void accepted.push(1),
    watchCredential: (write) => {
      credentialWriters.push(write);
      return () => undefined;
    },
    now: () => 1_000,
  };
  const stop = bindShellCall(env);
  return {
    store,
    sent,
    accepted,
    stop,
    answer: (callId: unknown) => events.forEach((listener) => listener({ callId })),
    float: (data: unknown) => floating.forEach((listener) => listener(data)),
    press: (data: unknown) => windowButtons.forEach((listener) => listener(data)),
    gestures,
    pictureInPicture,
    writeCredential: (value: DeliveryReceiptCredential) => credentialWriters.forEach((write) => write(value)),
  };
}

describe('bindShellCall — la page branchée au plugin natif', () => {
  test('un appel vivant démarre le service ; sa fin l’arrête', () => {
    const h = harness();
    h.store.setState({ call: call({ kind: 'outgoing' }) });
    h.store.setState({ call: call({ kind: 'ended', reason: 'local', detail: null }) });
    expect(h.sent.map((entry) => entry.method)).toEqual(['startCallService', 'stopCallService', 'haptic']);
  });

  test('Répondre sur la notification décroche l’appel quand il sonne dans l’app', () => {
    const h = harness();
    h.answer('call-1');
    expect(h.accepted).toEqual([]);
    h.store.setState({ call: call({ kind: 'incoming' }) });
    expect(h.accepted).toEqual([1]);
  });

  test('Répondre pour un AUTRE appel ne décroche pas celui qui sonne', () => {
    const h = harness();
    h.store.setState({ call: call({ kind: 'incoming' }) });
    h.answer('call-2');
    expect(h.accepted).toEqual([]);
  });

  test('un événement sans identifiant est ignoré', () => {
    const h = harness();
    h.store.setState({ call: call({ kind: 'incoming' }) });
    h.answer(undefined);
    expect(h.accepted).toEqual([]);
  });

  test('un appel qui quitte la sonnerie dans l’app retire la notification native', () => {
    const h = harness();
    h.store.setState({ call: call({ kind: 'incoming' }) });
    h.store.setState({ call: call({ kind: 'ended', reason: 'rejected', detail: null }) });
    expect(h.sent).toContainEqual({ method: 'dismissIncomingCall', options: { callId: 'call-1' } });
  });

  test('le credential du refus sans socket suit la session : posé au login, retiré à la déconnexion', () => {
    const h = harness();
    h.writeCredential({ apiBase: 'https://gate.meeshy.me', credential: { kind: 'registered', token: 'jwt' } });
    h.writeCredential({ apiBase: 'https://gate.meeshy.me', credential: { kind: 'anonymous', sessionToken: 's1' } });
    h.writeCredential({ apiBase: 'https://gate.meeshy.me', credential: null });
    expect(h.sent).toEqual([
      { method: 'setCredential', options: { apiBase: 'https://gate.meeshy.me', kind: 'registered', token: 'jwt' } },
      { method: 'setCredential', options: { apiBase: 'https://gate.meeshy.me', kind: 'anonymous', token: 's1' } },
      { method: 'clearCredential', options: {} },
    ]);
  });

  test('un plugin qui rejette ne casse pas l’abonnement', async () => {
    const h = harness({ failing: true });
    h.store.setState({ call: call({ kind: 'outgoing' }) });
    await Promise.resolve();
    h.store.setState({ call: null });
    expect(h.sent.map((entry) => entry.method)).toEqual(['startCallService', 'stopCallService']);
  });

  test('l’image dans l’image de la coque (#8144) arrive à la page : entrée, puis retour dans l’app', () => {
    const h = harness();
    h.float({ active: true });
    h.float({ active: false });
    expect(h.pictureInPicture).toEqual([true, false]);
  });

  test('un état d’image dans l’image illisible ne réduit pas l’écran', () => {
    const h = harness();
    h.float(null);
    h.float({ active: 'oui' });
    expect(h.pictureInPicture).toEqual([false, false]);
  });

  test('les boutons de la fenêtre flottante coupent le micro et raccrochent (#8144)', () => {
    const h = harness();
    h.press({ action: 'mic' });
    h.press({ action: 'hangup' });
    expect(h.gestures).toEqual(['mic', 'hangup']);
  });

  test('un bouton inconnu, ou reçu après le détachement, ne fait rien', () => {
    const h = harness();
    h.press({ action: 'record' });
    h.press(null);
    h.stop();
    h.press({ action: 'hangup' });
    expect(h.gestures).toEqual([]);
  });

  test('détaché, l’écran ne se réduit plus', () => {
    const h = harness();
    h.stop();
    h.float({ active: true });
    expect(h.pictureInPicture).toEqual([false]);
  });

  test('détaché, plus rien ne part vers la coque', () => {
    const h = harness();
    h.stop();
    h.store.setState({ call: call({ kind: 'outgoing' }) });
    expect(h.sent).toEqual([]);
  });
});

describe('audioRouteLabelKey — le libellé d’une sortie audio', () => {
  test('chaque sortie a sa clé de catalogue', () => {
    expect(audioRouteLabelKey('earpiece')).toBe('call.audioRoute.earpiece');
    expect(audioRouteLabelKey('speaker')).toBe('call.audioRoute.speaker');
    expect(audioRouteLabelKey('wired')).toBe('call.audioRoute.wired');
    expect(audioRouteLabelKey('bluetooth')).toBe('call.audioRoute.bluetooth');
  });
});
