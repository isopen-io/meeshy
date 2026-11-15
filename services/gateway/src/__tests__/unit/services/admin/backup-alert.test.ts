/**
 * Le contrôle quotidien de la sauvegarde nocturne (#9668) — qui est prévenu,
 * combien de fois, et quand le retour au vert se dit.
 *
 * Ces témoins gardent :
 *  - l'INTERRUPTEUR : sans `BACKUP_STATUS_ALERTS_ENABLED=true`, rien n'est lu,
 *    rien ne part (en dev et en local, le fichier n'existe pas) ;
 *  - les DESTINATAIRES : une notification à chaque ADMIN et BIGBOSS, un e-mail
 *    au seul compte BIGBOSS ;
 *  - le DÉDOUBLONNAGE : un incident, un envoi — même sur deux instances qui
 *    contrôlent à la même seconde (`SET NX` partagé) ;
 *  - le RÉTABLISSEMENT : un succès qui suit un incident SIGNALÉ se dit une fois.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import {
  runBackupStatusCheck,
  type BackupAlertDeps,
  type BackupAlertRecipient,
  type BackupAlertStore,
} from '../../../../services/admin/backup-alert';
import { parseBackupVerdict, type BackupVerdict } from '../../../../services/admin/backup-status';

const NOW = new Date('2026-10-09T03:00:00Z');

const okVerdict = (lastSuccessAt = '2026-10-08T22:14:03Z'): BackupVerdict =>
  parseBackupVerdict({
    generatedAt: lastSuccessAt,
    status: 'ok',
    reason: null,
    lastSuccessAt,
    lastSuccess: { documents: 10, collections: 2, mismatches: 0, indexes: 4, archiveBytes: 100, durationSeconds: 30, volumes: [] },
  }) as BackupVerdict;

const failedVerdict = (generatedAt = '2026-10-08T22:01:00Z'): BackupVerdict =>
  parseBackupVerdict({ ...okVerdict('2026-10-07T22:10:00Z'), generatedAt, status: 'failed', reason: 'mongodump (voir base/mongodump.log)' }) as BackupVerdict;

const memoryStore = (): BackupAlertStore & { readonly keys: () => string[] } => {
  const map = new Map<string, string>();
  return {
    setnx: async (key, value) => {
      if (map.has(key)) return false;
      map.set(key, value);
      return true;
    },
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => {
      map.set(key, value);
    },
    del: async (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
};

const RECIPIENTS: readonly BackupAlertRecipient[] = [
  { id: 'boss', role: 'BIGBOSS', email: 'sama@meeshy.me', name: 'Meeshy Sama', language: 'fr' },
  { id: 'admin-1', role: 'ADMIN', email: 'admin1@meeshy.me', name: 'Admin Un', language: 'en' },
  { id: 'admin-2', role: 'ADMIN', email: null, name: 'Admin Deux', language: 'es' },
];

type Harness = {
  readonly deps: BackupAlertDeps;
  readonly notify: jest.Mock<BackupAlertDeps['notify']>;
  readonly email: jest.Mock<BackupAlertDeps['email']>;
  readonly readVerdict: jest.Mock<BackupAlertDeps['readVerdict']>;
};

const harness = (options: {
  readonly verdict: BackupVerdict | null;
  readonly store?: BackupAlertStore;
  readonly enabled?: boolean;
  readonly now?: Date;
}): Harness => {
  const notify = jest.fn<BackupAlertDeps['notify']>(async () => true);
  const email = jest.fn<BackupAlertDeps['email']>(async () => true);
  const readVerdict = jest.fn<BackupAlertDeps['readVerdict']>(async () => options.verdict);
  return {
    notify,
    email,
    readVerdict,
    deps: {
      enabled: options.enabled ?? true,
      now: () => options.now ?? NOW,
      readVerdict,
      store: options.store ?? memoryStore(),
      recipients: async () => RECIPIENTS,
      notify,
      email,
    },
  };
};

describe('l’interrupteur BACKUP_STATUS_ALERTS_ENABLED', () => {
  it('désactivé, ne lit rien et n’envoie rien — même sur un échec', async () => {
    const h = harness({ verdict: failedVerdict(), enabled: false });
    expect(await runBackupStatusCheck(h.deps)).toEqual({ outcome: 'disabled' });
    expect(h.readVerdict).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
  });
});

describe('une sauvegarde saine', () => {
  it('ne prévient personne', async () => {
    const h = harness({ verdict: okVerdict() });
    expect(await runBackupStatusCheck(h.deps)).toEqual({ outcome: 'healthy' });
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.email).not.toHaveBeenCalled();
  });
});

describe('un incident', () => {
  it('un échec notifie chaque ADMIN et BIGBOSS, et écrit au seul BIGBOSS', async () => {
    const h = harness({ verdict: failedVerdict() });
    const report = await runBackupStatusCheck(h.deps);

    expect(report).toEqual({ outcome: 'alerted', kind: 'failed', incidentKey: 'failed:2026-10-08T22:01:00Z', notified: 3, emailed: 1 });
    expect(h.notify.mock.calls.map(([recipient]) => recipient.id).sort()).toEqual(['admin-1', 'admin-2', 'boss']);
    expect(h.email.mock.calls.map(([recipient]) => recipient.id)).toEqual(['boss']);
    expect(h.email.mock.calls[0][1]).toMatchObject({ kind: 'failed', reason: 'mongodump (voir base/mongodump.log)', lastSuccessAt: '2026-10-07T22:10:00Z' });
  });

  it('une sauvegarde de plus de 26 h alerte sous la clé de sa dernière réussite', async () => {
    const h = harness({ verdict: okVerdict('2026-10-07T22:14:03Z'), now: new Date('2026-10-09T03:00:00Z') });
    expect(await runBackupStatusCheck(h.deps)).toMatchObject({ outcome: 'alerted', kind: 'stale', incidentKey: 'stale:2026-10-07T22:14:03Z' });
  });

  it('un verdict absent alerte : la sauvegarde n’a jamais publié', async () => {
    const h = harness({ verdict: null });
    expect(await runBackupStatusCheck(h.deps)).toMatchObject({ outcome: 'alerted', kind: 'missing', incidentKey: 'missing' });
    expect(h.email).toHaveBeenCalledTimes(1);
  });

  it('le même incident, contrôlé le lendemain, ne repart pas', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: failedVerdict(), store }).deps);
    const again = harness({ verdict: failedVerdict(), store, now: new Date('2026-10-10T03:00:00Z') });

    expect(await runBackupStatusCheck(again.deps)).toEqual({ outcome: 'duplicate', incidentKey: 'failed:2026-10-08T22:01:00Z' });
    expect(again.notify).not.toHaveBeenCalled();
    expect(again.email).not.toHaveBeenCalled();
  });

  it('un NOUVEL échec, la nuit suivante, est un nouvel incident', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: failedVerdict(), store }).deps);
    const next = harness({ verdict: failedVerdict('2026-10-09T22:01:00Z'), store, now: new Date('2026-10-10T03:00:00Z') });

    expect(await runBackupStatusCheck(next.deps)).toMatchObject({ outcome: 'alerted', incidentKey: 'failed:2026-10-09T22:01:00Z' });
  });

  it('deux instances qui contrôlent ensemble n’envoient qu’une fois', async () => {
    const store = memoryStore();
    const first = harness({ verdict: failedVerdict(), store });
    const second = harness({ verdict: failedVerdict(), store });
    await Promise.all([runBackupStatusCheck(first.deps), runBackupStatusCheck(second.deps)]);

    expect(first.email.mock.calls.length + second.email.mock.calls.length).toBe(1);
    expect(first.notify.mock.calls.length + second.notify.mock.calls.length).toBe(3);
  });

  it('un destinataire qui échoue n’empêche pas les autres d’être prévenus', async () => {
    const h = harness({ verdict: failedVerdict() });
    h.notify.mockImplementation(async (recipient) => {
      if (recipient.id === 'admin-1') throw new Error('push down');
      return true;
    });
    expect(await runBackupStatusCheck(h.deps)).toMatchObject({ outcome: 'alerted', notified: 2, emailed: 1 });
  });
});

describe('le retour au vert', () => {
  it('un succès qui suit un incident signalé se dit une fois, à tous', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: failedVerdict(), store }).deps);
    const back = harness({ verdict: okVerdict('2026-10-09T22:12:00Z'), store, now: new Date('2026-10-10T03:00:00Z') });

    expect(await runBackupStatusCheck(back.deps)).toEqual({ outcome: 'recovered', incidentKey: 'failed:2026-10-08T22:01:00Z', notified: 3, emailed: 1 });
    expect(back.email.mock.calls[0][1]).toMatchObject({ kind: 'recovered', lastSuccessAt: '2026-10-09T22:12:00Z' });

    const after = harness({ verdict: okVerdict('2026-10-10T22:12:00Z'), store, now: new Date('2026-10-11T03:00:00Z') });
    expect(await runBackupStatusCheck(after.deps)).toEqual({ outcome: 'healthy' });
    expect(after.notify).not.toHaveBeenCalled();
  });

  it('un succès sans incident signalé ne dit rien', async () => {
    const h = harness({ verdict: okVerdict() });
    await runBackupStatusCheck(h.deps);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('deux instances ne disent le rétablissement qu’une fois', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: failedVerdict(), store }).deps);
    const first = harness({ verdict: okVerdict('2026-10-09T22:12:00Z'), store, now: new Date('2026-10-10T03:00:00Z') });
    const second = harness({ verdict: okVerdict('2026-10-09T22:12:00Z'), store, now: new Date('2026-10-10T03:00:00Z') });
    await Promise.all([runBackupStatusCheck(first.deps), runBackupStatusCheck(second.deps)]);

    expect(first.email.mock.calls.length + second.email.mock.calls.length).toBe(1);
  });

  it('après un rétablissement, un verdict de nouveau absent est un nouvel incident', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: null, store }).deps);
    await runBackupStatusCheck(harness({ verdict: okVerdict(), store }).deps);
    const again = harness({ verdict: null, store, now: new Date('2026-10-12T03:00:00Z') });

    expect(await runBackupStatusCheck(again.deps)).toMatchObject({ outcome: 'alerted', kind: 'missing' });
  });

  it('un incident qui en remplace un autre libère sa clé : le premier peut revenir après le vert', async () => {
    const store = memoryStore();
    await runBackupStatusCheck(harness({ verdict: null, store }).deps);
    await runBackupStatusCheck(harness({ verdict: failedVerdict(), store }).deps);
    await runBackupStatusCheck(harness({ verdict: okVerdict(), store }).deps);
    const again = harness({ verdict: null, store, now: new Date('2026-10-12T03:00:00Z') });

    expect(await runBackupStatusCheck(again.deps)).toMatchObject({ outcome: 'alerted', kind: 'missing' });
  });
});
