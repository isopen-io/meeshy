import { describe, expect, test } from 'bun:test';

import { AdminSectionScreen } from '@/components/admin/section-screen';
import { servedBackups, servedMonitoring } from '@/lib/admin/monitoring-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminMonitoringPanel } from './admin-monitoring';

/**
 * **LES SAUVEGARDES, RENDUES** (#9668) — le bloc de la supervision : l'état en mot,
 * l'âge de la dernière réussite, la prochaine échéance, le contenu (documents,
 * archive, volumes) ; un échec dit sa raison et rejoint la liste de ce qui ne va
 * pas ; sans verdict lu, aucun bloc.
 */

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const NOW = new Date('2026-09-30T12:00:00.000Z');
const CLOSED = [{ name: 'translator-zmq', state: 'CLOSED', failures: 0, successes: 4_120, totalRequests: 4_120, lastFailureAt: null }];

function depsServing(overrides: Record<string, unknown>): AdminDeps {
  const transport = {
    request: async (): Promise<ApiResult<unknown>> => ({ ok: true, status: 200, data: servedMonitoring({ circuitBreakers: CLOSED, ...overrides }) }),
  } as unknown as HttpTransport;
  return { source: 'gateway', transport };
}

async function open(overrides: Record<string, unknown> = {}) {
  const deps = depsServing(overrides);
  const screen = async () => ({
    default: () => (
      <AdminSectionScreen section="monitoring" language="fr" title="Supervision">
        {() => <AdminMonitoringPanel language="fr" deps={deps} now={() => NOW} />}
      </AdminSectionScreen>
    ),
  });
  const { Router } = createRouter({ adminMonitoring: { pattern: '/admin/monitoring', screen } }, () => <p>absent</p>);
  navigate('/admin/monitoring', true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-monitoring-health]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const normalized = (text: string | null | undefined) => (text ?? '').replace(/[  ]/g, ' ');
const section = (host: ParentNode) => host.querySelector('[data-admin-monitoring-section="backups"]');
const stat = (host: ParentNode, anchor: string) => normalized(host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent);

describe('le bloc des sauvegardes', () => {
  test('une nuit réussie : « Réussie », l’âge, la prochaine échéance et le contenu, en mots', async () => {
    const host = await open();

    expect(section(host)?.querySelector('h2')?.textContent).toBe('Sauvegardes');
    expect(host.querySelector('[data-admin-backups]')?.getAttribute('data-admin-backups-state')).toBe('ok');
    expect(normalized(section(host)?.textContent)).toContain('Réussie');
    expect(stat(host, 'backups-last')).toContain('il y a 13 heures');
    expect(stat(host, 'backups-next')).toContain('dans 10 heures');
    expect(stat(host, 'backups-documents')).toContain('922 366');
    expect(stat(host, 'backups-documents')).toContain('61 collections · 519 index · 0 écart(s)');
    expect(stat(host, 'backups-archive')).toContain('Go');
    expect(stat(host, 'backups-archive')).toContain('6 min 52 s');
    expect(normalized(host.querySelector('[data-admin-backup-volume="meeshy_gateway_uploads"]')?.textContent)).toContain('Go');
    expect(host.querySelector('[data-admin-backup-volume="meeshy_redis_data"]')).not.toBeNull();
    expect(host.textContent).not.toContain('1288490189');
    expect(host.querySelector('[data-admin-health-issues]')?.textContent).toContain('Tous les services répondent normalement.');
  });

  test('un échec : « En échec » avec sa raison, et une alerte en danger en tête', async () => {
    const host = await open({ backups: servedBackups({ status: 'failed', reason: 'mongodump (voir base/mongodump.log)', checkedAt: '2026-09-30T22:01:00Z' }) });

    expect(host.querySelector('[data-admin-backups]')?.getAttribute('data-admin-backups-state')).toBe('failed');
    expect(normalized(section(host)?.textContent)).toContain('En échec');
    expect(host.querySelector('[data-admin-backups-explain]')?.textContent).toBe('Raison : mongodump (voir base/mongodump.log)');
    expect(host.querySelector('[data-admin-notice="danger"]')?.textContent).toContain('La dernière sauvegarde de la production a échoué.');
  });

  test('une raison piégée se lit comme du texte, jamais comme du HTML', async () => {
    const host = await open({ backups: servedBackups({ status: 'failed', reason: '<img src=x onerror=alert(1)>' }) });

    expect(section(host)?.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-admin-backups-explain]')?.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  test('trop ancienne : avertissement, même sur un dernier verdict réussi', async () => {
    const host = await open({ backups: servedBackups({ stale: true }) });

    expect(host.querySelector('[data-admin-backups]')?.getAttribute('data-admin-backups-state')).toBe('stale');
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('depuis plus de 26 heures');
  });

  test('aucune réussite connue : « Aucune », sans carte de contenu ni volumes', async () => {
    const host = await open({ backups: servedBackups({ status: 'failed', reason: 'espace libre 3 Go < 40 Go', lastSuccessAt: null, ageSeconds: null, stale: true, lastSuccess: null }) });

    expect(stat(host, 'backups-last')).toContain('Aucune');
    expect(host.querySelector('[data-admin-stat="backups-documents"]')).toBeNull();
    expect(host.querySelector('[data-admin-backup-volumes]')).toBeNull();
  });

  test('sans verdict lu (null), le bloc n’est pas dessiné et rien n’est inventé', async () => {
    const host = await open({ backups: null });

    expect(host.querySelector('[data-admin-monitoring-health]')).not.toBeNull();
    expect(section(host)).toBeNull();
    expect(host.querySelector('[data-admin-health-issues]')?.textContent).not.toContain('sauvegarde');
  });
});
