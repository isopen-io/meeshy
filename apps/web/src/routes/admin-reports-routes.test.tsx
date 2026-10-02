import { describe, expect, test } from 'bun:test';

import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { mountAdminAt } from '@/test-support/admin-router';

import { ROUTES } from './route-table';

/**
 * **LES QUATRE ADRESSES DES SIGNALEMENTS MÈNENT À LEURS ÉCRANS** (#8876, #6726)
 * — la liste et la fiche, dans les DEUX espaces (`/admin`, `/adm`, D-76) : le
 * paramètre `$report` de la fiche arrive jusqu'au panneau, et aucune des quatre
 * n'est plus l'écran d'attente.
 *
 * Le routeur est le VRAI : c'est ce qui prouve le branchement que les témoins de
 * panneau (à `deps` injecté) ne peuvent pas prouver. Le transport réel n'a nulle
 * part où aller ; on ne lit donc que ce que l'écran pose AVANT toute réponse —
 * le panneau de la liste, le squelette de la fiche.
 */

const { mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const REPORT = '64f1c2a9e8b7d6c5b4a39281';

describe('les routes des signalements', () => {
  test('les quatre clés existent, avec leurs motifs', () => {
    expect(ROUTES.adminReports.pattern).toBe('/admin/reports');
    expect(ROUTES.admReports.pattern).toBe('/adm/reports');
    expect(ROUTES.adminReport.pattern).toBe('/admin/reports/$report');
    expect(ROUTES.admReport.pattern).toBe('/adm/reports/$report');
  });

  for (const url of ['/admin/reports', '/adm/reports']) {
    test(`${url} monte la liste, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-reports]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.querySelector('[data-admin-page-title]')?.textContent).toBe('Signalements');
    });
  }

  for (const url of [`/admin/reports/${REPORT}`, `/adm/reports/${REPORT}`]) {
    test(`${url} monte la fiche, pas l’écran d’attente`, async () => {
      const host = await mountAdminAt(mounter, url, BIGBOSS, '[data-admin-report-loading], [data-admin-report-fiche], [data-admin-error], [data-admin-empty]');

      expect(host.querySelector('[data-admin-stub]')).toBeNull();
      expect(host.textContent).not.toContain('Cette section arrive');
    });
  }
});
