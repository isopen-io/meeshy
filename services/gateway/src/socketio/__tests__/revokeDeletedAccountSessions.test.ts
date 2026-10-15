/**
 * #10264 — quand un compte est SUPPRIMÉ (fin de grâce ou purge immédiate), ses
 * sockets vivants reçoivent l'événement de toujours (`auth:session-revoked`,
 * motif `logout_all_devices` : rien ne change pour un ancien client) et, en
 * plus, `deletedAccountId` — l'identifiant du compte supprimé, pour que
 * l'appareil purge les données de CE compte et d'aucun autre. Une révocation
 * qui ne vient pas d'une suppression ne le porte jamais.
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { disconnectRevokedSessions } from '../disconnectRevokedSessions';
import { revokeDeletedAccountSessions } from '../revokeDeletedAccountSessions';

type Emitted = { event: string; payload: Record<string, unknown> };

const ioWith = (sink: Emitted[], closed: boolean[]) => ({
  in: (_room: string) => ({
    fetchSockets: async () => [
      {
        emit: (event: string, payload: Record<string, unknown>) => {
          sink.push({ event, payload });
        },
        disconnect: (close?: boolean) => {
          closed.push(close === true);
        },
      },
    ],
  }),
});

describe('revokeDeletedAccountSessions', () => {
  it('ferme les sockets du compte et nomme le compte supprimé sur l’événement existant', async () => {
    const emitted: Emitted[] = [];
    const closed: boolean[] = [];

    const count = await revokeDeletedAccountSessions({ io: ioWith(emitted, closed) as never, userId: 'user-deleted' });

    expect(count).toBe(1);
    expect(closed).toEqual([true]);
    expect(emitted).toEqual([
      {
        event: SERVER_EVENTS.AUTH_SESSION_REVOKED,
        payload: expect.objectContaining({ code: 'session_revoked', reason: 'logout_all_devices', deletedAccountId: 'user-deleted' }),
      },
    ]);
  });

  it('une révocation ordinaire ne nomme aucun compte supprimé', async () => {
    const emitted: Emitted[] = [];

    await disconnectRevokedSessions({ io: ioWith(emitted, []) as never, userId: 'user-1', reason: 'logout_all_devices' });

    expect(emitted[0].payload).not.toHaveProperty('deletedAccountId');
  });
});
