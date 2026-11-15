/**
 * Le journal est PROLONGÉ, jamais remplacé (`jest.requireActual` + surcharge
 * ciblée) : un double partiel d'un module perd en silence tout ce que le module
 * gagne, et le dépôt a payé ce patron trois fois. Seul `child` est surchargé,
 * pour rendre un journal qui ENREGISTRE — c'est la seule moitié que ce fichier
 * interroge.
 */
const loggedErrors: unknown[][] = [];
jest.mock('../../../utils/logger-enhanced', () => {
  const actual = jest.requireActual<Record<string, unknown>>('../../../utils/logger-enhanced');
  return {
    ...actual,
    enhancedLogger: {
      child: () => ({
        info: () => undefined,
        warn: () => undefined,
        debug: () => undefined,
        error: (...args: unknown[]) => loggedErrors.push(args),
      }),
    },
  };
});

import { DeliveryQueueCleanupJob } from '../../../jobs/delivery-queue-cleanup';
import type { RedisDeliveryQueue } from '../../../services/RedisDeliveryQueue';

function makeQueue(cleanupResult = 0, rejects = false): RedisDeliveryQueue {
  return {
    cleanup: rejects
      ? jest.fn().mockRejectedValue(new Error('cleanup failed'))
      : jest.fn().mockResolvedValue(cleanupResult),
  } as unknown as RedisDeliveryQueue;
}

describe('DeliveryQueueCleanupJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('start()', () => {
    test('runs cleanup immediately on first start', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('sets an interval that fires periodically', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();
      expect(queue.cleanup).toHaveBeenCalledTimes(3);
    });

    test('second start() call is a no-op (already-running guard)', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop()', () => {
    test('clears the interval so cleanup no longer fires', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.stop();

      jest.advanceTimersByTime(60 * 60 * 1000);
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('stop() is a no-op when the job was never started', () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      expect(() => job.stop()).not.toThrow();
      expect(queue.cleanup).not.toHaveBeenCalled();
    });

    test('stop() allows re-starting the job afterwards', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();
      job.stop();

      job.start();
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(2);
    });
  });

  describe('runNow()', () => {
    test('calls cleanup() and awaits the result', async () => {
      const queue = makeQueue(5);
      const job = new DeliveryQueueCleanupJob(queue);

      await job.runNow();

      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });

    test('works without start() having been called', async () => {
      const queue = makeQueue(0);
      const job = new DeliveryQueueCleanupJob(queue);

      await expect(job.runNow()).resolves.toBeUndefined();
      expect(queue.cleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling in run()', () => {
    test('catches errors from cleanup() and does not re-throw', async () => {
      const queue = makeQueue(0, true);
      const job = new DeliveryQueueCleanupJob(queue);

      await expect(job.runNow()).resolves.toBeUndefined();
    });

    test('interval continues firing even after a cleanup error', async () => {
      const queue = makeQueue(0, true);
      const job = new DeliveryQueueCleanupJob(queue);

      job.start();
      await Promise.resolve();

      jest.advanceTimersByTime(30 * 60 * 1000);
      await Promise.resolve();

      expect(queue.cleanup).toHaveBeenCalledTimes(2);
    });
  });
});

/**
 * #18616 — le processus SANS file.
 *
 * Le repli d'avant construisait une file dégénérée
 * (`new RedisDeliveryQueue({ getNativeClient: () => null } as any)`) pour que
 * ce job ait toujours quelque chose à appeler. Il part avec la seconde
 * instance, et la branche qui le remplace — `if (!this.deliveryQueue) return;`
 * — est une branche NEUVE, donc une affirmation à vérifier : un lot dont la
 * thèse est « une garde qu'aucun témoin ne peut faire tomber n'est pas une
 * garde » ne livre pas la sienne sans témoin.
 *
 * Ce qu'elle coûterait sans ça : l'appel vit dans un `try`, donc un
 * `TypeError` serait avalé et journalisé toutes les 30 minutes — un job mort
 * qui a l'air vivant.
 */
describe('DeliveryQueueCleanupJob — un processus sans file (#18616)', () => {
  /**
   * **Le témoin assert sur le JOURNAL, pas sur la résolution** — et la
   * première rédaction assertait la résolution, donc ne pouvait pas tomber.
   *
   * Mesuré : retirer `if (!this.deliveryQueue) return;` laisse `runNow()`
   * résoudre `undefined` quand même, parce que le `TypeError` tombe dans le
   * `catch` du job. Le seul effet OBSERVABLE de la garde absente est la ligne
   * d'erreur que ce `catch` écrit, toutes les 30 minutes, sur un job qui a
   * l'air vivant. C'est elle qu'il faut interroger.
   */
  it('ne journalise AUCUNE erreur quand il n’y a pas de file', async () => {
    loggedErrors.length = 0;

    await new DeliveryQueueCleanupJob(undefined).runNow();

    expect(loggedErrors).toEqual([]);
  });

  it('démarre et s’arrête sans file, sans toucher à son intervalle', () => {
    const job = new DeliveryQueueCleanupJob(undefined);

    expect(() => job.start()).not.toThrow();
    expect(() => job.stop()).not.toThrow();
  });
});
