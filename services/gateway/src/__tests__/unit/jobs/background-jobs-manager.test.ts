// Mock all heavy dependencies so the BackgroundJobsManager constructor
// doesn't try to connect to Redis, Prisma, or external services.
jest.mock('../../../jobs/cleanup-expired-tokens', () => ({
  CleanupExpiredTokens: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/unlock-accounts', () => ({
  UnlockAccountsJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/notification-digest', () => ({
  NotificationDigestJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/delivery-queue-cleanup', () => ({
  DeliveryQueueCleanupJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/mutation-log-cleanup', () => ({
  MutationLogCleanupJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../jobs/ban-expiry-sweep', () => ({
  BanExpirySweepJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    runNow: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock('../../../services/MagicLinkService', () => ({
  MagicLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn().mockReturnValue({}),
}));

/**
 * `cleanGeoCache` est ici parce que `startAll()` l'ORDONNANCE depuis #9239 :
 * ce double ne portait que le constructeur, et son absence faisait tomber
 * cinq cas sur `cleanGeoCache is not a function` — un double partiel d'un
 * module ne dit pas que l'appelant a tort, il dit que le double a vieilli.
 * Il rend 0 pour que la trace de l'ordonnanceur reste muette ici.
 */
jest.mock('../../../services/GeoIPService', () => ({
  GeoIPService: jest.fn().mockImplementation(() => ({})),
  cleanGeoCache: jest.fn(() => 0),
  // #9609 — `startAll()` charge la base géoIP locale au démarrage.
  warmGeoIpDatabase: jest.fn(() => Promise.resolve('loaded')),
}));

jest.mock('../../../services/RedisDeliveryQueue', () => ({
  RedisDeliveryQueue: jest.fn().mockImplementation(() => ({
    cleanup: jest.fn().mockResolvedValue(0),
  })),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { BackgroundJobsManager } from '../../../jobs/index';
import { cleanGeoCache } from '../../../services/GeoIPService';

function makePrisma() {
  return {} as any;
}

function makeEmailService() {
  return {} as any;
}

describe('BackgroundJobsManager', () => {
  let manager: BackgroundJobsManager;

  beforeEach(() => {
    manager = new BackgroundJobsManager(makePrisma(), makeEmailService());
  });

  // ─── isJobsRunning() ─────────────────────────────────────────────────────

  it('reports jobs as not running before startAll()', () => {
    expect(manager.isJobsRunning()).toBe(false);
  });

  it('reports jobs as running after startAll()', () => {
    manager.startAll();
    expect(manager.isJobsRunning()).toBe(true);
    manager.stopAll();
  });

  // ─── startAll() ──────────────────────────────────────────────────────────

  describe('startAll()', () => {
    it('starts all jobs and sets isRunning to true', () => {
      manager.startAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.start).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.start).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.start).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.start).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.start).toHaveBeenCalledTimes(1);
      expect(jobs.banExpirySweep.start).toHaveBeenCalledTimes(1);

      expect(manager.isJobsRunning()).toBe(true);
      manager.stopAll();
    });

    it('second startAll() call is a no-op (already-running guard)', () => {
      manager.startAll();
      manager.startAll(); // should warn, not start again

      const jobs = manager.getJobs();
      // Each job.start() should have been called exactly once
      expect(jobs.cleanupTokens.start).toHaveBeenCalledTimes(1);
      manager.stopAll();
    });

    /**
     * #9239 — l'ordonnancement de la purge du cache GeoIP est mesuré ICI, chez
     * son hôte, et pas seulement par la garde de source qui vérifie que
     * `cleanGeoCache()` a un appelant. Une garde de source dit qu'un appel
     * EXISTE dans l'arbre ; ce cas-ci dit qu'il est bien SUR le chemin de
     * `startAll()`, et il tombe si quelqu'un le déplace dans une branche
     * jamais prise.
     */
    /**
     * #9474 — la purge est un travail d'ENTRETIEN best-effort, et son rappel
     * est SYNCHRONE : un `throw` dedans n'a aucun `try/catch` englobant à
     * invoquer, parce que la pile d'un rappel de `setInterval` part de la
     * boucle d'événements et non de `startAll()`. Il devient une exception
     * non interceptée, et termine le processus — toute la passerelle tombée
     * pour une table de cache qui n'a pas pu se vider.
     *
     * Les deux voisins de cette méthode étaient déjà gardés (le balayage des
     * sessions par un `.catch`, les six jobs à classe chez eux) ; celui-ci ne
     * l'était pas. Les deux cas qui suivent sont calqués sur ceux que portait
     * `claude/brave-archimedes-ce1g42`, dont c'était la seule part que `dev`
     * n'avait pas reprise.
     */
    it('une levée de la purge GeoIP ne remonte pas — startAll() aboutit', () => {
      jest.mocked(cleanGeoCache).mockImplementationOnce(() => {
        throw new Error('geo purge boom');
      });

      expect(() => manager.startAll()).not.toThrow();
      expect(manager.isJobsRunning()).toBe(true);
      manager.stopAll();
    });

    it('le battement suivant a lieu APRÈS une levée — l’intervalle n’est pas perdu', () => {
      jest.useFakeTimers();
      try {
        jest.mocked(cleanGeoCache).mockClear();
        jest.mocked(cleanGeoCache).mockImplementationOnce(() => {
          throw new Error('geo purge boom');
        });

        manager.startAll();
        expect(cleanGeoCache).toHaveBeenCalledTimes(1);

        jest.advanceTimersByTime(10 * 60 * 1000);

        /* Le deuxième appel est la MESURE : un rappel qui lève sans garde
           n'arrive jamais là — le processus serait déjà tombé. */
        expect(cleanGeoCache).toHaveBeenCalledTimes(2);
        manager.stopAll();
      } finally {
        jest.useRealTimers();
      }
    });

    it('startAll() purge le cache GeoIP tout de suite, sans attendre le premier intervalle', () => {
      /* Le compteur se remet à zéro ICI, pas dans un `beforeEach` : trois cas
         de ce bloc appellent déjà `startAll()`, donc une assertion sur le
         compteur ABSOLU mesurerait l'état que ses voisins lui laissent, et
         rougirait au premier cas inséré avant elle. */
      jest.mocked(cleanGeoCache).mockClear();
      manager.startAll();
      expect(cleanGeoCache).toHaveBeenCalledTimes(1);
      manager.stopAll();
    });
  });

  // ─── stopAll() ───────────────────────────────────────────────────────────

  describe('stopAll()', () => {
    it('stops all jobs and sets isRunning to false', () => {
      manager.startAll();
      manager.stopAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.stop).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.stop).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.stop).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.stop).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.stop).toHaveBeenCalledTimes(1);
      expect(jobs.banExpirySweep.stop).toHaveBeenCalledTimes(1);

      expect(manager.isJobsRunning()).toBe(false);
    });

    it('second stopAll() call is a no-op (not-running guard)', () => {
      manager.startAll();
      manager.stopAll();
      manager.stopAll(); // should warn, not stop again

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.stop).toHaveBeenCalledTimes(1);
    });

    it('stopAll() is a no-op when jobs were never started', () => {
      expect(() => manager.stopAll()).not.toThrow();
      expect(manager.isJobsRunning()).toBe(false);
    });
  });

  // ─── runAll() ────────────────────────────────────────────────────────────

  describe('runAll()', () => {
    it('calls runNow() on all jobs', async () => {
      await manager.runAll();

      const jobs = manager.getJobs();
      expect(jobs.cleanupTokens.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.unlockAccounts.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.notificationDigest.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.deliveryQueueCleanup.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.mutationLogCleanup.runNow).toHaveBeenCalledTimes(1);
      expect(jobs.banExpirySweep.runNow).toHaveBeenCalledTimes(1);
    });

    it('does not require startAll() to be called first', async () => {
      await expect(manager.runAll()).resolves.toBeUndefined();
    });
  });

  // ─── getJobs() ───────────────────────────────────────────────────────────

  describe('getJobs()', () => {
    it('returns all six job instances', () => {
      const jobs = manager.getJobs();
      expect(jobs).toHaveProperty('cleanupTokens');
      expect(jobs).toHaveProperty('unlockAccounts');
      expect(jobs).toHaveProperty('notificationDigest');
      expect(jobs).toHaveProperty('deliveryQueueCleanup');
      expect(jobs).toHaveProperty('mutationLogCleanup');
      expect(jobs).toHaveProperty('banExpirySweep');
    });
  });

  it('arme le contrôle de la sauvegarde nocturne quand BACKUP_STATUS_ALERTS_ENABLED=true, et le désarme à l’arrêt (#9668)', () => {
    const previous = process.env.BACKUP_STATUS_ALERTS_ENABLED;
    process.env.BACKUP_STATUS_ALERTS_ENABLED = 'true';
    try {
      const mgr = new BackgroundJobsManager(makePrisma(), makeEmailService());
      mgr.startAll();
      expect(mgr.getJobs().backupStatusCheck.isArmed()).toBe(true);
      mgr.stopAll();
      expect(mgr.getJobs().backupStatusCheck.isArmed()).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.BACKUP_STATUS_ALERTS_ENABLED;
      else process.env.BACKUP_STATUS_ALERTS_ENABLED = previous;
    }
  });

  // ─── custom deliveryQueue parameter ──────────────────────────────────────

  it('accepts an optional deliveryQueue parameter', () => {
    const customQueue = { cleanup: jest.fn().mockResolvedValue(0) } as any;
    const mgr = new BackgroundJobsManager(makePrisma(), makeEmailService(), customQueue);
    expect(mgr.isJobsRunning()).toBe(false);
  });
});
