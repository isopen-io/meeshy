/**
 * LE JOB DES ÉTAPES FRANCHIES APP FERMÉE (#10175, L19 — § 5.16.4) : LIVRÉ ÉTEINT. Il ne fait rien tant que
 * `GAME_PHOTO_PUSH` ne vaut pas exactement `on` (variable d'environnement de la passerelle, relue à chaque
 * passage : l'allumer ou l'éteindre ne demande aucun redéploiement de code). Allumé, il évalue les comptes
 * marqués « à évaluer » par les écritures du jeu (chacun une fois), puis pousse ce qui est dû. Chaque étape est
 * isolée : un compte qui échoue ne retient ni les autres, ni l'envoi.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { GamePhotoMomentsJob } from '../../../jobs/game-photo-moments';
import { isGamePhotoPushOn } from '../../../services/game/photoPushFlag';
import { memoryPhotoMomentMarks, redisPhotoMomentMarks } from '../../../services/game/PhotoMomentMarks';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

const NOW = new Date('2026-10-14T12:00:00Z');

const world = (on: boolean) => {
  const marks = memoryPhotoMomentMarks();
  const service = {
    detect: jest.fn(async (userId: string) => (userId === 'boom' ? Promise.reject(new Error('boom')) : { kind: 'baseline' as const })),
    deliver: jest.fn(async (_now: Date) => ({ sent: 1, deferred: 0 })),
  };
  const job = new GamePhotoMomentsJob({} as never, { service, marks, enabled: () => on });
  return { job, marks, service };
};

describe('l’interrupteur GAME_PHOTO_PUSH', () => {
  it('éteint par défaut ; seule la valeur exacte « on » l’allume', () => {
    expect(isGamePhotoPushOn({})).toBe(false);
    expect(isGamePhotoPushOn({ GAME_PHOTO_PUSH: 'off' })).toBe(false);
    expect(isGamePhotoPushOn({ GAME_PHOTO_PUSH: 'true' })).toBe(false);
    expect(isGamePhotoPushOn({ GAME_PHOTO_PUSH: 'ON ' })).toBe(false);
    expect(isGamePhotoPushOn({ GAME_PHOTO_PUSH: 'on' })).toBe(true);
  });

  it('éteint, le job ne lit rien, n’évalue rien et ne pousse rien', async () => {
    const { job, marks, service } = world(false);
    await marks.mark('u1');

    expect(await job.runNow(NOW)).toEqual({ off: true });
    expect(service.detect).not.toHaveBeenCalled();
    expect(service.deliver).not.toHaveBeenCalled();
  });
});

describe('allumé', () => {
  it('évalue chaque compte marqué UNE fois, puis pousse ce qui est dû', async () => {
    const { job, marks, service } = world(true);
    await marks.mark('u1');
    await marks.mark('u2');
    await marks.mark('u1');

    expect(await job.runNow(NOW)).toEqual({ evaluated: 2, sent: 1, deferred: 0 });
    expect(service.detect.mock.calls.map((call) => call[0]).sort()).toEqual(['u1', 'u2']);
    expect(service.deliver).toHaveBeenCalledWith(NOW);

    expect(await job.runNow(NOW)).toEqual({ evaluated: 0, sent: 1, deferred: 0 });
  });

  it('un compte qui échoue ne retient ni les autres ni l’envoi', async () => {
    const { job, marks, service } = world(true);
    await marks.mark('boom');
    await marks.mark('u2');

    expect(await job.runNow(NOW)).toEqual({ evaluated: 1, sent: 1, deferred: 0 });
    expect(service.deliver).toHaveBeenCalled();
  });
});

describe('les marques « à évaluer »', () => {
  it('un compte marqué deux fois sort une fois ; un lot borné laisse le reste au passage suivant', async () => {
    const marks = memoryPhotoMomentMarks();
    for (const id of ['a', 'b', 'c', 'a']) await marks.mark(id);

    const first = await marks.drain(2);
    const second = await marks.drain(2);

    expect(first).toHaveLength(2);
    expect([...first, ...second].sort()).toEqual(['a', 'b', 'c']);
    expect(await marks.drain(2)).toEqual([]);
  });

  it('sur Redis : un ensemble (SADD), vidé par SPOP borné — jamais KEYS', async () => {
    const set = new Set<string>();
    const redis = {
      sadd: jest.fn(async (_key: string, member: string) => (set.has(member) ? 0 : (set.add(member), 1))),
      spop: jest.fn(async (_key: string, count: number) => {
        const out = [...set].slice(0, count);
        for (const member of out) set.delete(member);
        return out;
      }),
    };
    const marks = redisPhotoMomentMarks(() => redis as never);
    await marks.mark('a');
    await marks.mark('a');

    expect(await marks.drain(10)).toEqual(['a']);
    expect(redis.sadd).toHaveBeenCalledWith('game:photo:to-evaluate', 'a');
    expect(redis.spop).toHaveBeenCalledWith('game:photo:to-evaluate', 10);
  });
});
