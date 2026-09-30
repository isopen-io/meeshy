import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { defineListSpec } from '@/lib/admin/list-state';
import { useAdminList } from '@/lib/admin/use-admin-list';
import type { AdminPage } from '@/lib/api/admin-page';
import type { ApiResult } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminEntityList } from './entity-list';
import { AdminEntityIdentity } from './entity-chip';

const { mount, mounter } = setupAdminKitTests();
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

type Row = { readonly id: string; readonly name: string; readonly status: string };

const IDS = Array.from({ length: 5 }, (_, index) => `64f1c2a9e8b7d6c5b4a3928${index}`);
const ROWS: readonly Row[] = IDS.map((id, index) => ({ id, name: `Personne ${index + 1}`, status: index % 2 === 0 ? 'a' : 'b' }));

const SPEC = defineListSpec({
  sortKeys: ['createdAt', 'name'],
  defaultSort: 'createdAt',
  ascendingFirst: ['name'],
  filters: { status: ['a', 'b'] },
  pageSizes: [2, 4],
});

type Script = {
  readonly handler?: (offset: number, limit: number, call: number) => Promise<ApiResult<AdminPage<Row>>> | ApiResult<AdminPage<Row>>;
};

const calls: { offset: number; limit: number; sort: string; order: string; status: string | undefined; q: string }[] = [];

const pageOf = (offset: number, limit: number): ApiResult<AdminPage<Row>> => ({
  ok: true,
  data: { rows: ROWS.slice(offset, offset + limit), total: ROWS.length, hasMore: offset + limit < ROWS.length },
});

function ListScreen({ script }: { readonly script: Script }) {
  const list = useAdminList<Row, 'createdAt' | 'name', 'status'>({
    spec: SPEC,
    queryKey: (address) => ['admin', 'probe', address],
    enabled: true,
    load: async (state) => {
      calls.push({ offset: state.offset, limit: state.limit, sort: state.sort, order: state.order, status: state.filters.status, q: state.q });
      return (script.handler ?? pageOf)(state.offset, state.limit, calls.length);
    },
  });
  return (
    <AdminEntityList
      language="fr"
      section="users"
      list={list}
      caption="Personnes"
      rowKey={(row) => row.id}
      rowTarget={(row) => ({ kind: 'entity', entity: 'user', id: row.id })}
      empty={{ title: 'Aucune personne', hint: 'Invitez-en une.' }}
      filteredEmpty={{ title: 'Aucun résultat pour ces filtres' }}
      columns={[
        { id: 'name', header: 'Nom', primary: true, sortKey: 'name', cell: (row) => <AdminEntityIdentity language="fr" entity={{ kind: 'user', id: row.id, label: row.name }} /> },
        { id: 'status', header: 'Statut', cell: (row) => (row.status === 'a' ? 'Actif' : 'Inactif') },
        { id: 'created', header: 'Création', sortKey: 'createdAt', align: 'end', priority: 3, cell: () => 'il y a 3 jours' },
      ]}
    />
  );
}

async function ouvrir(script: Script = {}, url = '/probe') {
  calls.length = 0;
  const { Router } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: () => <ListScreen script={script} /> }) } }, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-admin-list]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const rows = (host: ParentNode) => [...host.querySelectorAll('[data-admin-row]')].map((row) => row.getAttribute('data-admin-row'));
const click = (element: Element | null) => act(async () => (element as HTMLElement | null)?.click());

describe('AdminEntityList — lignes, liens, en-têtes', () => {
  test('une rangée par entité (ancre = sa clé), la colonne primaire en lien de 44 px vers sa fiche', async () => {
    const host = await ouvrir();
    expect(host.querySelector('[data-admin-list="users"]')).not.toBeNull();
    expect(rows(host)).toEqual([IDS[0], IDS[1], IDS[2], IDS[3], IDS[4]].slice(0, 2));
    const lien = host.querySelector('[data-admin-row] a');
    expect(lien?.getAttribute('href')).toBe(`/admin/users/${IDS[0]}`);
    expect((lien as HTMLElement | null)?.style.minHeight).toBe('44px');
    expect(lien?.textContent).toContain('Personne 1');
    expectNoRawIdentifiers(host);
  });

  test('seule la colonne primaire porte un lien ; les autres cellules sont du contenu', async () => {
    const host = await ouvrir();
    const premiere = host.querySelector('[data-admin-row]');
    expect(premiere?.querySelectorAll('a')).toHaveLength(1);
  });

  test('le tableau porte sa légende (lecteurs d’écran) et des en-têtes de colonnes', async () => {
    const host = await ouvrir();
    expect(host.querySelector('table caption')?.textContent).toBe('Personnes');
    expect([...host.querySelectorAll('thead th')].map((th) => th.textContent?.replace(/[▲▼↕\s]/g, ''))).toEqual(['Nom', 'Statut', 'Création']);
  });

  test('une colonne triable porte aria-sort ; la colonne du tri courant est annoncée', async () => {
    const host = await ouvrir();
    const entetes = [...host.querySelectorAll('thead th')];
    expect(entetes[0]?.getAttribute('aria-sort')).toBe('none');
    expect(entetes[1]?.hasAttribute('aria-sort')).toBe(false);
    expect(entetes[2]?.getAttribute('aria-sort')).toBe('descending');
  });

  test('trier réécrit l’adresse, relit la liste et annonce l’ordre', async () => {
    const host = await ouvrir();
    await click(host.querySelector('[data-admin-sort="name"]'));
    await mounter.settle();
    expect(window.location.search).toBe('?sort=name&order=asc');
    expect(calls[calls.length - 1]).toMatchObject({ sort: 'name', order: 'asc', offset: 0 });
    expect(host.querySelectorAll('thead th')[0]?.getAttribute('aria-sort')).toBe('ascending');
  });

  test('la priorité 3 ne s’affiche que dès lg ; les cartes sous md n’ont que priorités 1 et 2', async () => {
    const host = await ouvrir();
    expect(host.querySelectorAll('thead th')[2]?.className).toContain('hidden lg:table-cell');
    const carte = host.querySelector('[data-admin-card]');
    expect(carte?.querySelector('a')?.getAttribute('href')).toBe(`/admin/users/${IDS[0]}`);
    expect([...(carte?.querySelectorAll('dt') ?? [])].map((dt) => dt.textContent)).toEqual(['Statut']);
    expect(carte?.textContent).not.toContain('il y a 3 jours');
  });
});

describe('AdminEntityList — la pagination', () => {
  test('« Suivants » avance l’offset, la page précédente reste (atténuée) le temps du chargement', async () => {
    let liberer: () => void = () => undefined;
    const host = await ouvrir({
      handler: (offset, limit, call) =>
        call === 1
          ? pageOf(offset, limit)
          : new Promise((resolve) => {
              liberer = () => resolve(pageOf(offset, limit));
            }),
    });
    await click(host.querySelector('[data-admin-list-next]'));
    expect(window.location.search).toBe('?offset=2');
    expect(rows(host)).toEqual([IDS[0], IDS[1]]);
    expect(host.querySelector('tbody')?.getAttribute('aria-busy')).toBe('true');
    expect((host.querySelector('tbody') as HTMLElement | null)?.style.opacity).toBe('0.6');

    liberer();
    await mounter.settle();
    await mounter.settle();
    expect(rows(host)).toEqual([IDS[2], IDS[3]]);
    expect(host.querySelector('tbody')?.getAttribute('aria-busy')).toBe('false');
  });

  test('le pied dit l’étendue ; « Précédents » est éteint sur la première page', async () => {
    const host = await ouvrir();
    expect((host.querySelector('[data-admin-list-range]')?.textContent ?? '').replace(/\s/g, ' ')).toBe('1–2 sur 5');
    expect(host.querySelector<HTMLButtonElement>('[data-admin-list-prev]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[data-admin-list-next]')?.disabled).toBe(false);
  });
});

describe('AdminEntityList — les états dessinés', () => {
  test('squelette de six rangées tant que rien n’est arrivé — jamais un spinner', async () => {
    const host = await ouvrir({ handler: () => new Promise(() => undefined) });
    expect(host.querySelector('[data-admin-list-skeleton]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('[data-admin-list-skeleton] > div')).toHaveLength(6);
  });

  test('erreur sans données : « Réessayer » relit et la liste apparaît', async () => {
    let appels = 0;
    const host = await ouvrir({ handler: (offset, limit) => (++appels === 1 ? { ok: false, status: 500, error: 'boom' } : pageOf(offset, limit)) });
    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    await click(host.querySelector('[data-admin-retry]'));
    await mounter.settle();
    expect(rows(host)).toHaveLength(2);
  });

  test('un refus 403 se dit comme un refus, pas comme une panne', async () => {
    const host = await ouvrir({ handler: () => ({ ok: false, status: 403, error: 'Forbidden' }) });
    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('vide absolu : le titre et l’indication de l’appelant, aucun « Réinitialiser »', async () => {
    const host = await ouvrir({ handler: () => ({ ok: true, data: { rows: [], total: 0, hasMore: false } }) });
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucune personne');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Invitez-en une.');
    expect(host.querySelector('[data-admin-list-reset]')).toBeNull();
  });

  test('vide FILTRÉ : « Aucun résultat pour ces filtres » et « Réinitialiser » qui vide l’adresse', async () => {
    const host = await ouvrir({ handler: () => ({ ok: true, data: { rows: [], total: 0, hasMore: false } }) }, '/probe?status=b&q=zzz');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun résultat pour ces filtres');
    await click(host.querySelector('[data-admin-list-reset]'));
    expect(window.location.search).toBe('');
  });

  test('erreur AVEC données en cache : les données restent, un avis dit que la mise à jour a échoué', async () => {
    let appels = 0;
    const host = await ouvrir({ handler: (offset, limit) => (++appels === 1 ? pageOf(offset, limit) : { ok: false, status: 500, error: 'boom' }) });
    await act(async () => {
      await appQueryClient.invalidateQueries({ queryKey: ['admin', 'probe'] });
    });
    await mounter.settle();
    expect(rows(host)).toHaveLength(2);
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('La mise à jour a échoué');
    expect(host.querySelector('[data-admin-error]') === null).toBe(true);
  });
});

describe('AdminEntityList — filtre dans l’adresse', () => {
  test('un filtre de l’adresse part à la passerelle ; une valeur hors liste blanche est ignorée', async () => {
    await ouvrir({}, '/probe?status=b');
    expect(calls[0]?.status).toBe('b');
    mounter.unmountAll();
    await ouvrir({}, '/probe?status=ROOT');
    expect(calls[0]?.status).toBeUndefined();
  });
});
