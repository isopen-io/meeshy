/**
 * #8293 — un raccroché perdu dans un conflit d'écriture qui n'en était pas un.
 *
 * Au raccroché, les deux clients émettent `call:analytics` dans la même
 * milliseconde que `call:end` : l'écriture de télémétrie touche la même ligne
 * `CallParticipant` que la transaction de fin, et Mongo rend P2034. Ce P2034
 * n'annonce AUCUN rédacteur terminal concurrent — seule la relecture du statut
 * dit si quelqu'un a fini l'appel à notre place.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { commitCallEnd } from '../endCallRetry';

type Current = { readonly status: 'active' | 'ended' };
type WriteResult = 'written' | 'version-conflict';

const p2034 = () => Object.assign(new Error('write conflict'), { code: 'P2034' });
const isP2034 = (error: unknown) => (error as { code?: string } | null)?.code === 'P2034';
const noSleep = (_ms: number) => Promise.resolve();

const makeWrite = (results: ReadonlyArray<WriteResult | Error>) => {
  const queue = [...results];
  return jest.fn(async (): Promise<WriteResult> => {
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next ?? 'written';
  });
};

const makeRead = (states: ReadonlyArray<Current>) => {
  const queue = [...states];
  return jest.fn(async (): Promise<Current> => queue.shift() ?? { status: 'active' });
};

const run = (
  write: ReturnType<typeof makeWrite>,
  readCurrent: ReturnType<typeof makeRead>,
  sleep: (ms: number) => Promise<void> = noSleep
) =>
  commitCallEnd<Current>({
    write,
    readCurrent,
    isTerminal: (current) => current.status === 'ended',
    isTransientConflict: isP2034,
    sleep
  });

describe('commitCallEnd', () => {
  it('retente la fin quand un P2034 laisse l’appel encore actif à la relecture', async () => {
    const write = makeWrite([p2034(), 'written']);
    const readCurrent = makeRead([{ status: 'active' }]);

    const outcome = await run(write, readCurrent);

    expect(outcome).toEqual({ kind: 'written' });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('n’écrit rien une seconde fois quand la relecture trouve l’appel déjà terminal', async () => {
    const write = makeWrite([p2034()]);
    const readCurrent = makeRead([{ status: 'ended' }]);

    const outcome = await run(write, readCurrent);

    expect(outcome).toEqual({ kind: 'lost', current: { status: 'ended' } });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('rend la course perdue sur un conflit de version, sans retenter', async () => {
    const write = makeWrite(['version-conflict']);
    const readCurrent = makeRead([{ status: 'ended' }]);

    const outcome = await run(write, readCurrent);

    expect(outcome).toEqual({ kind: 'lost', current: { status: 'ended' } });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('borne les tentatives à trois et remonte le conflit qui persiste', async () => {
    const write = makeWrite([p2034(), p2034(), p2034(), 'written']);
    const readCurrent = makeRead([]);

    await expect(run(write, readCurrent)).rejects.toMatchObject({ code: 'P2034' });
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('attend un court délai entre deux tentatives', async () => {
    const write = makeWrite([p2034(), 'written']);
    const sleep = jest.fn(noSleep);

    await run(write, makeRead([{ status: 'active' }]), sleep);

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThan(0);
  });

  it('laisse passer une erreur qui n’est pas un conflit transitoire', async () => {
    const write = makeWrite([new Error('boom')]);
    const readCurrent = makeRead([]);

    await expect(run(write, readCurrent)).rejects.toThrow('boom');
    expect(readCurrent).not.toHaveBeenCalled();
  });
});
