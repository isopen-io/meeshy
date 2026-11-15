/**
 * Le job du contrôle de la sauvegarde nocturne (#9668) — QUAND il tourne, et
 * ce qu'il BRANCHE.
 *
 *  - une fois par jour à 5 h, heure de Paris : jamais au démarrage, jamais
 *    toutes les heures, réarmé sur le lendemain après chaque contrôle ;
 *  - désactivé, il ne s'arme pas ;
 *  - les destinataires sont lus en base (rôles BIGBOSS et ADMIN, comptes
 *    actifs, non supprimés), dans leur langue de cadrage ;
 *  - la notification est une notification SYSTÈME (type existant) ; l'e-mail
 *    part au seul BIGBOSS.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({ info: jest.fn<any>(), warn: jest.fn<any>(), error: jest.fn<any>(), debug: jest.fn<any>() }),
  },
}));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));

import { BackupStatusCheckJob, nextBackupCheckAt } from '../../../jobs/backup-status-check';
import type { BackupAlertStore } from '../../../services/admin/backup-alert';

const memoryStore = (): BackupAlertStore => {
  const map = new Map<string, string>();
  return {
    setnx: async (key, value) => (map.has(key) ? false : (map.set(key, value), true)),
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    del: async (key) => void map.delete(key),
  };
};

const USERS = [
  { id: 'boss', role: 'BIGBOSS', email: 'sama@meeshy.me', username: 'meeshy', displayName: 'Meeshy Sama', deletedAt: null, systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
  { id: 'admin', role: 'ADMIN', email: 'admin@meeshy.me', username: 'admin', displayName: null, deletedAt: null, systemLanguage: null, regionalLanguage: 'en', customDestinationLanguage: null, deviceLocale: null },
  { id: 'gone', role: 'ADMIN', email: 'gone@meeshy.me', username: 'gone', displayName: null, deletedAt: new Date('2026-01-01'), systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
];

const build = (env: Record<string, string>, readVerdict?: () => Promise<null>) => {
  const findMany = jest.fn<any>(async () => USERS);
  const createSystemNotification = jest.fn<any>(async () => ({ id: 'n' }));
  const sendBackupAlertEmail = jest.fn<any>(async () => ({ success: true }));
  const store = memoryStore();
  const job = new BackupStatusCheckJob({
    prisma: { user: { findMany } } as any,
    emailService: { sendBackupAlertEmail },
    env,
    store: () => store,
    notifier: () => ({ createSystemNotification }),
    ...(readVerdict ? { readVerdict } : {}),
  });
  return { job, findMany, createSystemNotification, sendBackupAlertEmail };
};

const ENABLED = { BACKUP_STATUS_ALERTS_ENABLED: 'true', BACKUP_STATUS_FILE: '/nonexistent/backup-status/etat.json' };

afterEach(() => {
  jest.useRealTimers();
});

describe('quand le contrôle a lieu', () => {
  it('5 h de Paris : 03:00 UTC l’été, 04:00 UTC l’hiver', () => {
    expect(nextBackupCheckAt(new Date('2026-10-08T12:00:00Z')).toISOString()).toBe('2026-10-09T03:00:00.000Z');
    expect(nextBackupCheckAt(new Date('2026-11-08T12:00:00Z')).toISOString()).toBe('2026-11-09T04:00:00.000Z');
  });

  it('désactivé, le job ne s’arme pas', () => {
    const { job } = build({});
    job.start();
    expect(job.isArmed()).toBe(false);
    job.stop();
  });

  it('une fois par jour à 5 h — ni au démarrage, ni toutes les heures', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    const readVerdict = jest.fn(async () => null);
    const { job } = build(ENABLED, readVerdict);
    job.start();
    expect(job.isArmed()).toBe(true);

    await jest.advanceTimersByTimeAsync(14 * 60 * 60 * 1000);
    expect(readVerdict).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(readVerdict).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(23 * 60 * 60 * 1000);
    expect(readVerdict).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(readVerdict).toHaveBeenCalledTimes(2);
    job.stop();
  });

  it('arrêté, il ne se réarme pas', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    const readVerdict = jest.fn(async () => null);
    const { job } = build(ENABLED, readVerdict);
    job.start();
    job.stop();
    await jest.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(readVerdict).not.toHaveBeenCalled();
    expect(job.isArmed()).toBe(false);
  });
});

describe('l’arrêt pendant un contrôle', () => {
  it('un job arrêté pendant qu’il contrôle ne se réarme pas à la fin du contrôle', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-08T12:00:00Z') });
    let release: (value: null) => void = () => undefined;
    const readVerdict = jest.fn(() => new Promise<null>((resolve) => { release = resolve; }));
    const { job } = build(ENABLED, readVerdict);
    job.start();
    await jest.advanceTimersByTimeAsync(15 * 60 * 60 * 1000);
    expect(readVerdict).toHaveBeenCalledTimes(1);

    job.stop();
    release(null);
    await jest.advanceTimersByTimeAsync(72 * 60 * 60 * 1000);
    expect(readVerdict).toHaveBeenCalledTimes(1);
    expect(job.isArmed()).toBe(false);
  });
});

describe('ce qu’il branche', () => {
  it('lit les ADMIN et BIGBOSS actifs avec les colonnes de leur langue', async () => {
    const { job, findMany } = build(ENABLED);
    await job.runNow();
    const query = findMany.mock.calls[0][0] as { where: Record<string, unknown>; select: Record<string, boolean> };

    expect(query.where).toEqual({ role: { in: ['BIGBOSS', 'ADMIN'] }, isActive: true });
    expect(query.select).toMatchObject({ id: true, role: true, email: true, deletedAt: true, systemLanguage: true, regionalLanguage: true, customDestinationLanguage: true, deviceLocale: true });
  });

  it('un verdict absent notifie les comptes vivants en notification système, dans leur langue, et écrit au BIGBOSS', async () => {
    const { job, createSystemNotification, sendBackupAlertEmail } = build(ENABLED);
    const report = await job.runNow();

    expect(report).toMatchObject({ outcome: 'alerted', kind: 'missing', notified: 2, emailed: 1 });
    const notified = createSystemNotification.mock.calls.map(([params]) => params as Record<string, unknown>);
    expect(notified.map((params) => params.recipientUserId).sort()).toEqual(['admin', 'boss']);
    expect(notified.find((params) => params.recipientUserId === 'boss')).toMatchObject({
      title: 'Sauvegarde de la production : aucun verdict',
      systemType: 'security',
      priority: 'urgent',
      lang: 'fr',
    });
    expect(notified.find((params) => params.recipientUserId === 'admin')).toMatchObject({ title: 'Production backup: no verdict', lang: 'en' });

    expect(sendBackupAlertEmail).toHaveBeenCalledTimes(1);
    expect(sendBackupAlertEmail.mock.calls[0][0]).toMatchObject({ to: 'sama@meeshy.me', name: 'Meeshy Sama', language: 'fr', message: { kind: 'missing' } });
  });

  it('le même incident, relu, ne repart pas', async () => {
    const { job, sendBackupAlertEmail } = build(ENABLED);
    await job.runNow();
    expect(await job.runNow()).toEqual({ outcome: 'duplicate', incidentKey: 'missing' });
    expect(sendBackupAlertEmail).toHaveBeenCalledTimes(1);
  });
});
