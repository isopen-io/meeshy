import { describe, expect, test } from 'bun:test';

import type { CallSession } from '@/lib/api/call-sessions';

import { forgetEndedCall, resumableCall } from './call-resume';
import type { ActiveCall } from './call-store';

/**
 * « REPRENDRE L'APPEL » (#3586, E7) — la bannière globale n'existe que si la
 * passerelle tient le lecteur pour membre d'un appel VIVANT que cet onglet ne
 * porte pas (rechargement, plantage, autre onglet fermé). Dès que le moteur
 * local porte un appel, c'est sa pastille qui parle, jamais la bannière.
 */

const session = (overrides: Partial<CallSession> = {}): CallSession => ({
  callId: 'call-1',
  conversationId: 'c-1',
  media: 'video',
  live: true,
  initiatorId: 'u-ada',
  answered: true,
  startedAt: '2026-09-26T09:00:00.000Z',
  durationSec: 0,
  participants: [
    { userId: 'u-ada', name: 'Ada Lovelace', avatar: 'a.jpg' },
    { userId: 'u-me', name: 'Moi', avatar: null },
  ],
  ...overrides,
});

const localCall = (phase: ActiveCall['phase']['kind']): Pick<ActiveCall, 'phase'> =>
  ({ phase: phase === 'ended' ? { kind: 'ended', reason: 'local', detail: null } : { kind: phase } }) as Pick<ActiveCall, 'phase'>;

const noIdentity = () => undefined;

describe('la bannière « Reprendre l’appel »', () => {
  test('un appel vivant côté passerelle, rien en local : on le reprend, nommé par l’autre participant', () => {
    expect(resumableCall({ active: session(), local: null, viewerId: 'u-me', identityOf: noIdentity })).toEqual({
      conversationId: 'c-1',
      callId: 'call-1',
      media: 'video',
      title: 'Ada Lovelace',
      avatar: 'a.jpg',
      isGroup: false,
    });
  });

  test('un appel terminé en local ne masque rien : la passerelle peut en tenir un autre', () => {
    expect(resumableCall({ active: session(), local: localCall('ended'), viewerId: 'u-me', identityOf: noIdentity })).not.toBeNull();
  });

  test('un appel local vivant : la pastille parle, pas la bannière', () => {
    for (const phase of ['outgoing', 'incoming', 'connecting', 'connected', 'reconnecting'] as const) {
      expect(resumableCall({ active: session(), local: localCall(phase), viewerId: 'u-me', identityOf: noIdentity })).toBeNull();
    }
  });

  test('dans le fil de la conversation de l’appel, la pastille « Rejoindre » de l’en-tête parle, pas la bannière', () => {
    expect(resumableCall({ active: session(), local: null, viewerId: 'u-me', identityOf: noIdentity, openThread: 'c-1' })).toBeNull();
    expect(resumableCall({ active: session(), local: null, viewerId: 'u-me', identityOf: noIdentity, openThread: 'c-2' })).not.toBeNull();
  });

  test('aucun appel côté passerelle : rien', () => {
    expect(resumableCall({ active: null, local: null, viewerId: 'u-me', identityOf: noIdentity })).toBeNull();
  });

  test('l’identité connue de la conversation (en-tête du fil déjà ouvert) l’emporte ; trois membres font un groupe', () => {
    const identityOf = (id: string) => (id === 'c-1' ? { title: 'Famille', avatar: 'f.jpg', isGroup: true } : undefined);
    expect(resumableCall({ active: session(), local: null, viewerId: 'u-me', identityOf })).toMatchObject({ title: 'Famille', avatar: 'f.jpg', isGroup: true });
    const trio = session({ participants: [...session().participants, { userId: 'u-bo', name: 'Bo', avatar: null }] });
    expect(resumableCall({ active: trio, local: null, viewerId: 'u-me', identityOf: noIdentity })?.isGroup).toBe(true);
  });

  test('un appel qu’on vient de raccrocher et que la passerelle croit encore vivant : pas de bannière (#8366)', () => {
    expect(resumableCall({ active: session(), local: null, viewerId: 'u-me', identityOf: noIdentity, endedCallIds: ['call-1'] })).toBeNull();
    expect(resumableCall({ active: session(), local: localCall('ended'), viewerId: 'u-me', identityOf: noIdentity, endedCallIds: ['call-1'] })).toBeNull();
  });

  test('un AUTRE appel vivant que celui qu’on vient de raccrocher : la bannière le propose (#8366)', () => {
    expect(resumableCall({ active: session({ callId: 'call-2' }), local: null, viewerId: 'u-me', identityOf: noIdentity, endedCallIds: ['call-1'] })?.callId).toBe('call-2');
  });
});

describe('oublier l’appel raccroché dans la lecture en cache (#8366)', () => {
  test('la lecture en cache porte l’appel raccroché : elle est vidée', () => {
    expect(forgetEndedCall(session(), 'call-1')).toBeNull();
  });

  test('la lecture en cache porte un autre appel, ou rien : elle est gardée', () => {
    const other = session({ callId: 'call-2' });
    expect(forgetEndedCall(other, 'call-1')).toBe(other);
    expect(forgetEndedCall(null, 'call-1')).toBeNull();
    expect(forgetEndedCall(undefined, 'call-1')).toBeUndefined();
  });
});
