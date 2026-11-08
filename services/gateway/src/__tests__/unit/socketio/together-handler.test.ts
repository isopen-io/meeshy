/**
 * #17012 — la porte socket de la séance « ensemble » : un invité de lien n'a pas de
 * cercle, le débit est borné par compte, chaque événement atteint son relais avec
 * l'identité de la socket (jamais une identité de la charge), et une panne ferme.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import { TOGETHER_ERROR_CODES } from '@meeshy/shared/types/together';
import { listenTogether, type TogetherHandlerDeps } from '../../../socketio/handlers/TogetherHandler';

const MOI = '507f1f77bcf86cd799439011';

type Listener = (...args: unknown[]) => void;

function socketAvec(deps: Partial<TogetherHandlerDeps> & { caller?: { userId: string; isAnonymous: boolean } | null }) {
  const listeners = new Map<string, Listener>();
  const socket = { id: 's1', on: (event: string, listener: Listener) => listeners.set(event, listener) };
  const calls: Array<[string, string, unknown]> = [];
  const gone: string[] = [];
  const relayed = (name: string) => async (userId: string, data: unknown) => {
    calls.push([name, userId, data]);
    return { success: true } as never;
  };
  listenTogether(socket, {
    callerOf: () => (deps.caller === undefined ? { userId: MOI, isAnonymous: false } : deps.caller),
    withinRate: deps.withinRate ?? (async () => true),
    invite: deps.invite ?? relayed('invite'),
    join: deps.join ?? relayed('join'),
    sync: deps.sync ?? relayed('sync'),
    leave: deps.leave ?? relayed('leave'),
    userGone: deps.userGone ?? (async (userId) => void gone.push(userId)),
  });
  const emit = (event: string, data: unknown) =>
    new Promise<unknown>((resolve) => listeners.get(event)!(data, resolve));
  const disconnect = () => listeners.get('disconnect')!();
  return { emit, calls, gone, disconnect };
}

describe('la porte socket de « ensemble »', () => {
  it('#17043 — un limiteur qui ne répond pas (null) ferme : TOGETHER_RATE_LIMITED, aucun relais atteint ; quitter reste libre', async () => {
    const s = socketAvec({ withinRate: async () => null });
    for (const event of [CLIENT_EVENTS.TOGETHER_INVITE, CLIENT_EVENTS.TOGETHER_JOIN, CLIENT_EVENTS.TOGETHER_SYNC]) {
      expect(await s.emit(event, {})).toMatchObject({ success: false, code: TOGETHER_ERROR_CODES.RATE_LIMITED });
    }
    expect(s.calls).toEqual([]);
    expect(await s.emit(CLIENT_EVENTS.TOGETHER_LEAVE, {})).toEqual({ success: true });
  });

  it('#17043 — la fermeture d\'une socket de compte inscrit prévient le relais, pas celle d\'un invité', async () => {
    const inscrit = socketAvec({});
    inscrit.disconnect();
    await Promise.resolve();
    expect(inscrit.gone).toEqual([MOI]);
    const invite = socketAvec({ caller: { userId: MOI, isAnonymous: true } });
    invite.disconnect();
    expect(invite.gone).toEqual([]);
  });

  it.each([
    [CLIENT_EVENTS.TOGETHER_INVITE, 'invite'],
    [CLIENT_EVENTS.TOGETHER_JOIN, 'join'],
    [CLIENT_EVENTS.TOGETHER_SYNC, 'sync'],
    [CLIENT_EVENTS.TOGETHER_LEAVE, 'leave'],
  ])('%s atteint son relais avec l\'identité de la socket', async (event, name) => {
    const s = socketAvec({});
    expect(await s.emit(event, { sessionId: 'x', userId: 'usurpé' })).toEqual({ success: true });
    expect(s.calls).toEqual([[name, MOI, { sessionId: 'x', userId: 'usurpé' }]]);
  });

  it('un invité de lien ou une socket inconnue est refusé sans toucher le relais', async () => {
    const anonyme = socketAvec({ caller: { userId: MOI, isAnonymous: true } });
    const inconnue = socketAvec({ caller: null });
    expect(await anonyme.emit(CLIENT_EVENTS.TOGETHER_INVITE, {})).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_ALLOWED });
    expect(await inconnue.emit(CLIENT_EVENTS.TOGETHER_SYNC, {})).toMatchObject({ code: TOGETHER_ERROR_CODES.NOT_ALLOWED });
    expect([...anonyme.calls, ...inconnue.calls]).toEqual([]);
  });

  it('au-delà du débit, rien n\'atteint le relais ; quitter passe toujours', async () => {
    const s = socketAvec({ withinRate: async () => false });
    expect(await s.emit(CLIENT_EVENTS.TOGETHER_SYNC, {})).toMatchObject({ code: TOGETHER_ERROR_CODES.RATE_LIMITED });
    expect(await s.emit(CLIENT_EVENTS.TOGETHER_LEAVE, { sessionId: 'x' })).toEqual({ success: true });
    expect(s.calls.map(([name]) => name)).toEqual(['leave']);
  });

  it('une panne du relais ferme', async () => {
    const s = socketAvec({ sync: async () => Promise.reject(new Error('redis down')) });
    expect(await s.emit(CLIENT_EVENTS.TOGETHER_SYNC, {})).toMatchObject({ code: TOGETHER_ERROR_CODES.UNAVAILABLE });
  });
});
