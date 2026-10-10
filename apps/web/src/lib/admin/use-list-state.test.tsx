import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import { createRouter, navigate } from '@/lib/router';
import { setupAdminKitTests } from '@/test-support/admin-harness';
import { typeInto } from '@/test-support/act-mount';

import { USER_LIST_SPEC } from './user-list';
import { useAdminListState } from './use-list-state';

const { mount, mounter } = setupAdminKitTests();

function Probe() {
  const list = useAdminListState(USER_LIST_SPEC);
  return (
    <div>
      <input data-draft value={list.draft} onInput={(event) => list.setDraft(event.currentTarget.value)} />
      <output data-q>{list.state.q}</output>
      <output data-role>{list.state.filters.role ?? ''}</output>
    </div>
  );
}

async function open(url: string) {
  const { Router } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: () => <Probe /> }) } }, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-draft]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const wait = (milliseconds: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });

const draftOf = (host: ParentNode) => host.querySelector<HTMLInputElement>('[data-draft]');

/**
 * **LE BROUILLON DE RECHERCHE SUIT L'ADRESSE** — une navigation vers la même liste sans `?q=`
 * vidait l'adresse mais PAS le champ, et la pause d'écriture réécrivait l'ancienne recherche
 * 250 ms plus tard : ce qu'on venait de quitter revenait seul.
 */
describe('useAdminListState — le brouillon de recherche et l’adresse', () => {
  test('part de la requête de l’adresse', async () => {
    const host = await open('/probe?q=awa&role=ADMIN');
    expect(draftOf(host)?.value).toBe('awa');
  });

  test('une navigation vers la même liste SANS q vide le champ, et l’adresse reste sans q après la pause', async () => {
    const host = await open('/probe?q=awa&role=ADMIN');
    expect(draftOf(host)?.value).toBe('awa');

    await act(async () => navigate('/probe', true));
    await mounter.settle();
    expect(draftOf(host)?.value).toBe('');

    await wait(400);
    await mounter.settle();
    expect(window.location.search).not.toContain('q=');
    expect(host.querySelector('[data-q]')?.textContent).toBe('');
    expect(draftOf(host)?.value).toBe('');
  });

  test('une navigation vers une AUTRE requête la reprend dans le champ', async () => {
    const host = await open('/probe?q=awa');
    await act(async () => navigate('/probe?q=jean&role=USER', true));
    await mounter.settle();

    expect(draftOf(host)?.value).toBe('jean');
    await wait(400);
    expect(window.location.search).toContain('q=jean');
  });

  test('ce qu’on tape s’écrit dans l’adresse après la pause — et n’est PAS repris comme une navigation extérieure', async () => {
    const host = await open('/probe');
    typeInto(draftOf(host), 'awa');
    await mounter.settle();
    expect(window.location.search).not.toContain('q=');

    await wait(400);
    await mounter.settle();
    expect(window.location.search).toContain('q=awa');
    expect(draftOf(host)?.value).toBe('awa');

    typeInto(draftOf(host), 'awan');
    await mounter.settle();
    expect(draftOf(host)?.value).toBe('awan');
    await wait(400);
    await mounter.settle();
    expect(window.location.search).toContain('q=awan');
  });
});
