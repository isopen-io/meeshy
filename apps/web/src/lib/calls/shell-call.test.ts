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
  captionsOn: false,
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
  const env: ShellCallEnvironment = {
    native: (method, payload) => {
      sent.push({ method, options: payload });
      return options.failing === true ? Promise.reject(new Error('natif')) : Promise.resolve({});
    },
    listen: (event, listener) => {
      if (event === 'callAnswer') events.push(listener);
    },
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
