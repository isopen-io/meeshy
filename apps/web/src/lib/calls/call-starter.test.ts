import { describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';

import type { StartCallRequest } from './engine';
import { startCallWithPerson } from './call-starter';

/**
 * APPELER QUELQU'UN SANS CONVERSATION CONNUE (A7, A8) — miroir de
 * `CallStarter.swift` : le direct s'ouvre (la passerelle le rend s'il existe,
 * `POST /conversations` idempotent), puis l'appel part dedans. Le contexte
 * audio s'amorce DANS le geste, avant l'aller-retour.
 */

const harness = (reply: ApiResult<{ readonly id: string }>) => {
  const order: string[] = [];
  const started: StartCallRequest[] = [];
  const opened: string[] = [];
  const deps = {
    prime: () => order.push('prime'),
    openDirect: async (participantId: string) => {
      order.push('open');
      opened.push(participantId);
      return reply;
    },
    start: (request: StartCallRequest) => {
      order.push('start');
      started.push(request);
    },
  };
  return { order, started, opened, deps };
};

const person = { id: 'u-ada', name: 'Ada Lovelace', avatar: 'a.jpg' };

describe('appeler une personne', () => {
  test('ouvre son direct puis y lance l’appel du type choisi, nommé par la personne', async () => {
    const { order, started, opened, deps } = harness({ ok: true, data: { id: 'c-ada' } });
    const outcome = await startCallWithPerson({ ...deps, person, media: 'video' });
    expect(outcome).toEqual({ ok: true, conversationId: 'c-ada' });
    expect(opened).toEqual(['u-ada']);
    expect(order).toEqual(['prime', 'open', 'start']);
    expect(started).toEqual([{ conversationId: 'c-ada', media: 'video', title: 'Ada Lovelace', avatar: 'a.jpg', isGroup: false }]);
  });

  test('un direct refusé (bloqué, hors ligne) ne lance rien et le DIT', async () => {
    const { started, deps } = harness({ ok: false, status: 403, error: 'blocked' });
    expect(await startCallWithPerson({ ...deps, person, media: 'audio' })).toEqual({ ok: false });
    expect(started).toEqual([]);
  });

  test('un transport qui jette est un refus, jamais une promesse rejetée', async () => {
    const { started, deps } = harness({ ok: true, data: { id: 'c' } });
    const outcome = await startCallWithPerson({
      ...deps,
      openDirect: async () => {
        throw new Error('réseau');
      },
      person,
      media: 'audio',
    });
    expect(outcome).toEqual({ ok: false });
    expect(started).toEqual([]);
  });
});
