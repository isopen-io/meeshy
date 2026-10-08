import { beforeAll, describe, expect, test } from 'bun:test';

import { decodeAdminMonitoring } from '@/lib/api/admin-monitoring';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { servedBackups, servedMonitoring } from './monitoring-fixtures';
import { backupStateOf, healthIssuesOf } from './monitoring-view';

/**
 * **LES SAUVEGARDES DANS LA SUPERVISION** (#9668) — la carte `backups` de
 * `GET /admin/monitoring`, décodée champ par champ, et son verdict dit en mots.
 * `null` dit « inconnu » : la carte ne se dessine pas, jamais des zéros.
 */
beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const monitoring = (overrides: Record<string, unknown> = {}) => {
  const decoded = decodeAdminMonitoring(servedMonitoring(overrides));
  if (decoded === null) throw new Error('charge illisible');
  return decoded;
};

const HEALTHY_BREAKERS = { circuitBreakers: [] };

describe('le décodage de la carte', () => {
  test('une carte servie se lit en entier', () => {
    expect(monitoring().backups).toEqual({
      status: 'ok',
      checkedAt: '2026-09-29T22:14:03Z',
      reason: null,
      lastSuccessAt: '2026-09-29T22:14:03Z',
      ageSeconds: 49_497,
      stale: false,
      nextRunAt: '2026-09-30T22:00:00.000Z',
      lastSuccess: {
        documents: 922_366,
        collections: 61,
        mismatches: 0,
        indexes: 519,
        archiveBytes: 1_288_490_189,
        durationSeconds: 412,
        volumes: [
          { name: 'meeshy_gateway_uploads', bytes: 19_327_352_832 },
          { name: 'meeshy_redis_data', bytes: 4_096 },
        ],
      },
    });
  });

  test('null quand la passerelle ne sait pas (fichier absent) — et un ancien serveur qui ne sert pas la clé', () => {
    expect(monitoring({ backups: null }).backups).toBeNull();
    const { backups: _absent, ...older } = servedMonitoring();
    expect(decodeAdminMonitoring(older)?.backups).toBeNull();
  });

  test('un statut inconnu de cette version n’est pas une carte', () => {
    expect(monitoring({ backups: servedBackups({ status: 'peut-etre' }) }).backups).toBeNull();
  });

  test('aucune réussite connue : ni âge ni contenu', () => {
    const backups = monitoring({ backups: servedBackups({ status: 'failed', lastSuccessAt: null, ageSeconds: null, stale: true, lastSuccess: null }) }).backups;
    expect(backups).toMatchObject({ lastSuccessAt: null, ageSeconds: null, stale: true, lastSuccess: null });
  });

  test('un volume sans nom est écarté, jamais affiché vide', () => {
    const lastSuccess = { ...(servedBackups().lastSuccess as Record<string, unknown>), volumes: [{ name: '', bytes: 3 }, { name: 'meeshy_gateway_sounds', bytes: 9 }] };
    expect(monitoring({ backups: servedBackups({ lastSuccess }) }).backups?.lastSuccess?.volumes).toEqual([{ name: 'meeshy_gateway_sounds', bytes: 9 }]);
  });
});

describe('le verdict, dit en mots', () => {
  test('réussie : succès', () => {
    const backups = monitoring().backups;
    expect(backups && backupStateOf(backups, 'fr')).toMatchObject({ label: 'Réussie', tone: 'success', raw: 'ok' });
  });

  test('en échec : danger, la raison servie dans l’explication', () => {
    const backups = monitoring({ backups: servedBackups({ status: 'failed', reason: 'mongodump (voir base/mongodump.log)' }) }).backups;
    const state = backups && backupStateOf(backups, 'fr');
    expect(state).toMatchObject({ label: 'En échec', tone: 'danger', raw: 'failed' });
    expect(state?.explain).toContain('mongodump (voir base/mongodump.log)');
  });

  test('vieillie : avertissement, même si le dernier verdict est un succès', () => {
    const backups = monitoring({ backups: servedBackups({ stale: true }) }).backups;
    expect(backups && backupStateOf(backups, 'en')).toMatchObject({ label: 'Too old', tone: 'warning', raw: 'stale' });
  });
});

describe('ce qui ne va pas — la sauvegarde rejoint la liste', () => {
  test('une sauvegarde saine ne dit rien', () => {
    expect(healthIssuesOf(monitoring(HEALTHY_BREAKERS), 'fr')).toEqual([]);
  });

  test('un échec est en danger', () => {
    const issues = healthIssuesOf(monitoring({ ...HEALTHY_BREAKERS, backups: servedBackups({ status: 'failed', reason: 'x' }) }), 'fr');
    expect(issues).toEqual([{ id: 'backups', tone: 'danger', text: 'La dernière sauvegarde de la production a échoué.' }]);
  });

  test('une sauvegarde de plus de 26 h est un avertissement', () => {
    const issues = healthIssuesOf(monitoring({ ...HEALTHY_BREAKERS, backups: servedBackups({ stale: true }) }), 'fr');
    expect(issues).toEqual([{ id: 'backups', tone: 'warning', text: 'Aucune sauvegarde de la production n’a réussi depuis plus de 26 heures.' }]);
  });

  test('inconnue, elle ne fabrique aucune alerte', () => {
    expect(healthIssuesOf(monitoring({ ...HEALTHY_BREAKERS, backups: null }), 'fr')).toEqual([]);
  });
});
