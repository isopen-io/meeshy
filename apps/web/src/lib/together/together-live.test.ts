import { describe, expect, test } from 'bun:test';

import { TOGETHER_CLIENT_EVENTS, TOGETHER_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/together-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindTogetherLive, createTogetherClient, createTogetherStore, decodeTogetherEnded, decodeTogetherInvited, decodeTogetherStarted, decodeTogetherSynced } from './together-live';

/**
 * REGARDER OU ÉCOUTER ENSEMBLE, SUR CET ONGLET (#17055) — `together:invited` propose,
 * `together:started` ouvre la séance chez les deux, `together:synced` fait suivre la
 * lecture (un `rev` déjà appliqué ne rejoue rien), `together:ended` ferme ; une séance
 * close ne se rouvre pas sur un événement en retard.
 */

const ME = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const PROCHE = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const CONV = 'cccccccccccccccccccccccc';
const PIECE = 'dddddddddddddddddddddddd';
const SESSION = '0123456789abcdef0123456789abcdef';
const OTHER = 'fedcba9876543210fedcba9876543210';

const invited = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  sessionId: SESSION,
  fromUserId: PROCHE,
  conversationId: CONV,
  attachmentId: PIECE,
  media: 'video',
  expiresAt: '2026-11-08T18:02:00.000Z',
  ...overrides,
});

const wirePlayback = (overrides: Readonly<Record<string, unknown>> = {}) => ({ playing: false, positionMs: 0, at: 1_000_000, rev: 0, byUserId: PROCHE, ...overrides });

const started = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  sessionId: SESSION,
  hostUserId: PROCHE,
  guestUserId: ME,
  conversationId: CONV,
  attachmentId: PIECE,
  media: 'video',
  playback: wirePlayback(),
  ...overrides,
});

const synced = (rev: number, overrides: Readonly<Record<string, unknown>> = {}) => ({
  sessionId: SESSION,
  playback: wirePlayback({ playing: true, positionMs: 5_000, at: 1_004_000, rev }),
  ...overrides,
});

const ended = (reason: string, overrides: Readonly<Record<string, unknown>> = {}) => ({ sessionId: SESSION, reason, endedAt: '2026-11-08T18:03:00.000Z', ...overrides });

type Emitted = { readonly event: string; readonly payload: unknown };

function fakeSocket({ ack = () => ({ success: true }), connected = true }: { readonly ack?: (event: string, payload: unknown) => unknown; readonly connected?: boolean } = {}) {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const emitted: Emitted[] = [];
  const socket: SocketClient = {
    connected,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event: string, handler: (payload: never) => void) => {
      handlers.set(event, new Set([...(handlers.get(event) ?? []), handler as (payload: unknown) => void]));
    },
    off: (event: string, handler: (payload: never) => void) => {
      handlers.get(event)?.delete(handler as (payload: unknown) => void);
    },
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    },
    emitWithAck: async (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return ack(event, payload);
    },
  };
  const fire = (event: string, payload: unknown) => [...(handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  const count = () => [...handlers.values()].reduce((total, set) => total + set.size, 0);
  return { socket, fire, count, emitted };
}

const bound = (now = () => 1_000_500) => {
  const store = createTogetherStore({ now });
  const fake = fakeSocket();
  const unbind = bindTogetherLive({ socket: fake.socket, store, viewerId: () => ME });
  return { store, fake, unbind };
};

describe('les décodeurs ne laissent passer qu’une charge complète', () => {
  test('une invitation sans média lisible est ignorée', () => {
    expect(decodeTogetherInvited(invited())).toEqual(invited() as never);
    expect(decodeTogetherInvited(invited({ media: 'image' }))).toBeNull();
    expect(decodeTogetherInvited(invited({ sessionId: 3 }))).toBeNull();
  });

  test('un démarrage, une synchronisation et une fin se lisent ; une raison inconnue non', () => {
    expect(decodeTogetherStarted(started())?.playback.rev).toBe(0);
    expect(decodeTogetherStarted(started({ playback: { playing: 'oui' } }))).toBeNull();
    expect(decodeTogetherSynced(synced(2))?.playback.positionMs).toBe(5_000);
    expect(decodeTogetherEnded(ended('left'))?.reason).toBe('left');
    expect(decodeTogetherEnded(ended('cut'))).toBeNull();
  });
});

describe('la séance sur cet onglet', () => {
  test('une invitation reçue se propose ; la mienne (un autre de mes appareils) ne se propose pas', () => {
    const { store, fake } = bound();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, invited({ fromUserId: ME }));
    expect(store.getState().invitation).toBeNull();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, invited());
    expect(store.getState().invitation?.sessionId).toBe(SESSION);
  });

  test('le démarrage ouvre la séance et retire l’invitation ; l’horloge du serveur se mesure', () => {
    const { store, fake } = bound();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, invited());
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, started());
    const state = store.getState();
    expect(state.invitation).toBeNull();
    expect(state.session?.partnerId).toBe(PROCHE);
    expect(state.session?.playback.rev).toBe(0);
    expect(state.clockOffsetMs).toBe(-500);
  });

  test('une séance où je ne suis ni hôte ni invité ne s’ouvre pas', () => {
    const { store, fake } = bound();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, started({ guestUserId: 'eeeeeeeeeeeeeeeeeeeeeeee' }));
    expect(store.getState().session).toBeNull();
  });

  test('une synchronisation fait suivre la lecture ; un rev déjà appliqué ou une autre séance ne rejouent rien', () => {
    const { store, fake } = bound();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, started());
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_SYNCED, synced(2));
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_SYNCED, synced(1, { playback: wirePlayback({ rev: 1, positionMs: 1 }) }));
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_SYNCED, synced(9, { sessionId: OTHER }));
    expect(store.getState().session?.playback).toMatchObject({ rev: 2, positionMs: 5_000, playing: true });
  });

  test('la fin ferme la séance ; un démarrage en retard de la même séance ne la rouvre pas', () => {
    const { store, fake } = bound();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, started());
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_ENDED, ended('left'));
    expect(store.getState().session).toBeNull();
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_STARTED, started());
    fake.fire(TOGETHER_SERVER_EVENTS.TOGETHER_INVITED, invited());
    expect(store.getState().session).toBeNull();
    expect(store.getState().invitation).toBeNull();
  });

  test('l’invitation non acceptée s’éteint à son terme, comptée à l’horloge de l’onglet depuis la réception', () => {
    let now = 1_000_000;
    const store = createTogetherStore({ now: () => now });
    store.getState().invited(decodeTogetherInvited(invited())!);
    expect(store.getState().msUntilInvitationExpiry()).toBe(120_000);
    now += 120_001;
    store.getState().expireInvitation();
    expect(store.getState().invitation).toBeNull();
  });

  test('se délier retire chaque écoute', () => {
    const { fake, unbind } = bound();
    expect(fake.count()).toBe(4);
    unbind();
    expect(fake.count()).toBe(0);
  });
});

describe('les gestes envoyés', () => {
  const client = (ack: (event: string, payload: unknown) => unknown, connected = true) => {
    const store = createTogetherStore({ now: () => 1_000_500 });
    const fake = fakeSocket({ ack, connected });
    return { store, fake, together: createTogetherClient({ socket: () => fake.socket, store }) };
  };

  test('inviter met la séance en attente de réponse', async () => {
    const { store, fake, together } = client(() => ({ success: true, data: { sessionId: SESSION, expiresAt: '2026-11-08T18:02:00.000Z', media: 'audio' } }));
    expect(await together.invite({ toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE })).toBe('invited');
    expect(fake.emitted[0]).toEqual({ event: TOGETHER_CLIENT_EVENTS.TOGETHER_INVITE, payload: { toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE } });
    expect(store.getState().outgoing).toEqual({ sessionId: SESSION, toUserId: PROCHE, media: 'audio' });
  });

  test('les refus se disent par leur issue, jamais par la raison du serveur', async () => {
    const refused = (code: string) => client(() => ({ success: false, error: 'x', code })).together;
    expect(await refused('TOGETHER_NOT_ALLOWED').invite({ toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE })).toBe('not-allowed');
    expect(await refused('TOGETHER_RATE_LIMITED').invite({ toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE })).toBe('rate-limited');
    expect(await refused('TOGETHER_UNAVAILABLE').invite({ toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE })).toBe('failed');
    expect(await client(() => ({}), false).together.invite({ toUserId: PROCHE, conversationId: CONV, attachmentId: PIECE })).toBe('offline');
  });

  test('rejoindre ouvre la séance depuis l’accusé, sans attendre l’événement', async () => {
    const { store, together } = client(() => ({ success: true, data: started() }));
    store.getState().invited(decodeTogetherInvited(invited())!);
    expect(await together.join(SESSION)).toBe('joined');
    expect(store.getState().session?.sessionId).toBe(SESSION);
    expect(store.getState().invitation).toBeNull();
  });

  test('rejoindre une séance finie retire l’invitation ; une panne la garde pour réessayer', async () => {
    const gone = client(() => ({ success: false, error: 'x', code: 'TOGETHER_NOT_FOUND' }));
    gone.store.getState().invited(decodeTogetherInvited(invited())!);
    expect(await gone.together.join(SESSION)).toBe('gone');
    expect(gone.store.getState().invitation).toBeNull();
    const busy = client(() => ({ success: false, error: 'x', code: 'TOGETHER_UNAVAILABLE' }));
    busy.store.getState().invited(decodeTogetherInvited(invited())!);
    expect(await busy.together.join(SESSION)).toBe('failed');
    expect(busy.store.getState().invitation?.sessionId).toBe(SESSION);
  });

  test('refuser retire l’invitation tout de suite et quitte la séance', async () => {
    const { store, fake, together } = client(() => ({ success: true }));
    store.getState().invited(decodeTogetherInvited(invited())!);
    together.decline(SESSION);
    expect(store.getState().invitation).toBeNull();
    expect(fake.emitted).toEqual([{ event: TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, payload: { sessionId: SESSION } }]);
  });

  test('une synchronisation part avec la position arrondie et l’accusé l’applique', async () => {
    const { store, fake, together } = client(() => ({ success: true, data: { playback: wirePlayback({ playing: true, positionMs: 4_200, at: 1_000_900, rev: 3, byUserId: ME }) } }));
    store.getState().started(decodeTogetherStarted(started())!, ME);
    await together.sync({ playing: true, positionMs: 4_199.6 });
    expect(fake.emitted[0]).toEqual({ event: TOGETHER_CLIENT_EVENTS.TOGETHER_SYNC, payload: { sessionId: SESSION, playing: true, positionMs: 4_200 } });
    expect(store.getState().session?.playback.rev).toBe(3);
  });

  test('quitter ferme la séance ici sur-le-champ', () => {
    const { store, fake, together } = client(() => ({ success: true }));
    store.getState().started(decodeTogetherStarted(started())!, ME);
    together.leave();
    expect(store.getState().session).toBeNull();
    expect(fake.emitted).toEqual([{ event: TOGETHER_CLIENT_EVENTS.TOGETHER_LEAVE, payload: { sessionId: SESSION } }]);
  });
});
