import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminBarChart } from './charts/bar-chart';
import { ADMIN_OTHERS_TOKEN, ADMIN_SERIES_TOKENS, AdminChartCard, AdminChartTable } from './charts/chart-card';
import { AdminShareChart } from './charts/share-chart';
import { AdminSparkline } from './charts/sparkline';
import { AdminTimelineChart } from './charts/timeline-chart';

const { mount } = setupAdminKitTests();

const count = (value: number) => `${value}`;
const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.'];
const serie = (key: string, label: string, valeurs: readonly number[]) => ({ key, label, points: valeurs.map((value, index) => ({ x: JOURS[index] ?? '', value })) });

const bouton = (host: Element) => host.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]');

describe('AdminChartCard — le cadre, la figure, le tableau', () => {
  const table = { caption: 'Messages', columns: ['Libellé', 'Valeur'], rows: [['mar.', '12']] };

  test('figure + figcaption : le titre et UNE phrase de synthèse ; le dessin est masqué à l’accessibilité', async () => {
    const host = await mount(
      <AdminChartCard language="fr" id="volume" title="Volume" summary="Pic le mardi : 12 messages" table={table} height={100} empty={false}>
        <svg aria-hidden="true" data-dessin />
      </AdminChartCard>,
    );
    const figure = host.querySelector('figure[data-admin-chart="volume"]');
    expect(figure?.querySelector('figcaption')?.textContent).toBe('VolumePic le mardi : 12 messages');
    expect(figure?.querySelector('[data-dessin]')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('« Voir les données » déplie le tableau accessible, « Masquer » le replie', async () => {
    const host = await mount(
      <AdminChartCard language="fr" id="volume" title="Volume" summary="s" table={table} height={100} empty={false}>
        <svg aria-hidden="true" />
      </AdminChartCard>,
    );
    expect(host.querySelector('table')).toBeNull();
    expect(bouton(host)?.getAttribute('aria-expanded')).toBe('false');
    expect(bouton(host)?.textContent).toBe('Voir les données');

    await act(async () => bouton(host)?.click());
    expect(bouton(host)?.getAttribute('aria-expanded')).toBe('true');
    expect(bouton(host)?.textContent).toBe('Masquer les données');
    expect(host.querySelector('table caption')?.textContent).toBe('Messages');
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Libellé', 'Valeur']);
    expect(host.querySelector('tbody th[scope="row"]')?.textContent).toBe('mar.');
    expect(bouton(host)?.getAttribute('aria-controls')).toBe(host.querySelector('[hidden], [id]')?.id ?? '');
  });

  test('vide : « Aucune donnée sur la période », ni dessin ni synthèse ni tableau', async () => {
    const host = await mount(
      <AdminChartCard language="fr" id="volume" title="Volume" summary="ne doit pas s’afficher" table={table} height={100} empty>
        <svg data-dessin />
      </AdminChartCard>,
    );
    expect(host.querySelector('[data-admin-chart-empty]')?.textContent).toBe('Aucune donnée sur la période');
    expect(host.querySelector('[data-dessin]')).toBeNull();
    expect(host.querySelector('[data-admin-chart-summary]')).toBeNull();
    expect(bouton(host)).toBeNull();
  });

  test('squelette de la MÊME hauteur que le dessin — jamais un graphique plat qui ferait croire à zéro', async () => {
    const host = await mount(
      <AdminChartCard language="fr" id="volume" title="Volume" summary="s" table={table} height={180} empty={false} state="loading">
        <svg data-dessin />
      </AdminChartCard>,
    );
    expect((host.querySelector('[data-admin-chart-skeleton]') as HTMLElement | null)?.style.height).toBe('180px');
    expect(host.querySelector('figure')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-dessin]')).toBeNull();
  });

  test('erreur : « Réessayer » rappelle', async () => {
    let appels = 0;
    const host = await mount(
      <AdminChartCard language="fr" id="volume" title="Volume" summary="s" table={table} height={100} empty={false} state="error" onRetry={() => (appels += 1)}>
        <svg />
      </AdminChartCard>,
    );
    await act(async () => host.querySelector<HTMLButtonElement>('[data-admin-retry]')?.click());
    expect(appels).toBe(1);
  });

  test('légende : visible dès DEUX séries, absente pour une seule', async () => {
    const un = await mount(
      <AdminChartCard language="fr" id="a" title="A" summary="s" table={table} height={10} empty={false} legend={[{ key: 'x', label: 'Texte', color: 'var(--ios-indigo-500)' }]}>
        <svg />
      </AdminChartCard>,
    );
    expect(un.querySelector('[data-admin-chart-legend]')).toBeNull();

    const deux = await mount(
      <AdminChartCard
        language="fr"
        id="b"
        title="B"
        summary="s"
        table={table}
        height={10}
        empty={false}
        legend={[
          { key: 'x', label: 'Texte', color: 'var(--ios-indigo-500)' },
          { key: 'y', label: 'Image', color: 'var(--ios-tile-voice)' },
        ]}
      >
        <svg />
      </AdminChartCard>,
    );
    expect(deux.querySelector('[data-admin-chart-legend]')?.getAttribute('aria-label')).toBe('Légende');
    expect([...deux.querySelectorAll('[data-admin-chart-legend] li')].map((li) => li.textContent)).toEqual(['Texte', 'Image']);
  });

  test('AdminChartTable seul : légende sr-only, valeurs formatées', async () => {
    const host = await mount(<AdminChartTable table={table} />);
    expect(host.querySelector('caption')?.className).toContain('sr-only');
    expect(host.querySelector('td')?.textContent).toBe('12');
  });

  test('les couleurs de catégories sont des jetons dans un ordre fixe, « Autres » à part', () => {
    expect([...ADMIN_SERIES_TOKENS]).toHaveLength(4);
    expect(ADMIN_SERIES_TOKENS[0]).toBe('--ios-indigo-500');
    expect(ADMIN_OTHERS_TOKEN).toBe('--ios-neutral-500');
  });
});

describe('AdminSparkline', () => {
  test('un tracé de 2 px, nommé par son étiquette', async () => {
    const host = await mount(<AdminSparkline values={[1, 3, 2]} label="Tendance : de 1 à 2" />);
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Tendance : de 1 à 2');
    expect(svg?.querySelector('path')?.getAttribute('stroke-width')).toBe('2');
    expect(svg?.querySelector('path')?.getAttribute('d')).toMatch(/^M/);
  });
});

describe('AdminTimelineChart', () => {
  const props = { language: 'fr', id: 'messages', title: 'Messages par jour', format: count, summary: 'Pic le mardi : 40' } as const;

  test('une série : une ligne de 2 px ET une aire à 12 % dessous', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('m', 'Messages', [10, 40, 25, 30, 12])]} />);
    const [aire, ligne] = [...host.querySelectorAll('[data-admin-series="m"] path')];
    expect(aire?.getAttribute('fill-opacity')).toBe('0.12');
    expect(ligne?.getAttribute('stroke-width')).toBe('2');
    expect(ligne?.getAttribute('stroke')).toBe('var(--ios-indigo-500)');
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('plusieurs séries : pas d’aire, une couleur par série dans l’ordre fixe, légende visible', async () => {
    const host = await mount(
      <AdminTimelineChart {...props} series={[serie('a', 'Envoyées', [1, 2, 3]), serie('b', 'Acceptées', [0, 1, 1]), serie('c', 'Refusées', [0, 0, 1])]} />,
    );
    expect(host.querySelectorAll('[data-admin-series] path')).toHaveLength(3);
    expect([...host.querySelectorAll('[data-admin-series] path')].map((p) => p.getAttribute('stroke'))).toEqual([
      'var(--ios-indigo-500)',
      'var(--ios-tile-voice)',
      'var(--ios-tile-photo)',
    ]);
    expect([...host.querySelectorAll('[data-admin-chart-legend] li')].map((li) => li.textContent)).toEqual(['Envoyées', 'Acceptées', 'Refusées']);
  });

  test('un seul axe : le maximum de graduation, deux libellés directs (début, fin)', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('m', 'Messages', [10, 40, 25, 30, 12])]} />);
    expect(host.querySelector('[data-admin-chart-max]')?.textContent).toBe('40');
    expect(host.textContent).toContain('lun.');
    expect(host.textContent).toContain('ven.');
  });

  test('l’axe du temps reste gauche → droite, même dans un document arabe', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('m', 'Messages', [1, 2])]} />);
    expect(host.querySelector('[data-admin-chart-body] > div')?.getAttribute('dir')).toBe('ltr');
  });

  test('le tableau porte les mêmes valeurs, par série', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('a', 'Envoyées', [1, 2]), serie('b', 'Acceptées', [0, 1])]} />);
    await act(async () => bouton(host)?.click());
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Libellé', 'Envoyées', 'Acceptées']);
    expect([...host.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent))).toEqual([
      ['lun.', '1', '0'],
      ['mar.', '2', '1'],
    ]);
  });

  test('infobulle au pointeur : la date et les valeurs survolées — pas au clavier', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('m', 'Messages', [10, 40, 25])]} />);
    const zone = host.querySelector<HTMLElement>('[data-admin-chart-body] > div');
    if (zone === null) throw new Error('zone de survol absente');
    Object.defineProperty(zone, 'getBoundingClientRect', { value: () => ({ left: 0, width: 200, top: 0, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) });

    await act(async () => {
      zone.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 100 }));
    });
    expect(host.querySelector('[data-admin-chart-tooltip]')?.textContent).toContain('mar.');
    expect(host.querySelector('[data-admin-chart-tooltip]')?.textContent).toContain('40');
    expect(host.querySelector('[data-admin-chart-tooltip]')?.getAttribute('aria-hidden')).toBe('true');

    await act(async () => {
      zone.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null }));
    });
    expect(host.querySelector('[data-admin-chart-tooltip]') === null).toBe(true);
  });

  test('sans point : l’état vide', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[serie('m', 'Messages', [])]} />);
    expect(host.querySelector('[data-admin-chart-empty]')).not.toBeNull();
  });

  test('l’état d’erreur passe jusqu’au cadre', async () => {
    const host = await mount(<AdminTimelineChart {...props} series={[]} state="error" onRetry={() => undefined} />);
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
  });
});

describe('AdminBarChart', () => {
  const data = [
    { key: 'a', label: 'Équipe produit', value: 40 },
    { key: 'b', label: 'Awa et Jean', value: 10 },
  ];
  const props = { language: 'fr', id: 'actives', title: 'Conversations actives', format: count, summary: 'Équipe produit en tête' } as const;

  test('horizontal : un nom, sa valeur, une barre proportionnelle ancrée au bord de départ', async () => {
    const host = await mount(<AdminBarChart {...props} data={data} />);
    const lignes = [...host.querySelectorAll('[data-admin-bar]')];
    expect(lignes.map((ligne) => ligne.textContent)).toEqual(['Équipe produit40', 'Awa et Jean10']);
    const largeurs = lignes.map((ligne) => ligne.querySelector<SVGRectElement>('rect')?.getAttribute('style') ?? '');
    expect(largeurs[0]).toContain('calc(100% + 4px)');
    expect(largeurs[1]).toContain('calc(25% + 4px)');
    expect(lignes[0]?.querySelector('rect')?.getAttribute('rx')).toBe('4');
    expect(lignes[0]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  test('une seule couleur : c’est la longueur qui parle', async () => {
    const host = await mount(<AdminBarChart {...props} data={data} />);
    expect([...host.querySelectorAll('rect')].map((r) => r.getAttribute('fill'))).toEqual(['var(--ios-indigo-500)', 'var(--ios-indigo-500)']);
  });

  test('vertical : des colonnes, le pied ancré, les étiquettes dessous', async () => {
    const host = await mount(<AdminBarChart {...props} data={data} orientation="vertical" />);
    const colonnes = [...host.querySelectorAll('[data-admin-bar]')];
    expect(colonnes).toHaveLength(2);
    expect(colonnes[0]?.querySelector('rect')?.getAttribute('y')).toBe('0');
    expect(colonnes[1]?.querySelector('rect')?.getAttribute('y')).toBe('105');
    expect(colonnes[0]?.textContent).toBe('Équipe produit');
  });

  test('un maximum nul ne divise pas par zéro', async () => {
    const host = await mount(<AdminBarChart {...props} data={[{ key: 'a', label: 'A', value: 0 }]} />);
    expect(host.querySelector('rect')?.getAttribute('style')).toContain('calc(0% + 4px)');
  });

  test('une ligne avec cible rend son nom en lien de 44 px', async () => {
    const { adminIdentityFixture } = await import('@/test-support/admin-assertions');
    const host = await mount(
      <AdminBarChart {...props} data={[{ key: 'a', label: 'Awa Diop', value: 3, target: { kind: 'section', section: 'users' } }]} />,
      adminIdentityFixture({ role: 'BIGBOSS' }),
    );
    expect(host.querySelector('[data-admin-bar="a"] a')?.getAttribute('href')).toBe('/admin/users');
  });

  test('vide : l’état vide', async () => {
    const host = await mount(<AdminBarChart {...props} data={[]} />);
    expect(host.querySelector('[data-admin-chart-empty]')).not.toBeNull();
  });
});

describe('AdminShareChart', () => {
  const parts = (n: number) => Array.from({ length: n }, (_, index) => ({ key: `k${index}`, label: `Catégorie ${index}`, value: 10 - index }));
  const props = { language: 'fr', id: 'types', title: 'Types de messages', format: count, summary: 'Texte en tête' } as const;

  test('barre empilée par défaut : un segment par catégorie, arrondi 4 px, séparé de 2 px de surface', async () => {
    const host = await mount(<AdminShareChart {...props} data={parts(3)} />);
    const segments = [...host.querySelectorAll('rect[data-admin-share]')];
    expect(segments).toHaveLength(3);
    expect(segments[0]?.getAttribute('rx')).toBe('4');
    expect(segments[0]?.getAttribute('stroke')).toBe('var(--color-ios-surface)');
    expect(segments[0]?.getAttribute('stroke-width')).toBe('2');
    expect(host.querySelector('svg')?.getAttribute('height')).toBe('12');
  });

  test('couleurs dans l’ordre fixe ; la cinquième catégorie et les suivantes se replient dans « Autres »', async () => {
    const host = await mount(<AdminShareChart {...props} data={parts(6)} />);
    const segments = [...host.querySelectorAll('rect[data-admin-share]')];
    expect(segments.map((s) => s.getAttribute('data-admin-share'))).toEqual(['k0', 'k1', 'k2', 'k3', 'others']);
    expect(segments.map((s) => s.getAttribute('fill'))).toEqual([
      'var(--ios-indigo-500)',
      'var(--ios-tile-voice)',
      'var(--ios-tile-photo)',
      'var(--ios-pinned)',
      'var(--ios-neutral-500)',
    ]);
    expect(host.textContent).toContain('Autres');
  });

  test('la légende dit chaque part : nom, valeur, pourcentage', async () => {
    const host = await mount(<AdminShareChart {...props} data={[{ key: 'a', label: 'Texte', value: 75 }, { key: 'b', label: 'Image', value: 25 }]} />);
    const lignes = [...host.querySelectorAll('ul li')].map((li) => (li.textContent ?? '').replace(/\s/g, ' '));
    expect(lignes).toEqual(['Texte7575 %', 'Image2525 %']);
  });

  test('anneau : des arcs, pour quatre parts ou moins ; au-delà, on revient à la barre', async () => {
    const donut = await mount(<AdminShareChart {...props} data={parts(3)} variant="donut" />);
    expect(donut.querySelectorAll('path[data-admin-share]')).toHaveLength(3);
    expect(donut.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');

    const barre = await mount(<AdminShareChart {...props} data={parts(6)} variant="donut" />);
    expect(barre.querySelectorAll('path[data-admin-share]')).toHaveLength(0);
    expect(barre.querySelectorAll('rect[data-admin-share]').length).toBeGreaterThan(0);
  });

  test('les couleurs d’ÉTAT sont réservées aux distributions d’état, et rien ne se replie', async () => {
    const etats = [
      { key: 'excellent', label: 'Excellente', value: 5 },
      { key: 'fair', label: 'Moyenne', value: 3 },
      { key: 'poor', label: 'Mauvaise', value: 2 },
      { key: 'good', label: 'Bonne', value: 4 },
      { key: 'x', label: 'Autre', value: 1 },
    ];
    const host = await mount(<AdminShareChart {...props} data={etats} statusTones={{ excellent: 'success', good: 'success', fair: 'warning', poor: 'danger' }} />);
    const segments = [...host.querySelectorAll('rect[data-admin-share]')];
    expect(segments).toHaveLength(5);
    expect(segments.map((s) => s.getAttribute('fill'))).toEqual([
      'var(--color-success)',
      'var(--color-warning)',
      'var(--color-danger)',
      'var(--color-success)',
      'var(--color-ios-ink-2)',
    ]);
  });

  test('le tableau porte une colonne « Part »', async () => {
    const host = await mount(<AdminShareChart {...props} data={[{ key: 'a', label: 'Texte', value: 1 }, { key: 'b', label: 'Image', value: 1 }]} />);
    await act(async () => bouton(host)?.click());
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Libellé', 'Valeur', 'Part']);
    expect((host.querySelector('tbody tr td:last-child')?.textContent ?? '').replace(/\s/g, ' ')).toBe('50 %');
  });

  test('un total nul : l’état vide, jamais un anneau fantôme', async () => {
    const host = await mount(<AdminShareChart {...props} data={[{ key: 'a', label: 'A', value: 0 }]} />);
    expect(host.querySelector('[data-admin-chart-empty]')).not.toBeNull();
  });
});
