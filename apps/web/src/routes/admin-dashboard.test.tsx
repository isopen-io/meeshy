import { describe, expect, test } from 'bun:test';

import { AdminDashboardPanel } from '@/routes/admin-dashboard';
import { dashboardReplies, IDS } from '@/lib/admin/dashboard-fixtures';
import type { AdminIdentityFixture } from '@/test-support/admin-assertions';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { routedTransport, type RoutedReply } from '@/test-support/routed-transport';
import { visibleAdminSections } from '@/lib/admin/sections';
import { ADMIN_DASHBOARD_QUERY_KEY } from '@/lib/api/admin-dashboard';
import { appQueryClient } from '@/lib/api/query-client';
import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LE TABLEAU DE BORD « VUE DE DIEU »** (#8876, § 4) — le panneau monté comme
 * le hub le monte, sous `QueryClientProvider`, sa passerelle remplacée par les
 * charges TELLES QUE SERVIES (libellés français, couleurs, bouche-trous,
 * champs voisins sensibles compris).
 *
 * Ce fichier mesure ce que le créateur VOIT : chaque zone, chaque valeur dite
 * en mots et dans la langue d'interface, chaque nom. Les portes (matrice,
 * erreurs, refus, squelettes) sont dans `admin-dashboard-gating.test.tsx`.
 */

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

const NOW = new Date('2026-09-30T12:00:00.000Z');
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const flat = (text: string | null | undefined): string => (text ?? '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function dashboard(options: { readonly identity?: AdminIdentityFixture; readonly replies?: readonly RoutedReply[]; readonly language?: AdminLanguage } = {}) {
  const { transport, calls } = routedTransport(...(options.replies ?? []), dashboardReplies());
  const host = await mount(
    <AdminDashboardPanel language={options.language ?? 'fr'} deps={{ source: 'gateway', transport }} now={() => NOW} />,
    options.identity ?? BIGBOSS,
  );
  for (let turn = 0; turn < 12 && host.querySelector('[data-admin-stat-state="loading"], [data-admin-chart-skeleton], [data-admin-block-skeleton]') !== null; turn += 1) {
    await mounter.settle();
  }
  return { host, calls };
}

const text = (host: ParentNode, selector: string): string => flat(host.querySelector(selector)?.textContent);
const stat = (host: ParentNode, anchor: string): string => text(host, `[data-admin-stat="${anchor}"]`);

describe('la structure : sept zones, dans l’ordre de la spécification', () => {
  test('un BIGBOSS voit les sept zones', async () => {
    const { host } = await dashboard();
    expect([...host.querySelectorAll('[data-admin-zone]')].map((zone) => zone.getAttribute('data-admin-zone'))).toEqual([
      'now',
      'platform',
      'usage',
      'trends',
      'todo',
      'people',
      'system',
    ]);
  });

  test('chaque zone porte son titre (h2) et est une région nommée', async () => {
    const { host } = await dashboard();
    const titles = [...host.querySelectorAll('[data-admin-zone]')].map((zone) => {
      const heading = zone.querySelector('h2');
      expect(zone.getAttribute('aria-labelledby')).toBe(heading?.id);
      return heading?.textContent;
    });
    expect(titles).toEqual(['En ce moment', 'Plateforme', 'Santé de l’usage', 'Tendances', 'À traiter', 'Personnes et échanges', 'Système']);
  });

  test('la clé de requête de la plateforme est celle que « Recalculer maintenant » invalide', async () => {
    await dashboard();
    expect(appQueryClient.getQueryCache().find({ queryKey: ADMIN_DASHBOARD_QUERY_KEY })?.state.data).toBeDefined();
  });

  test('seize lectures, pas une de plus — jamais le navigateur de messages ni les traductions (#6919)', async () => {
    const { calls } = await dashboard();
    const paths = calls().map((call) => call.path.split('?')[0] ?? '');
    expect(calls()).toHaveLength(16);
    expect(paths.filter((path) => path.endsWith('/admin/messages') || path.endsWith('/admin/translations'))).toEqual([]);
  });
});

describe('En ce moment — le temps réel, en trois cartes', () => {
  test('valeurs et légendes', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'now-online')).toContain('En ligne maintenant');
    expect(stat(host, 'now-online')).toContain('12');
    expect(stat(host, 'now-messages')).toContain('340');
    expect(stat(host, 'now-conversations')).toContain('27');
  });
});

describe('Plateforme — huit cartes, des chiffres formatés', () => {
  test('chaque carte dit son chiffre et sa légende en mots', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'platform-users')).toBe('Comptes1 2003 nouveaux en 24 h');
    expect(stat(host, 'platform-active-users')).toBe('Comptes actifs90075 % des comptes · 300 désactivés');
    expect(stat(host, 'platform-anonymous')).toBe('Participants anonymes14060 actifs · 2 arrivés en 24 h');
    expect(stat(host, 'platform-messages')).toBe('Messages34 000500 en 24 h');
    expect(stat(host, 'platform-conversations')).toBe('Nouvelles conversations4Créées ces 24 dernières heures');
    expect(stat(host, 'platform-communities')).toBe('Communautés5');
    expect(stat(host, 'platform-share-links')).toBe('Liens de partage actifs31sur 40');
    expect(stat(host, 'platform-admins')).toBe('Administrateurs2Administrateurs et créateur');
  });

  test('les bouche-trous et le faux « total d’invitations » ne sont JAMAIS peints', async () => {
    const { host } = await dashboard();
    expect(host.textContent).not.toContain('7 771');
    expect(host.textContent).not.toContain('7771');
    expect(host.textContent).not.toContain('topLanguages');
  });

  test('les cartes mènent à la liste filtrée — un lien seulement si la section est ouverte au lecteur', async () => {
    const { host } = await dashboard();
    const opens = (section: string) => visibleAdminSections(BIGBOSS.permissions, BIGBOSS.role).some((candidate) => candidate.id === section);
    const href = (anchor: string) => host.querySelector(`[data-admin-stat="${anchor}"] a`)?.getAttribute('href') ?? null;

    expect(href('platform-users')).toBe('/admin/users');
    expect(href('platform-active-users')).toBe('/admin/users?isActive=true');
    expect(href('platform-admins')).toBe('/admin/users?role=ADMINISTRATION');
    expect(href('platform-anonymous')).toBe('/admin/anonymous');
    expect(href('platform-conversations')).toBe('/admin/conversations?period=24h&sort=createdAt');
    expect(href('platform-messages')).toBe(opens('analytics') ? '/admin/analytics?tab=messages' : null);
    expect(href('platform-communities')).toBe(opens('communities') ? '/admin/communities' : null);
    expect(href('platform-share-links')).toBe(opens('shareLinks') ? '/admin/share-links?isActive=true' : null);
  });
});

describe('Santé de l’usage — les taux en pourcentage', () => {
  test('quatre cartes : engagement, croissance, messages par compte, comptes actifs', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'usage-engagement')).toContain('42 %');
    expect(stat(host, 'usage-growth')).toContain('7 %');
    expect(stat(host, 'usage-per-user')).toContain('Messages par compte31');
    expect(stat(host, 'usage-active-rate')).toContain('42 %');
  });

  test('la durée de session et les heures de pointe codées en dur ne sont JAMAIS peintes', async () => {
    const { host } = await dashboard();
    expect(host.textContent).not.toContain('2h 45m');
    expect(host.textContent).not.toContain('18h-21h');
  });
});

describe('Tendances — cinq graphiques, des libellés par position, par indice, par code', () => {
  test('le volume : jours re-libellés dans la langue d’interface, pic dit en une phrase', async () => {
    const { host } = await dashboard();
    const chart = host.querySelector('[data-admin-chart="volume"]');
    expect(flat(chart?.querySelector('[data-admin-chart-summary]')?.textContent)).toBe('Pic le dim. 27 sept. : 40');

    await mounter.click(chart?.querySelector<HTMLElement>('[data-admin-action="chart-table"]') ?? null);
    const rows = [...(chart?.querySelectorAll('tbody tr') ?? [])].map((row) => flat(row.textContent));
    expect(rows[0]).toBe('jeu. 24 sept.10');
    expect(rows[6]).toBe('mer. 30 sept.12');
    expect(host.textContent).not.toContain('24/09');
  });

  test('l’activité : tranches de 3 h nommées par leur heure, le pic dit de quand à quand', async () => {
    const { host } = await dashboard();
    const chart = host.querySelector('[data-admin-chart="hourly"]');
    expect([...(chart?.querySelectorAll('[data-admin-bar]') ?? [])].map((bar) => flat(bar.textContent))).toEqual([
      '15 h',
      '18 h',
      '21 h',
      '00 h',
      '03 h',
      '06 h',
      '09 h',
      '12 h',
    ]);
    expect(flat(chart?.querySelector('[data-admin-chart-summary]')?.textContent)).toBe('Tranche la plus active : de 21 h à 00 h (19)');
  });

  test('l’engagement : quatre tranches NOMMÉES par indice, couleurs servies ignorées', async () => {
    const { host } = await dashboard();
    const legend = flat(host.querySelector('[data-admin-chart="engagement"] [data-admin-chart-legend]')?.textContent);
    for (const name of ['Très actifs', 'Actifs', 'Occasionnels', 'Inactifs']) expect(legend).toContain(name);
    expect(flat(host.querySelector('[data-admin-chart="engagement"] [data-admin-chart-summary]')?.textContent)).toBe('42 % des comptes ont été actifs ces 7 derniers jours.');
    expect(host.innerHTML).not.toMatch(/#10b981|#3b82f6|#f59e0b|#ef4444|#8b5cf6/i);
  });

  test('les langues : six langues NOMMÉES, jamais un code', async () => {
    const { host } = await dashboard();
    const names = [...host.querySelectorAll('[data-admin-chart="languages"] [data-admin-bar]')].map((row) => flat(row.textContent));
    expect(names.map((row) => row.replace(/[\d\s]+$/, ''))).toEqual(['Français', 'Anglais', 'Espagnol', 'Allemand', 'Portugais', 'Italien']);
    expect(flat(host.querySelector('[data-admin-chart="languages"] [data-admin-chart-summary]')?.textContent)).toBe('Langue la plus utilisée : Français (900)');
  });

  test('les types : nommés, du plus envoyé au moins envoyé, avec la part du premier', async () => {
    const { host } = await dashboard();
    const legend = flat(host.querySelector('[data-admin-chart="types"] [data-admin-chart-legend]')?.textContent);
    expect(legend.indexOf('Texte')).toBeLessThan(legend.indexOf('Image'));
    expect(legend).toContain('Message vocal');
    expect(flat(host.querySelector('[data-admin-chart="types"] [data-admin-chart-summary]')?.textContent)).toBe('Type le plus envoyé : Texte (90 %)');
  });

  test('chaque graphique garde son tableau de données accessible', async () => {
    const { host } = await dashboard();
    for (const id of ['volume', 'hourly', 'engagement', 'languages', 'types', 'rank-conversations', 'rank-members']) {
      expect(host.querySelector(`[data-admin-chart="${id}"] [data-admin-action="chart-table"]`)).not.toBeNull();
    }
  });
});

describe('À traiter — la file de modération et les diffusions en cours', () => {
  test('la file : deux compteurs et le délai dit en durée', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'moderation-pending')).toContain('En attente6');
    expect(stat(host, 'moderation-review')).toContain('En cours d’examen2');
    expect(stat(host, 'moderation-delay')).toContain('Délai moyen de résolution5 h 30 min');
    expect(stat(host, 'moderation-delay')).toContain('Hors dossiers classés sans suite');
  });

  test('les signalements récents sont NOMMÉS — l’entité, le motif, le moment, le statut — jamais leur contenu', async () => {
    const { host } = await dashboard();
    const rows = [...host.querySelectorAll('[data-admin-block="moderation"] li[data-admin-row]')].map((row) => flat(row.textContent));
    expect(rows).toEqual(['Message de Awa DiopHarcèlement · il y a 3 minutesEn attente', 'Jean DupontMembre · Indésirable · il y a 3 heuresEn cours d’examen']);

    expect(host.textContent).not.toContain('EXTRAIT-SECRET');
    expect(host.textContent).not.toContain('note interne');
    expect(host.textContent).not.toContain('harcèle depuis');
  });

  test('les diffusions en cours : le nom, l’objet, la progression en mots, la barre accessible', async () => {
    const { host } = await dashboard();
    const block = host.querySelector('[data-admin-block="broadcasts"]');
    expect(flat(block?.textContent)).toContain('Nouveautés de septembre');
    expect(flat(block?.textContent)).toContain('Du nouveau sur Meeshy');
    expect(flat(block?.textContent)).toContain('50 sur 200 envoyés');
    expect(flat(block?.textContent)).toContain('2 en échec');

    const bar = block?.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('25');
    expect(flat(bar?.getAttribute('aria-label'))).toBe('Progression de l’envoi de Nouveautés de septembre : 25 %');
  });
});

describe('Personnes et échanges — des noms, jamais un identifiant', () => {
  test('les derniers inscrits : nom affiché, prénom et nom à défaut, @pseudo, ancienneté en mots', async () => {
    const { host } = await dashboard();
    const rows = [...host.querySelectorAll('[data-admin-block="members"] li[data-admin-row]')].map((row) => flat(row.textContent));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Awa Diop@awa · inscrit il y a 3 heures');
    expect(rows[1]).toContain('Jean Dupont@jean · inscrit hier');
    expect(host.textContent).not.toContain('awa@example.test');
  });

  test('les conversations les plus actives : le titre, ou le type quand la passerelle ne donne que l’identifiant public', async () => {
    const { host } = await dashboard();
    const bars = [...host.querySelectorAll('[data-admin-chart="rank-conversations"] [data-admin-bar]')].map((bar) => flat(bar.textContent));
    expect(bars).toEqual(['Famille120', 'Conversation privée80']);
    expect(host.textContent).not.toContain('mshy_equipe');
    expect(host.textContent).not.toContain('mshy_famille');
  });

  test('les membres les plus actifs : le nom, sinon @pseudo', async () => {
    const { host } = await dashboard();
    const bars = [...host.querySelectorAll('[data-admin-chart="rank-members"] [data-admin-bar]')].map((bar) => flat(bar.textContent));
    expect(bars).toEqual(['Awa Diop88', '@jean50']);
  });

  test('les noms ouvrent leur fiche quand le lecteur peut l’ouvrir', async () => {
    const { host } = await dashboard();
    const chip = host.querySelector('[data-admin-block="members"] li[data-admin-row] a');
    expect(chip?.getAttribute('href')).toBe(`/admin/users/${IDS.awa}`);
    expect(chip?.getAttribute('aria-label')).toBe('Ouvrir la fiche de Awa Diop');
  });
});

describe('Système — la santé de la plateforme et l’agent', () => {
  test('base, Redis, temps réel, coupe-circuits : l’état en mots, la latence en durée', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'health-database')).toBe('Base de donnéesOpérationnelRéponse en 4 ms');
    expect(stat(host, 'health-redis')).toBe('Redis (cache)OpérationnelRéponse en 2 ms');
    expect(stat(host, 'health-realtime')).toBe('Connexions en temps réel12080 comptes connectés');
    expect(stat(host, 'health-breakers')).toBe('Coupe-circuits ouverts0Tous les services répondent');
    expect(host.querySelector('[data-admin-notice]')).toBeNull();
  });

  test('une base qui ne répond pas et un coupe-circuit ouvert : le dire en haut, en mots', async () => {
    const { host } = await dashboard({
      replies: [
        dashboardReplies({
          monitoring: {
            ok: true,
            data: {
              ...{ database: { status: 'down', latencyMs: null }, redis: { status: 'up', latencyMs: 2 }, realtime: { connections: 1, connectedUsers: 1 } },
              circuitBreakers: [{ name: 'translator', state: 'OPEN' }],
            },
          },
        }),
      ],
    });
    expect(stat(host, 'health-database')).toBe('Base de donnéesHors serviceNe répond pas');
    expect(stat(host, 'health-breakers')).toBe('Coupe-circuits ouverts1Coupés : translator');
    expect(text(host, '[data-admin-notice="danger"]')).toBe(
      'La base de données ne répond pas. Des coupe-circuits sont ouverts : des appels sont refusés le temps que le service se rétablisse.',
    );
  });

  test('l’agent : configurations actives, messages publiés, dernière activité en relatif', async () => {
    const { host } = await dashboard();
    expect(stat(host, 'agent-active')).toBe('Configurations actives3sur 4 configurations');
    expect(stat(host, 'agent-messages')).toContain('Messages publiés486');
    expect(stat(host, 'agent-last')).toContain('Dernière activitéil y a 3 heures');
  });
});

describe('aucune donnée brute ne se lit à l’écran', () => {
  test('ni identifiant, ni horodatage ISO, ni booléen, ni énumération en capitales', async () => {
    const { host } = await dashboard();
    expectNoRawIdentifiers(host);
  });

  test('aucun hexadécimal de couleur dans le DOM rendu — des jetons seulement', async () => {
    const { host } = await dashboard();
    expect(host.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('dans la langue d’interface', () => {
  test('en anglais : zones, cartes, langues nommées en anglais, pourcentages à l’anglaise', async () => {
    const { host } = await dashboard({ language: 'en' });
    expect([...host.querySelectorAll('[data-admin-zone] h2')].map((heading) => heading.textContent)).toEqual([
      'Right now',
      'Platform',
      'Usage health',
      'Trends',
      'To handle',
      'People and exchanges',
      'System',
    ]);
    expect(stat(host, 'platform-active-users')).toBe('Active accounts90075% of accounts · 300 deactivated');
    expect(stat(host, 'usage-engagement')).toContain('42%');
    const names = [...host.querySelectorAll('[data-admin-chart="languages"] [data-admin-bar]')].map((row) => flat(row.textContent).replace(/[\d\s,]+$/, ''));
    expect(names).toEqual(['French', 'English', 'Spanish', 'German', 'Portuguese', 'Italian']);
    expect(text(host, '[data-admin-block="moderation"] li[data-admin-row]')).toContain('Message by Awa Diop');
  });
});

describe('l’espace /adm (D-76) — le tableau de bord suit l’espace où l’on est', () => {
  test('les liens des cartes mènent sous /adm, jamais sous /admin — données servies par le cache, sans réseau', async () => {
    const { mountAdminAt, resetAdminRouter } = await import('@/test-support/admin-router');
    const { decodeAdminDashboard } = await import('@/lib/api/admin-dashboard');
    const { SERVED } = await import('@/lib/admin/dashboard-fixtures');

    appQueryClient.setQueryData(ADMIN_DASHBOARD_QUERY_KEY, decodeAdminDashboard(SERVED.dashboard));
    const host = await mountAdminAt(mounter, '/adm', BIGBOSS, '[data-admin-stat="platform-users"]');

    expect(host.querySelector('[data-admin-stat="platform-users"] a')?.getAttribute('href')).toBe('/adm/users');
    expect(host.querySelector('[data-admin-stat="platform-active-users"] a')?.getAttribute('href')).toBe('/adm/users?isActive=true');
    resetAdminRouter(mounter);
  });
});
