import { describe, expect, test } from 'bun:test';

import { AdminDashboardPanel } from '@/routes/admin-dashboard';
import { dashboardReplies, IDS, routeOf, SERVED } from '@/lib/admin/dashboard-fixtures';
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

type Zone = 'todo' | 'now' | 'platform' | 'usage' | 'trends' | 'people' | 'system';

const busy = (host: ParentNode): boolean =>
  host.querySelector('[data-admin-stat-state="loading"], [data-admin-chart-skeleton], [data-admin-block-skeleton], [data-admin-summary-state="loading"]') !== null;

async function settle(host: ParentNode) {
  for (let turn = 0; turn < 12 && busy(host); turn += 1) await mounter.settle();
}

/** Ouvre la modale d'une zone par son bouton « Ouvrir » (hors routeur : l'état est local au panneau). */
async function openZone(host: HTMLElement, zone: Zone) {
  await mounter.click(host.querySelector<HTMLElement>(`[data-admin-summary="${zone}"] [data-admin-summary-open]`));
  await settle(host);
}

async function dashboard(
  options: { readonly identity?: AdminIdentityFixture; readonly replies?: readonly RoutedReply[]; readonly language?: AdminLanguage; readonly open?: Zone } = {},
) {
  const { transport, calls } = routedTransport(...(options.replies ?? []), dashboardReplies());
  const host = await mount(
    <AdminDashboardPanel language={options.language ?? 'fr'} deps={{ source: 'gateway', transport }} now={() => NOW} />,
    options.identity ?? BIGBOSS,
  );
  await settle(host);
  if (options.open !== undefined) await openZone(host, options.open);
  return { host, calls };
}

const text = (host: ParentNode, selector: string): string => flat(host.querySelector(selector)?.textContent);
const stat = (host: ParentNode, anchor: string): string => text(host, `[data-admin-stat="${anchor}"]`);

describe('le hub : la bande « À traiter », six cartes résumées, le détail en modale (spec 2026-10-04 § 2)', () => {
  test('un BIGBOSS voit la bande puis les six cartes, dans l’ordre de la spécification', async () => {
    const { host } = await dashboard();
    expect([...host.querySelectorAll('[data-admin-summary]')].map((card) => card.getAttribute('data-admin-summary'))).toEqual([
      'todo',
      'now',
      'platform',
      'usage',
      'trends',
      'people',
      'system',
    ]);
  });

  test('chaque carte est une région nommée par son titre', async () => {
    const { host } = await dashboard();
    const titles = [...host.querySelectorAll('[data-admin-summary]')].map((card) => {
      const heading = card.querySelector('h3');
      expect(card.getAttribute('aria-labelledby')).toBe(heading?.id);
      return heading?.textContent;
    });
    expect(titles).toEqual(['À traiter', 'En ce moment', 'Plateforme', 'Santé de l’usage', 'Tendances', 'Personnes et échanges', 'Système']);
  });

  test('les cartes disent deux à quatre chiffres, déjà formatés', async () => {
    const { host } = await dashboard();
    const values = (zone: Zone) => [...host.querySelectorAll(`[data-admin-summary="${zone}"] dl > div`)].map((pair) => flat(pair.textContent));
    expect(values('now')).toEqual(['En ligne maintenant12', 'Messages dans la dernière heure340', 'Conversations actives27']);
    expect(values('platform')).toEqual(['Comptes1 200', 'Comptes actifs900', 'Messages34 000', 'Communautés5']);
    expect(values('usage')).toEqual(['Taux d’engagement35 %', 'Taux de comptes actifs42 %', 'Croissance7 %', 'Messages par compte31']);
    expect(values('system')).toEqual(['Base de donnéesOpérationnel', 'Redis (cache)Opérationnel', 'Coupe-circuits ouverts0', 'Configurations actives3']);
    expect(text(host, '[data-admin-summary="platform"] [data-admin-summary-sentence]')).toBe('3 nouveaux en 24 h');
    expect(text(host, '[data-admin-summary="system"] [data-admin-summary-sentence]')).toBe('Tous les services répondent.');
  });

  test('la bande « À traiter » : une pastille par file non vide, chacune vers la liste filtrée', async () => {
    const { host } = await dashboard();
    const pills = [...host.querySelectorAll('[data-admin-todo]')];
    expect(pills.map((pill) => flat(pill.textContent))).toEqual(['Signalements en attente : 6', 'Diffusions en cours : 1']);
    expect(pills.map((pill) => pill.querySelector('a')?.getAttribute('href'))).toEqual(['/admin/reports?status=pending', '/admin/broadcasts?status=SENDING']);
    expect((pills[0]?.querySelector('a') as HTMLElement | null)?.style.minHeight).toBe('44px');
  });

  test('deux files vides : « Rien à traiter », aucune pastille', async () => {
    const { host } = await dashboard({
      replies: [
        dashboardReplies({
          reportsStats: { ok: true, data: { ...SERVED.reportsStats, pendingReports: 0 } },
          broadcasts: { ok: true, data: { broadcasts: [], pagination: { total: 0 } } },
        }),
      ],
    });
    expect(host.querySelector('[data-admin-todo]')).toBeNull();
    expect(text(host, '[data-admin-summary="todo"] [data-admin-summary-sentence]')).toBe('Rien à traiter');
  });

  test('aucune modale n’est montée tant qu’on ne l’ouvre pas ; « Ouvrir » montre la zone, la croix la referme', async () => {
    const { host } = await dashboard();
    expect(host.querySelector('dialog')).toBeNull();
    expect(host.querySelector('[data-admin-stat]')).toBeNull();

    await openZone(host, 'platform');
    expect(host.querySelector('dialog h2')?.textContent).toBe('Plateforme');
    expect(host.querySelector('[data-admin-detail="platform"] [data-admin-stat="platform-users"]')).not.toBeNull();

    host.querySelector('dialog')?.close();
    await mounter.settle();
    expect(host.querySelector('dialog')).toBeNull();
  });

  test('la clé de requête de la plateforme est celle que « Recalculer maintenant » invalide', async () => {
    await dashboard();
    expect(appQueryClient.getQueryCache().find({ queryKey: ADMIN_DASHBOARD_QUERY_KEY })?.state.data).toBeDefined();
  });

  test('le hub ne lit que les SEPT lectures légères — ni graphiques, ni classements, ni la liste des inscrits (qui écrit un audit)', async () => {
    const { calls } = await dashboard();
    const routes = calls().map((call) => routeOf({ method: 'GET', path: call.path }));
    expect([...routes].sort()).toEqual(['agent', 'broadcasts', 'dashboard', 'kpis', 'monitoring', 'realtime', 'reportsStats']);
  });

  test('ouvrir « Tendances » lit ses cinq graphiques, et rien d’autre — jamais le navigateur de messages ni les traductions (#6919)', async () => {
    const { host, calls } = await dashboard();
    const before = calls().length;
    await openZone(host, 'trends');
    const opened = calls()
      .slice(before)
      .map((call) => routeOf({ method: 'GET', path: call.path }));
    expect([...opened].sort()).toEqual(['distribution', 'hourly', 'languages', 'types', 'volume']);
    const paths = calls().map((call) => call.path.split('?')[0] ?? '');
    expect(paths.filter((path) => path.endsWith('/admin/messages') || path.endsWith('/admin/translations'))).toEqual([]);
  });
});

describe('En ce moment — le temps réel, en trois cartes', () => {
  test('valeurs et légendes', async () => {
    const { host } = await dashboard({ open: 'now' });
    expect(stat(host, 'now-online')).toContain('En ligne maintenant');
    expect(stat(host, 'now-online')).toContain('12');
    expect(stat(host, 'now-messages')).toContain('340');
    expect(stat(host, 'now-conversations')).toContain('27');
  });
});

describe('Plateforme — dix cartes, des chiffres formatés', () => {
  test('chaque carte dit son chiffre et sa légende en mots — traductions et signalements compris (décodés, jamais affichés avant)', async () => {
    const { host } = await dashboard({ open: 'platform' });
    expect(stat(host, 'platform-users')).toBe('Comptes1 2003 nouveaux en 24 h');
    expect(stat(host, 'platform-active-users')).toBe('Comptes actifs90075 % des comptes · 300 désactivés');
    expect(stat(host, 'platform-anonymous')).toBe('Participants anonymes14060 actifs · 2 arrivés en 24 h');
    expect(stat(host, 'platform-messages')).toBe('Messages34 000500 en 24 h');
    expect(stat(host, 'platform-conversations')).toBe('Nouvelles conversations4Créées ces 24 dernières heures');
    expect(stat(host, 'platform-communities')).toBe('Communautés5');
    expect(stat(host, 'platform-share-links')).toBe('Liens de partage actifs31sur 40');
    expect(stat(host, 'platform-translations')).toBe('Traductions21 000');
    expect(stat(host, 'platform-reports')).toBe('Signalements9');
    expect(stat(host, 'platform-admins')).toBe('Administrateurs2Administrateurs et créateur');
  });

  test('les bouche-trous et le faux « total d’invitations » ne sont JAMAIS peints', async () => {
    const { host } = await dashboard({ open: 'platform' });
    expect(host.textContent).not.toContain('7 771');
    expect(host.textContent).not.toContain('7771');
    expect(host.textContent).not.toContain('topLanguages');
  });

  test('les cartes mènent à la liste filtrée — un lien seulement si la section est ouverte au lecteur', async () => {
    const { host } = await dashboard({ open: 'platform' });
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
  test('quatre cartes : engagement, croissance, messages par compte, comptes actifs — deux taux DISTINCTS, chacun dit ce qu’il mesure', async () => {
    const { host } = await dashboard({ open: 'usage' });
    expect(stat(host, 'usage-engagement')).toBe('Taux d’engagement35 %Comptes ayant écrit sur la période, rapportés aux comptes actifs');
    expect(stat(host, 'usage-growth')).toContain('7 %');
    expect(stat(host, 'usage-per-user')).toContain('Messages par compte31');
    expect(stat(host, 'usage-active-rate')).toBe('Taux de comptes actifs42 %Part des comptes vus au moins une fois sur la période');
  });

  test('la durée de session et les heures de pointe codées en dur ne sont JAMAIS peintes', async () => {
    const { host } = await dashboard({ open: 'usage' });
    expect(host.textContent).not.toContain('2h 45m');
    expect(host.textContent).not.toContain('18h-21h');
  });
});

describe('Tendances — cinq graphiques, des libellés par position, par indice, par code', () => {
  test('le volume : jours re-libellés dans la langue d’interface, pic dit en une phrase', async () => {
    const { host } = await dashboard({ open: 'trends' });
    const chart = host.querySelector('[data-admin-chart="volume"]');
    expect(flat(chart?.querySelector('[data-admin-chart-summary]')?.textContent)).toBe('Pic le dim. 27 sept. : 40');

    await mounter.click(chart?.querySelector<HTMLElement>('[data-admin-action="chart-table"]') ?? null);
    const rows = [...(chart?.querySelectorAll('tbody tr') ?? [])].map((row) => flat(row.textContent));
    expect(rows[0]).toBe('jeu. 24 sept.10');
    expect(rows[6]).toBe('mer. 30 sept.12');
    expect(host.textContent).not.toContain('24/09');
  });

  test('l’activité : tranches de 3 h nommées par leur heure, le pic dit de quand à quand — un serveur qui ne sert pas l’instant des tranches les dit « UTC »', async () => {
    const { host } = await dashboard({ open: 'trends' });
    const chart = host.querySelector('[data-admin-chart="hourly"]');
    expect(flat(chart?.querySelector('figcaption > span')?.textContent)).toBe('Activité par tranche de 3 heures (24 dernières heures, heures UTC)');
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
    const { host } = await dashboard({ open: 'trends' });
    const legend = flat(host.querySelector('[data-admin-chart="engagement"] [data-admin-chart-legend]')?.textContent);
    for (const name of ['Très actifs', 'Actifs', 'Occasionnels', 'Inactifs']) expect(legend).toContain(name);
    expect(flat(host.querySelector('[data-admin-chart="engagement"] [data-admin-chart-summary]')?.textContent)).toBe('42 % des comptes ont été actifs ces 7 derniers jours.');
    expect(host.innerHTML).not.toMatch(/#10b981|#3b82f6|#f59e0b|#ef4444|#8b5cf6/i);
  });

  test('les langues : six langues NOMMÉES, jamais un code', async () => {
    const { host } = await dashboard({ open: 'trends' });
    const names = [...host.querySelectorAll('[data-admin-chart="languages"] [data-admin-bar]')].map((row) => flat(row.textContent));
    expect(names.map((row) => row.replace(/[\d\s]+$/, ''))).toEqual(['Français', 'Anglais', 'Espagnol', 'Allemand', 'Portugais', 'Italien']);
    expect(flat(host.querySelector('[data-admin-chart="languages"] [data-admin-chart-summary]')?.textContent)).toBe('Langue la plus utilisée : Français (900)');
  });

  test('les types : nommés, du plus envoyé au moins envoyé, avec la part du premier', async () => {
    const { host } = await dashboard({ open: 'trends' });
    const legend = flat(host.querySelector('[data-admin-chart="types"] [data-admin-chart-legend]')?.textContent);
    expect(legend.indexOf('Texte')).toBeLessThan(legend.indexOf('Image'));
    expect(legend).toContain('Message vocal');
    expect(flat(host.querySelector('[data-admin-chart="types"] [data-admin-chart-summary]')?.textContent)).toBe('Type le plus envoyé : Texte (90 %)');
  });

  test('chaque graphique garde son tableau de données accessible', async () => {
    const { host } = await dashboard({ open: 'trends' });
    for (const id of ['volume', 'hourly', 'engagement', 'languages', 'types']) {
      expect(host.querySelector(`[data-admin-chart="${id}"] [data-admin-action="chart-table"]`)).not.toBeNull();
    }
    await openZone(host, 'people');
    for (const id of ['rank-conversations', 'rank-members']) {
      expect(host.querySelector(`[data-admin-chart="${id}"] [data-admin-action="chart-table"]`)).not.toBeNull();
    }
  });
});

describe('À traiter — la file de modération et les diffusions en cours', () => {
  test('la file : deux compteurs et le délai dit en durée', async () => {
    const { host } = await dashboard({ open: 'todo' });
    expect(stat(host, 'moderation-pending')).toContain('En attente6');
    expect(stat(host, 'moderation-review')).toContain('En cours d’examen2');
    expect(stat(host, 'moderation-delay')).toContain('Délai moyen de résolution5 h 30 min');
    expect(stat(host, 'moderation-delay')).toContain('Hors dossiers classés sans suite');
  });

  test('les signalements récents sont NOMMÉS — l’entité, le motif, le moment, le statut — jamais leur contenu', async () => {
    const { host } = await dashboard({ open: 'todo' });
    const rows = [...host.querySelectorAll('[data-admin-block="moderation"] li[data-admin-row]')].map((row) => flat(row.textContent));
    expect(rows).toEqual(['Message de Awa DiopHarcèlement · il y a 3 minutesEn attente', 'Jean DupontMembre · Indésirable · il y a 3 heuresEn cours d’examen']);

    expect(host.textContent).not.toContain('EXTRAIT-SECRET');
    expect(host.textContent).not.toContain('note interne');
    expect(host.textContent).not.toContain('harcèle depuis');
  });

  test('les diffusions en cours : le nom, l’objet, la progression en mots, la barre accessible', async () => {
    const { host } = await dashboard({ open: 'todo' });
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
    const { host } = await dashboard({ open: 'people' });
    const rows = [...host.querySelectorAll('[data-admin-block="members"] li[data-admin-row]')].map((row) => flat(row.textContent));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Awa Diop@awa · inscrit il y a 3 heures');
    expect(rows[1]).toContain('Jean Dupont@jean · inscrit hier');
    expect(host.textContent).not.toContain('awa@example.test');
  });

  test('les conversations les plus actives : le titre, ou le type quand la passerelle ne donne que l’identifiant public', async () => {
    const { host } = await dashboard({ open: 'people' });
    const bars = [...host.querySelectorAll('[data-admin-chart="rank-conversations"] [data-admin-bar]')].map((bar) => flat(bar.textContent));
    expect(bars).toEqual(['Famille120', 'Conversation privée80']);
    expect(host.textContent).not.toContain('mshy_equipe');
    expect(host.textContent).not.toContain('mshy_famille');
  });

  test('les membres les plus actifs : le nom, sinon @pseudo — un invité garde son nom, jamais « compte supprimé »', async () => {
    const { host } = await dashboard({ open: 'people' });
    const bars = [...host.querySelectorAll('[data-admin-chart="rank-members"] [data-admin-bar]')].map((bar) => flat(bar.textContent));
    expect(bars).toEqual(['Awa Diop88', '@jean50', 'Invitée Mariam12']);
    expect(flat(host.querySelector('[data-admin-chart="rank-members"]')?.textContent)).not.toContain('supprimé');
  });

  test('un invité classé mène à sa fiche d’anonyme, un membre à sa fiche de compte', async () => {
    const { host } = await dashboard({ open: 'people' });
    const hrefs = [...host.querySelectorAll('[data-admin-chart="rank-members"] a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toContain(`/admin/users/${IDS.awa}`);
    expect(hrefs).toContain(`/admin/anonymous/${IDS.guest}`);
    expect(hrefs).not.toContain(`/admin/users/${IDS.guest}`);
  });

  test('les noms ouvrent leur fiche quand le lecteur peut l’ouvrir', async () => {
    const { host } = await dashboard({ open: 'people' });
    const chip = host.querySelector('[data-admin-block="members"] li[data-admin-row] a');
    expect(chip?.getAttribute('href')).toBe(`/admin/users/${IDS.awa}`);
    expect(chip?.getAttribute('aria-label')).toBe('Ouvrir la fiche de Awa Diop');
  });
});

describe('Système — la santé de la plateforme et l’agent', () => {
  test('base, Redis, temps réel, coupe-circuits : l’état en mots, la latence en durée', async () => {
    const { host } = await dashboard({ open: 'system' });
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
      open: 'system',
    });
    expect(stat(host, 'health-database')).toBe('Base de donnéesHors serviceNe répond pas');
    expect(stat(host, 'health-breakers')).toBe('Coupe-circuits ouverts1Coupés : translator');
    expect(text(host, '[data-admin-notice="danger"]')).toBe(
      'La base de données ne répond pas. Des coupe-circuits sont ouverts : des appels sont refusés le temps que le service se rétablisse.',
    );
  });

  test('l’agent : configurations actives, messages publiés, dernière activité en relatif', async () => {
    const { host } = await dashboard({ open: 'system' });
    expect(stat(host, 'agent-active')).toBe('Configurations actives3sur 4 configurations');
    expect(stat(host, 'agent-messages')).toContain('Messages publiés486');
    expect(stat(host, 'agent-last')).toContain('Dernière activitéil y a 3 heures');
  });
});

describe('aucune donnée brute ne se lit à l’écran', () => {
  test('ni identifiant, ni horodatage ISO, ni booléen, ni énumération en capitales — au hub comme dans chaque modale', async () => {
    const { host } = await dashboard();
    expectNoRawIdentifiers(host);
    for (const zone of ['todo', 'now', 'platform', 'usage', 'trends', 'people', 'system'] as const) {
      await openZone(host, zone);
      expectNoRawIdentifiers(host);
    }
  });

  test('aucun hexadécimal de couleur dans le DOM rendu — des jetons seulement', async () => {
    const { host } = await dashboard();
    expect(host.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const zone of ['todo', 'now', 'platform', 'usage', 'trends', 'people', 'system'] as const) {
      await openZone(host, zone);
      expect(host.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});

describe('dans la langue d’interface', () => {
  test('en anglais : cartes, modales, langues nommées en anglais, pourcentages à l’anglaise', async () => {
    const { host } = await dashboard({ language: 'en' });
    expect([...host.querySelectorAll('[data-admin-summary] h3')].map((heading) => heading.textContent)).toEqual([
      'To handle',
      'Right now',
      'Platform',
      'Usage health',
      'Trends',
      'People and exchanges',
      'System',
    ]);
    expect(host.querySelector('[data-admin-summary="platform"] [data-admin-summary-open]')?.getAttribute('aria-label')).toBe('Open Platform');

    await openZone(host, 'platform');
    expect(host.querySelector('dialog button')?.getAttribute('aria-label')).toBe('Close');
    expect(stat(host, 'platform-active-users')).toBe('Active accounts90075% of accounts · 300 deactivated');
    await openZone(host, 'usage');
    expect(stat(host, 'usage-engagement')).toContain('35%');
    await openZone(host, 'trends');
    const names = [...host.querySelectorAll('[data-admin-chart="languages"] [data-admin-bar]')].map((row) => flat(row.textContent).replace(/[\d\s,]+$/, ''));
    expect(names).toEqual(['French', 'English', 'Spanish', 'German', 'Portuguese', 'Italian']);
    await openZone(host, 'todo');
    expect(text(host, '[data-admin-block="moderation"] li[data-admin-row]')).toContain('Message by Awa Diop');
  });
});

describe('l’espace /adm (D-76) — le tableau de bord suit l’espace où l’on est', () => {
  test('les liens des cartes mènent sous /adm, jamais sous /admin — données servies par le cache, sans réseau', async () => {
    const { mountAdminAt, resetAdminRouter } = await import('@/test-support/admin-router');
    const { decodeAdminDashboard } = await import('@/lib/api/admin-dashboard');
    const { SERVED } = await import('@/lib/admin/dashboard-fixtures');

    appQueryClient.setQueryData(ADMIN_DASHBOARD_QUERY_KEY, decodeAdminDashboard(SERVED.dashboard));
    /* La modale ouverte vit dans l'adresse (`?open=`) : un lien copié la rouvre. */
    const host = await mountAdminAt(mounter, '/adm?open=platform', BIGBOSS, '[data-admin-stat="platform-users"]');

    expect(host.querySelector('[data-admin-stat="platform-users"] a')?.getAttribute('href')).toBe('/adm/users');
    expect(host.querySelector('[data-admin-stat="platform-active-users"] a')?.getAttribute('href')).toBe('/adm/users?isActive=true');
    resetAdminRouter(mounter);
  });
});
