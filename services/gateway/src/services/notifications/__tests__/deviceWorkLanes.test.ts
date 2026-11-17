/**
 * #18910 (audit, performance) — les envois « appareil » ne passent plus par UNE file série pour tous les comptes.
 *
 * Une révocation ou une synchronisation de pastille lente (APNs à 10 s derrière son disjoncteur) retardait la
 * lecture de TOUS les autres comptes, et la file n'avait pas de borne. Chaque compte a désormais sa file ; les
 * retraits de masse gardent la leur, ordonnée, au pic d'un envoi ; chaque file est bornée.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { DeviceWorkLanes } from '../deviceWorkLanes';

const deferred = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
};

const lanes = (maxPending = 100) => {
  const dropped: string[] = [];
  const failed: string[] = [];
  const subject = new DeviceWorkLanes({
    maxPending,
    onDrop: (lane) => dropped.push(lane),
    onError: (lane) => failed.push(lane),
  });
  return { subject, dropped, failed };
};

describe('DeviceWorkLanes — une file par compte, bornée (#18910)', () => {
  it('une étape lente d’un compte ne retarde pas la file d’un autre compte', async () => {
    const { subject } = lanes();
    const slow = deferred();
    const done: string[] = [];
    subject.enqueue('user:a', () => slow.promise.then(() => { done.push('a'); }));
    subject.enqueue('user:b', async () => { done.push('b'); });

    await new Promise((resolve) => setImmediate(resolve));

    expect(done).toEqual(['b']);
    slow.release();
    await subject.drain();
    expect(done).toEqual(['b', 'a']);
  });

  it('dans une même file, l’ordre d’enfilement est l’ordre d’exécution, une étape à la fois', async () => {
    const { subject } = lanes();
    const order: string[] = [];
    let inFlight = 0;
    let peak = 0;
    const step = (name: string) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      order.push(name);
      inFlight -= 1;
    };
    ['revoke', 'replace', 'third'].forEach((name) => subject.enqueue('bulk', step(name)));

    await subject.drain();

    expect(order).toEqual(['revoke', 'replace', 'third']);
    expect(peak).toBe(1);
  });

  it('au-delà de la borne, l’étape est abandonnée et signalée — la mémoire ne grossit pas', async () => {
    const { subject, dropped } = lanes(2);
    const gate = deferred();
    const run = jest.fn(async () => undefined);
    subject.enqueue('bulk', () => gate.promise);
    subject.enqueue('bulk', run);
    subject.enqueue('bulk', run);

    expect(dropped).toEqual(['bulk']);
    gate.release();
    await subject.drain();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('une étape qui échoue est signalée et n’arrête pas sa file', async () => {
    const { subject, failed } = lanes();
    const after = jest.fn(async () => undefined);
    subject.enqueue('user:a', async () => { throw new Error('apns down'); });
    subject.enqueue('user:a', after);

    await subject.drain();

    expect(failed).toEqual(['user:a']);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('une file vidée est oubliée : aucun compte ne reste en mémoire après son dernier envoi', async () => {
    const { subject } = lanes();
    subject.enqueue('user:a', async () => undefined);
    await subject.drain();

    expect(subject.size).toBe(0);
  });
});
