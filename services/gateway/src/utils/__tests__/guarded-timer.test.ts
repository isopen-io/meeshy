/**
 * La minuterie GARDÉE (#9480) — un rappel qui lève ne termine pas le processus.
 *
 * La pile d'un rappel de `setInterval` / `setTimeout` part de la boucle
 * d'événements, pas du site qui l'a armé : aucun `try/catch` englobant n'existe
 * à invoquer. Une levée synchrone y devient une exception non interceptée, un
 * rejet y devient un rejet non géré — et les deux terminent la passerelle.
 *
 * Chaque cas mesure ce qui compte : le battement SUIVANT a lieu, et l'erreur
 * est DITE au journal du service, sous le nom du canal.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

import { guardedInterval, guardedTimeout } from '../guarded-timer';

const makeLogger = () => ({
  error: jest.fn<(message: string, error?: unknown, context?: Record<string, unknown>) => void>(),
});

const reported = (logger: ReturnType<typeof makeLogger>) => {
  const [message, error, context] = logger.error.mock.calls[0];
  return { message, error: error instanceof Error ? error.message : error, context };
};

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  jest.useRealTimers();
});

describe('guardedInterval', () => {
  it('le battement suivant a lieu après une levée SYNCHRONE, et la levée est journalisée sous le nom du canal', () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    const run = jest
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error('boom');
      })
      .mockImplementation(() => undefined);

    const handle = guardedInterval({ name: 'cache-purge', run, everyMs: 1_000, logger });

    expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
    jest.advanceTimersByTime(1_000);

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reported(logger)).toEqual({
      message: '[timer:cache-purge] callback failed: boom',
      error: 'boom',
      context: { timer: 'cache-purge' },
    });
    clearInterval(handle);
  });

  it('un rejet d’un rappel ASYNCHRONE est attrapé et journalisé, et l’intervalle continue', async () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    const run = jest
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => Promise.reject(new Error('async boom')))
      .mockImplementation(() => Promise.resolve());

    const handle = guardedInterval({ name: 'sweep', run, everyMs: 500, logger });

    jest.advanceTimersByTime(500);
    await flushMicrotasks();
    jest.advanceTimersByTime(500);
    await flushMicrotasks();

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reported(logger)).toEqual({
      message: expect.stringContaining('sweep'),
      error: 'async boom',
      context: { timer: 'sweep' },
    });
    clearInterval(handle);
  });

  it('un rappel qui réussit ne journalise rien', async () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    const handle = guardedInterval({ name: 'quiet', run: () => undefined, everyMs: 10, logger });

    jest.advanceTimersByTime(30);
    await flushMicrotasks();

    expect(logger.error).not.toHaveBeenCalled();
    clearInterval(handle);
  });

  it('rend une poignée que clearInterval arrête', () => {
    jest.useFakeTimers();
    const run = jest.fn<() => void>();
    const handle = guardedInterval({ name: 'stoppable', run, everyMs: 10, logger: makeLogger() });

    jest.advanceTimersByTime(10);
    clearInterval(handle);
    jest.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('une levée qui n’est pas une Error est journalisée telle quelle, sans planter le journal', () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    const handle = guardedInterval({
      name: 'odd',
      run: () => {
        throw 'plain string';
      },
      everyMs: 10,
      logger,
    });

    jest.advanceTimersByTime(10);

    expect(reported(logger)).toEqual({
      message: expect.stringContaining('odd'),
      error: 'plain string',
      context: { timer: 'odd' },
    });
    clearInterval(handle);
  });
});

describe('guardedTimeout', () => {
  it('une levée SYNCHRONE est attrapée et journalisée — rien ne remonte de la boucle', () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    guardedTimeout({
      name: 'invite-expiry',
      run: () => {
        throw new Error('late boom');
      },
      afterMs: 1_000,
      logger,
    });

    expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reported(logger)).toEqual({
      message: expect.stringContaining('invite-expiry'),
      error: 'late boom',
      context: { timer: 'invite-expiry' },
    });
  });

  it('un rejet asynchrone est attrapé et journalisé', async () => {
    jest.useFakeTimers();
    const logger = makeLogger();
    guardedTimeout({
      name: 'grace',
      run: async () => {
        throw new Error('async late boom');
      },
      afterMs: 50,
      logger,
    });

    jest.advanceTimersByTime(50);
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reported(logger)).toEqual({
      message: expect.stringContaining('grace'),
      error: 'async late boom',
      context: { timer: 'grace' },
    });
  });

  it('rend une poignée que clearTimeout annule', () => {
    jest.useFakeTimers();
    const run = jest.fn<() => void>();
    const handle = guardedTimeout({ name: 'cancelled', run, afterMs: 10, logger: makeLogger() });

    clearTimeout(handle);
    jest.advanceTimersByTime(100);

    expect(run).not.toHaveBeenCalled();
  });

  it('la poignée se laisse détacher de la boucle (unref) comme une minuterie brute', () => {
    const handle = guardedTimeout({ name: 'unref', run: () => undefined, afterMs: 10, logger: makeLogger() });
    expect(handle.unref()).toBe(handle);
    clearTimeout(handle);
  });
});
