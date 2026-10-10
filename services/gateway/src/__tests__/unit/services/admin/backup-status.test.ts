/**
 * Le verdict de la sauvegarde nocturne, LU par la passerelle (#9668).
 *
 * `etat.json` est écrit par un script d'hôte et monté en lecture seule : c'est
 * une FRONTIÈRE DE CONFIANCE. Ces témoins gardent :
 *  - la LECTURE : un fichier absent, illisible, trop gros, mal formé ou hors
 *    schéma vaut `null` (« inconnu ») — jamais une exception, jamais un faux vert ;
 *  - la CARTE : l'âge de la dernière sauvegarde réussie et la prochaine
 *    échéance (minuit, heure de Paris, changements d'heure compris) ;
 *  - la RÈGLE D'ALERTE : échec, sauvegarde vieillie de plus de 26 h, fichier
 *    absent — chacun avec sa clé d'incident, qui fait le dédoublonnage.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  backupAlertOf,
  backupCardOf,
  backupStatusFile,
  nextParisTime,
  parseBackupVerdict,
  readBackupVerdict,
} from '../../../../services/admin/backup-status';

const verdict = (overrides: Record<string, unknown> = {}) => ({
  generatedAt: '2026-10-08T22:14:03Z',
  status: 'ok',
  reason: null,
  lastSuccessAt: '2026-10-08T22:14:03Z',
  lastSuccess: {
    documents: 922_366,
    collections: 61,
    mismatches: 0,
    indexes: 519,
    archiveBytes: 1_234_567_890,
    durationSeconds: 412,
    volumes: [
      { name: 'meeshy_gateway_uploads', bytes: 19_000_000_000 },
      { name: 'meeshy_redis_data', bytes: 4_096 },
    ],
  },
  ...overrides,
});

const withFile = async <T>(content: string | null, run: (file: string) => Promise<T>): Promise<T> => {
  const dir = mkdtempSync(path.join(tmpdir(), 'backup-status-'));
  const file = path.join(dir, 'etat.json');
  if (content !== null) writeFileSync(file, content);
  try {
    return await run(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

describe('lecture du verdict (frontière de confiance)', () => {
  it('rend le verdict validé quand le fichier est conforme', async () => {
    const read = await withFile(JSON.stringify(verdict()), readBackupVerdict);
    expect(read).toEqual(verdict());
  });

  it('rend null quand le fichier est absent', async () => {
    expect(await withFile(null, readBackupVerdict)).toBeNull();
  });

  it('rend null quand le fichier n’est pas du JSON', async () => {
    expect(await withFile('OK 20261008T2200Z collections=61', readBackupVerdict)).toBeNull();
  });

  it('rend null quand le statut n’est ni ok ni failed', () => {
    expect(parseBackupVerdict(verdict({ status: 'echec' }))).toBeNull();
  });

  it('rend null quand une date n’est pas une date', () => {
    expect(parseBackupVerdict(verdict({ generatedAt: 'hier soir' }))).toBeNull();
  });

  it('rend null quand un compte est négatif ou fractionnaire', () => {
    expect(parseBackupVerdict(verdict({ lastSuccess: { ...verdict().lastSuccess, documents: -1 } }))).toBeNull();
    expect(parseBackupVerdict(verdict({ lastSuccess: { ...verdict().lastSuccess, indexes: 1.5 } }))).toBeNull();
  });

  it('refuse un nom de volume qui porte un chemin', () => {
    const volumes = [{ name: '/var/lib/docker/volumes/x/_data', bytes: 1 }];
    expect(parseBackupVerdict(verdict({ lastSuccess: { ...verdict().lastSuccess, volumes } }))).toBeNull();
  });

  it('ne laisse passer AUCUNE clé que le schéma ne déclare pas', () => {
    const parsed = parseBackupVerdict({ ...verdict(), host: '/opt/meeshy/production', secret: 'x' });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed ?? {})).not.toContain('host');
    expect(Object.keys(parsed ?? {})).not.toContain('secret');
  });

  it('borne la raison d’un échec', () => {
    expect(parseBackupVerdict(verdict({ status: 'failed', reason: 'x'.repeat(2_000) }))).toBeNull();
  });

  it('rend null quand le fichier dépasse la taille raisonnable d’un verdict', async () => {
    const big = JSON.stringify({ ...verdict(), padding: ' '.repeat(200_000) });
    expect(await withFile(big, readBackupVerdict)).toBeNull();
  });

  it('lit le chemin depuis BACKUP_STATUS_FILE, avec un défaut monté', () => {
    expect(backupStatusFile({ BACKUP_STATUS_FILE: '/x/etat.json' })).toBe('/x/etat.json');
    expect(backupStatusFile({})).toBe('/backup-status/etat.json');
  });
});

describe('la prochaine échéance, heure de Paris', () => {
  it('minuit de Paris en heure d’été est 22:00 UTC', () => {
    expect(nextParisTime(new Date('2026-10-08T12:00:00Z'), 0).toISOString()).toBe('2026-10-08T22:00:00.000Z');
  });

  it('minuit de Paris en heure d’hiver est 23:00 UTC', () => {
    expect(nextParisTime(new Date('2026-11-08T12:00:00Z'), 0).toISOString()).toBe('2026-11-08T23:00:00.000Z');
  });

  it('5 h de Paris tient le passage à l’heure d’hiver (25 octobre 2026)', () => {
    expect(nextParisTime(new Date('2026-10-24T04:00:00Z'), 5).toISOString()).toBe('2026-10-25T04:00:00.000Z');
  });

  it('5 h de Paris tient le passage à l’heure d’été (29 mars 2026)', () => {
    expect(nextParisTime(new Date('2026-03-28T05:00:00Z'), 5).toISOString()).toBe('2026-03-29T03:00:00.000Z');
  });

  it('est STRICTEMENT après l’instant donné', () => {
    expect(nextParisTime(new Date('2026-10-08T03:00:00Z'), 5).toISOString()).toBe('2026-10-09T03:00:00.000Z');
  });
});

describe('la carte de supervision', () => {
  const now = new Date('2026-10-09T03:00:00Z');

  it('vaut null quand le verdict est inconnu', () => {
    expect(backupCardOf(null, now)).toBeNull();
  });

  it('dit l’âge, la prochaine échéance et le contenu de la dernière sauvegarde réussie', () => {
    expect(backupCardOf(parseBackupVerdict(verdict()), now)).toEqual({
      status: 'ok',
      checkedAt: '2026-10-08T22:14:03Z',
      reason: null,
      lastSuccessAt: '2026-10-08T22:14:03Z',
      ageSeconds: 17_157,
      stale: false,
      nextRunAt: '2026-10-09T22:00:00.000Z',
      lastSuccess: verdict().lastSuccess,
    });
  });

  it('se dit vieillie au-delà de 26 h', () => {
    const card = backupCardOf(parseBackupVerdict(verdict()), new Date('2026-10-10T00:14:04Z'));
    expect(card?.stale).toBe(true);
  });

  it('garde la dernière réussite à côté d’un échec', () => {
    const card = backupCardOf(parseBackupVerdict(verdict({ status: 'failed', reason: 'mongodump', generatedAt: '2026-10-08T22:01:00Z' })), now);
    expect(card).toMatchObject({ status: 'failed', reason: 'mongodump', lastSuccessAt: '2026-10-08T22:14:03Z' });
  });

  it('n’a ni âge ni contenu quand aucune sauvegarde n’a jamais réussi', () => {
    const card = backupCardOf(
      parseBackupVerdict(verdict({ status: 'failed', reason: 'espace libre', lastSuccessAt: null, lastSuccess: null })),
      now,
    );
    expect(card).toMatchObject({ lastSuccessAt: null, ageSeconds: null, stale: true, lastSuccess: null });
  });
});

describe('la règle d’alerte', () => {
  const now = new Date('2026-10-09T03:00:00Z');

  it('ne dit rien quand la dernière sauvegarde a réussi il y a moins de 26 h', () => {
    expect(backupAlertOf(parseBackupVerdict(verdict()), now)).toEqual({ kind: 'healthy' });
  });

  it('alerte sur un échec, clé dérivée du generatedAt du verdict', () => {
    const alert = backupAlertOf(parseBackupVerdict(verdict({ status: 'failed', reason: 'mongodump', generatedAt: '2026-10-08T22:01:00Z' })), now);
    expect(alert).toEqual({
      kind: 'failed',
      incidentKey: 'failed:2026-10-08T22:01:00Z',
      reason: 'mongodump',
      lastSuccessAt: '2026-10-08T22:14:03Z',
    });
  });

  it('alerte sur une sauvegarde vieillie, clé dérivée du lastSuccessAt', () => {
    const alert = backupAlertOf(parseBackupVerdict(verdict()), new Date('2026-10-10T00:14:04Z'));
    expect(alert).toEqual({ kind: 'stale', incidentKey: 'stale:2026-10-08T22:14:03Z', reason: null, lastSuccessAt: '2026-10-08T22:14:03Z' });
  });

  it('à 26 h pile, la sauvegarde n’est pas encore vieillie', () => {
    expect(backupAlertOf(parseBackupVerdict(verdict()), new Date('2026-10-10T00:14:03Z'))).toEqual({ kind: 'healthy' });
  });

  it('alerte quand le verdict est absent : la sauvegarde n’a jamais publié', () => {
    expect(backupAlertOf(null, now)).toEqual({ kind: 'missing', incidentKey: 'missing', reason: null, lastSuccessAt: null });
  });
});
