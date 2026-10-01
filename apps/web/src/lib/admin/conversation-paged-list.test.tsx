import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { AdminPage } from '@/lib/api/admin-page';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { useLocalAdminList, type LocalListState } from './conversation-paged-list';

/**
 * **UNE LISTE PAGINÉE QUI VIT DANS L'ÉCRAN** (#8876) — la manette de
 * `useAdminList` sans l'adresse : page et taille, filtres qui remettent à la
 * première page, recherche posée après une pause, « Réinitialiser » qui défait
 * tout, et la page précédente gardée (atténuée) pendant qu'une autre charge.
 */
const { mount, mounter } = setupAdminKitTests();

type Call = { readonly offset: number; readonly limit: number; readonly q: string; readonly filters: Readonly<Record<string, string | undefined>> };

function harness(calls: Call[]) {
  function Probe() {
    const list = useLocalAdminList<{ readonly id: string }, 'kind'>({
      queryKey: (state: LocalListState<'kind'>) => ['local-list-test', state.offset, state.limit, state.q, state.filters],
      load: async (state) => {
        calls.push({ offset: state.offset, limit: state.limit, q: state.q, filters: state.filters });
        const page: AdminPage<{ readonly id: string }> = { rows: [{ id: `r${state.offset}` }], total: 100, hasMore: true };
        return { ok: true, data: page };
      },
      pageSizes: [20, 50],
    });
    return (
      <div>
        <p data-rows>{list.query.data?.rows.map((row) => row.id).join(',') ?? ''}</p>
        <p data-state>{JSON.stringify({ offset: list.state.offset, limit: list.state.limit, q: list.state.q, filters: list.state.filters })}</p>
        <input data-draft value={list.draft} onInput={(event) => list.setDraft(event.currentTarget.value)} onChange={() => undefined} />
        <button type="button" data-next onClick={() => list.page({ offset: list.state.offset + list.state.limit })} />
        <button type="button" data-size onClick={() => list.page({ limit: 50 })} />
        <button type="button" data-bad-size onClick={() => list.page({ limit: 7 })} />
        <button type="button" data-filter onClick={() => list.filter('kind', 'group')} />
        <button type="button" data-unfilter onClick={() => list.filter('kind', null)} />
        <button type="button" data-reset onClick={list.reset} />
      </div>
    );
  }
  return Probe;
}

const stateOf = (host: HTMLElement): { offset: number; limit: number; q: string; filters: Record<string, string> } =>
  JSON.parse(host.querySelector('[data-state]')?.textContent ?? '{}');

describe('la manette locale', () => {
  test('charge la première page, vingt lignes par défaut', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);

    expect(calls).toEqual([{ offset: 0, limit: 20, q: '', filters: {} }]);
    expect(host.querySelector('[data-rows]')?.textContent).toBe('r0');
  });

  test('« Suivants » charge la page d’après', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);

    await mounter.click(host.querySelector('[data-next]'));

    expect(calls.at(-1)).toMatchObject({ offset: 20, limit: 20 });
    expect(host.querySelector('[data-rows]')?.textContent).toBe('r20');
  });

  test('changer la taille revient à la première page ; une taille inconnue est ignorée', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);
    await mounter.click(host.querySelector('[data-next]'));

    await mounter.click(host.querySelector('[data-bad-size]'));
    expect(stateOf(host)).toMatchObject({ offset: 20, limit: 20 });

    await mounter.click(host.querySelector('[data-size]'));
    expect(stateOf(host)).toMatchObject({ offset: 0, limit: 50 });
  });

  test('un filtre remet à la première page, et `null` le retire', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);
    await mounter.click(host.querySelector('[data-next]'));

    await mounter.click(host.querySelector('[data-filter]'));
    expect(stateOf(host)).toMatchObject({ offset: 0, filters: { kind: 'group' } });
    expect(calls.at(-1)?.filters).toEqual({ kind: 'group' });

    await mounter.click(host.querySelector('[data-unfilter]'));
    expect(stateOf(host).filters).toEqual({});
  });

  test('la recherche n’est écrite qu’après une pause, nettoyée, et remet à la première page', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);
    await mounter.click(host.querySelector('[data-next]'));

    mounter.type(host, '[data-draft]', '  Famille ');
    expect(stateOf(host).q).toBe('');

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await mounter.settle();
    await mounter.settle();

    expect(stateOf(host)).toMatchObject({ q: 'Famille', offset: 0 });
    expect(calls.at(-1)).toMatchObject({ q: 'Famille', offset: 0 });
  });

  test('« Réinitialiser » défait recherche, filtres et page', async () => {
    const calls: Call[] = [];
    const Probe = harness(calls);
    const host = await mount(<Probe />);
    await mounter.click(host.querySelector('[data-filter]'));
    await mounter.click(host.querySelector('[data-next]'));

    await mounter.click(host.querySelector('[data-reset]'));

    expect(stateOf(host)).toEqual({ offset: 0, limit: 20, q: '', filters: {} });
  });
});
