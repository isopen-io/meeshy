import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import type { AdminDeps } from '@/lib/api/admin';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { resultatServi } from '@/test-support/served-pagination';
import { routedTransport } from '@/test-support/routed-transport';
import { adminIdentityFixture } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { useCommunityMembersList, withoutMembersList } from './community-members-list';

/**
 * LA LISTE DES MEMBRES D'UNE COMMUNAUTÉ (#8876) — une liste qui vit DANS la
 * fiche, sous `?tab=members`. `useAdminListState` (le kit) réécrit l'adresse
 * ENTIÈRE à partir de ses seuls paramètres : y monter la liste ferait perdre
 * l'onglet au premier tri. Cette liste-ci réécrit ses clés et GARDE les autres.
 */
const { mount, mounter } = setupAdminKitTests();
const ID = (n: number) => `64f1c2a9e8b7d6c5b4a3928${n}`;
const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const member = (n: number, name: string) => ({
  id: ID(n),
  role: 'member',
  joinedAt: '2026-08-05T10:00:00.000Z',
  isActive: true,
  leftAt: null,
  user: { id: ID(n + 1), username: name.toLowerCase(), displayName: name, avatar: null },
});

function Probe({ deps }: { readonly deps: AdminDeps }) {
  const list = useCommunityMembersList({ communityId: ID(3), deps, enabled: true });
  return (
    <div>
      <p data-rows>{(list.query.data?.rows ?? []).map((row) => row.user.displayName).join(',')}</p>
      <p data-draft>{list.draft}</p>
      <button type="button" data-role onClick={() => list.filter('role', 'moderator')} />
      <button type="button" data-page onClick={() => list.page({ offset: 20 })} />
      <button type="button" data-reset onClick={list.reset} />
      <input data-q value={list.draft} onInput={(event) => list.setDraft(event.currentTarget.value)} onChange={() => undefined} />
    </div>
  );
}

async function ouvrir(url: string) {
  const gateway = routedTransport(() => resultatServi({ success: true, data: [member(8, 'Jean'), member(6, 'Awa')], pagination: { total: 60, offset: 0, limit: 20, hasMore: true } }));
  const deps: AdminDeps = { source: 'gateway', transport: gateway.transport };
  const { Router } = createRouter({ probe: { pattern: '/probe', screen: async () => ({ default: () => <Probe deps={deps} /> }) } }, () => <p>absent</p>);
  navigate(url, true);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 30 && host.querySelector('[data-rows]') === null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return { host, calls: gateway.calls };
}

const click = (element: Element | null) => act(async () => (element as HTMLElement | null)?.click());
const query = () => Object.fromEntries(new URLSearchParams(window.location.search));

describe('useCommunityMembersList', () => {
  test('lit son état dans l’adresse et interroge les membres de SA communauté', async () => {
    const { host, calls } = await ouvrir('/probe?tab=members&role=admin&isActive=true&q=jean&offset=20');
    expect(host.querySelector('[data-rows]')?.textContent).toBe('Jean,Awa');
    const call = calls()[0];
    expect(call?.path.startsWith(`/api/v1/admin/communities/${ID(3)}/members?`)).toBe(true);
    expect(Object.fromEntries(new URL(`http://x${call?.path ?? ''}`).searchParams)).toEqual({ offset: '20', limit: '20', search: 'jean', role: 'admin', isActive: 'true' });
  });

  test('un filtre réécrit l’adresse, remet la page à zéro et GARDE l’onglet', async () => {
    const { host } = await ouvrir('/probe?tab=members&offset=20');
    await click(host.querySelector('[data-role]'));
    await mounter.settle();
    expect(query()).toEqual({ tab: 'members', role: 'moderator' });
  });

  test('changer de page garde l’onglet et les filtres', async () => {
    const { host } = await ouvrir('/probe?tab=members&role=admin');
    await click(host.querySelector('[data-page]'));
    await mounter.settle();
    expect(query()).toEqual({ tab: 'members', role: 'admin', offset: '20' });
  });

  test('« Réinitialiser » vide la liste et le brouillon, mais pas l’onglet', async () => {
    const { host } = await ouvrir('/probe?tab=members&role=admin&q=jean&offset=20');
    await click(host.querySelector('[data-reset]'));
    await mounter.settle();
    expect(query()).toEqual({ tab: 'members' });
    expect(host.querySelector('[data-draft]')?.textContent).toBe('');
  });

  test('la recherche s’écrit dans l’adresse après une courte pause, onglet gardé', async () => {
    const { host } = await ouvrir('/probe?tab=members');
    mounter.type(host, '[data-q]', 'awa');
    expect(query()).toEqual({ tab: 'members' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await mounter.settle();
    expect(query()).toEqual({ tab: 'members', q: 'awa' });
  });

  test('une valeur hors liste blanche est ignorée, jamais transmise', async () => {
    const { calls } = await ouvrir('/probe?tab=members&role=owner');
    expect(new URL(`http://x${calls()[0]?.path ?? ''}`).searchParams.get('role')).toBeNull();
    appQueryClient.clear();
  });
});

describe('withoutMembersList — l’adresse d’« Aperçu »', () => {
  test('retire l’onglet et tous les réglages de la liste des membres', () => {
    const cleaned = withoutMembersList(new URLSearchParams('tab=members&role=admin&isActive=false&q=jean&offset=20&limit=50&sort=joinedAt&order=asc'));
    expect(cleaned.toString()).toBe('');
  });

  test('garde ce qui n’est pas à elle — un lien partagé y aurait pu ajouter autre chose', () => {
    expect(withoutMembersList(new URLSearchParams('tab=members&utm=mail&role=admin')).toString()).toBe('utm=mail');
  });
});
