import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminRecentMember, AdminRecentReport } from '@/lib/api/admin-overview-queue';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import { broadcastRows, recentMemberRows, recentReportRows, reportedEntityName } from './dashboard-rows';

/**
 * **LES LIGNES DES LISTES DU TABLEAU DE BORD** (#8876, § 4) — ce qu'un
 * signalement désigne, où en est une diffusion, qui vient de s'inscrire : des
 * NOMS, des états en mots, du relatif — jamais un identifiant ni un code brut.
 */

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const NOW = new Date('2026-09-30T12:00:00.000Z');
const ID = '64f1c2a9e8b7d6c5b4a39281';
const flat = (text: string): string => text.replace(/[  ]/g, ' ');

const awa = { displayName: 'Awa Diop', username: 'awa', firstName: null, lastName: null };

const report = (extra: Partial<AdminRecentReport>): AdminRecentReport => ({
  id: ID,
  reportType: 'harassment',
  status: 'pending',
  createdAt: '2026-09-30T11:57:00.000Z',
  entity: { kind: 'message', label: null, owner: awa, deleted: false },
  ...extra,
});

describe('reportedEntityName — ce qui est signalé, nommé', () => {
  test('un message se dit « Message de {auteur} »', () => {
    expect(reportedEntityName({ kind: 'message', label: null, owner: awa, deleted: false }, 'fr')).toBe('Message de Awa Diop');
    expect(reportedEntityName({ kind: 'post', label: null, owner: awa, deleted: false }, 'fr')).toBe('Publication de Awa Diop');
    expect(reportedEntityName({ kind: 'message', label: null, owner: awa, deleted: false }, 'en')).toBe('Message by Awa Diop');
  });

  test('un membre, une conversation, une communauté se disent par leur propre nom', () => {
    expect(reportedEntityName({ kind: 'conversation', label: 'Famille', owner: null, deleted: false }, 'fr')).toBe('Famille');
  });

  test('sans nom ni propriétaire, le genre seul ; sans entité, « Non renseigné » — jamais un identifiant', () => {
    expect(reportedEntityName({ kind: 'comment', label: null, owner: null, deleted: true }, 'fr')).toBe('Commentaire');
    expect(reportedEntityName(null, 'fr')).toBe('Non renseigné');
  });

  test('un propriétaire sans nom se dit « @pseudo » ou « Compte sans nom »', () => {
    expect(reportedEntityName({ kind: 'message', label: null, owner: { displayName: null, username: 'jean', firstName: null, lastName: null }, deleted: false }, 'fr')).toBe('Message de @jean');
  });
});

describe('recentReportRows', () => {
  test('le motif et le moment en mots, le statut interprété', () => {
    const [row] = recentReportRows([report({})], NOW, 'fr');
    expect(row?.name).toBe('Message de Awa Diop');
    expect(row?.secondary).toBe('Harcèlement · il y a 3 minutes');
    expect(row?.status).toMatchObject({ label: 'En attente', tone: 'warning' });
  });

  test('une entité qui porte son propre nom voit son genre rappelé en secondaire', () => {
    const [row] = recentReportRows([report({ entity: { kind: 'user', label: 'Jean Dupont', owner: null, deleted: false } })], NOW, 'fr');
    expect(row?.name).toBe('Jean Dupont');
    expect(row?.secondary).toBe('Membre · Harcèlement · il y a 3 minutes');
  });

  test('une entité supprimée le dit, le signalement reste lisible', () => {
    const [row] = recentReportRows([report({ entity: { kind: 'message', label: null, owner: awa, deleted: true } })], NOW, 'fr');
    expect(row?.secondary).toBe('Harcèlement · il y a 3 minutes · supprimé');
  });

  test('un motif ou un statut inconnu se dit « Non reconnu », jamais son code', () => {
    const [row] = recentReportRows([report({ reportType: 'mystère', status: 'limbo' })], NOW, 'fr');
    expect(row?.secondary).toContain('Non reconnu');
    expect(row?.status.label).toBe('Non reconnu');
  });

  test('aucune ligne ne porte d’identifiant ni d’horodatage brut', () => {
    const [row] = recentReportRows([report({})], NOW, 'fr');
    const painted = `${row?.name} ${row?.secondary} ${row?.status.label}`;
    expect(painted).not.toMatch(/\b[0-9a-f]{24}\b/);
    expect(painted).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe('broadcastRows — la progression des diffusions en cours', () => {
  const sending = { id: ID, name: 'Nouveautés', subject: 'Du nouveau', totalRecipients: 200, sentCount: 50, failedCount: 2 };

  test('nom, objet, pourcentage, progression en mots, échecs', () => {
    const { rows, more } = broadcastRows({ rows: [sending], total: 1 }, 'fr');
    expect(rows[0]).toEqual({ id: ID, name: 'Nouveautés', subject: 'Du nouveau', percent: 25, progress: '50 sur 200 envoyés', failed: '2 en échec' });
    expect(more).toBeNull();
  });

  test('sans échec, rien n’est dit ; sans destinataire, la barre est vide (pas de division par zéro)', () => {
    const { rows } = broadcastRows({ rows: [{ ...sending, totalRecipients: 0, sentCount: 0, failedCount: 0 }], total: 1 }, 'fr');
    expect(rows[0]?.percent).toBe(0);
    expect(rows[0]?.failed).toBeNull();
  });

  test('la barre ne dépasse jamais 100 %', () => {
    expect(broadcastRows({ rows: [{ ...sending, sentCount: 500 }], total: 1 }, 'fr').rows[0]?.percent).toBe(100);
  });

  test('sans nom, l’objet sert de nom ; sans les deux, « Diffusion sans nom »', () => {
    const { rows } = broadcastRows(
      {
        rows: [
          { ...sending, name: null },
          { ...sending, name: null, subject: null },
        ],
        total: 2,
      },
      'fr',
    );
    expect(rows.map((row) => row.name)).toEqual(['Du nouveau', 'Diffusion sans nom']);
    expect(rows[0]?.subject).toBeNull();
  });

  test('quand il y en a plus que les cinq affichées, le reste se dit', () => {
    expect(broadcastRows({ rows: [sending], total: 4 }, 'fr').more).toBe('Et 3 de plus en cours d’envoi');
  });

  test('les nombres se formatent dans la langue d’interface', () => {
    expect(flat(broadcastRows({ rows: [{ ...sending, totalRecipients: 12_000, sentCount: 3_000 }], total: 1 }, 'fr').rows[0]?.progress ?? '')).toBe('3 000 sur 12 000 envoyés');
    expect(broadcastRows({ rows: [{ ...sending, totalRecipients: 12_000, sentCount: 3_000 }], total: 1 }, 'en').rows[0]?.progress).toBe('3,000 of 12,000 sent');
  });
});

describe('recentMemberRows — les derniers inscrits', () => {
  const member = (extra: Partial<AdminRecentMember>): AdminRecentMember => ({
    id: ID,
    ...awa,
    avatar: null,
    createdAt: '2026-09-30T09:00:00.000Z',
    ...extra,
  });

  test('le nom affiché, le @pseudo et l’ancienneté en mots', () => {
    const [row] = recentMemberRows([member({})], NOW, 'fr');
    expect(row).toEqual({ id: ID, label: 'Awa Diop', secondary: '@awa · inscrit il y a 3 heures', avatar: null });
  });

  test('sans date lisible, seul le pseudo reste ; sans pseudo ni date, pas de secondaire', () => {
    expect(recentMemberRows([member({ createdAt: null })], NOW, 'fr')[0]?.secondary).toBe('@awa');
    expect(recentMemberRows([member({ createdAt: null, username: null })], NOW, 'fr')[0]?.secondary).toBeNull();
  });

  test('sans nom affiché, le prénom et le nom ; sans rien, « Compte sans nom »', () => {
    expect(recentMemberRows([member({ displayName: null, firstName: 'Awa', lastName: 'Diop' })], NOW, 'fr')[0]?.label).toBe('Awa Diop');
    expect(recentMemberRows([member({ displayName: null, username: null })], NOW, 'fr')[0]?.label).toBe('Compte sans nom');
  });
});
