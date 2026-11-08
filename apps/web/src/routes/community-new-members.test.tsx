import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PersonSummary } from '@/lib/api/friend-requests';
import type { HttpTransport } from '@/lib/api/http';
import { handInviteStatus, inviteStatusOf, takeInviteStatus } from '@/lib/communities/invite-status';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { createActMounter, typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommunityNewMembers } from './community-new-members';

/**
 * « AJOUTER DES MEMBRES » À LA CRÉATION (#6376) — rien avant la première
 * lettre, les amis répondent dès elle, on coche puis on retire d'un geste, et
 * le détail ouvert dit une fois ce que l'invitation a donné.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounter = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadCommunityMembershipCatalog('fr');
});

afterEach(() => mounter.unmountAll());

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

function Host({ seen }: { readonly seen: (ids: readonly string[]) => void }) {
  const queryClient = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))[0];
  const deps = { source: 'fixtures' as const, transport: {} as HttpTransport, queryClient, isOnline: () => true };
  const [chosen, setChosen] = useState<ReadonlyMap<string, PersonSummary>>(new Map());
  seen([...chosen.keys()]);
  const toggle = (person: PersonSummary) =>
    setChosen((current) => {
      const next = new Map(current);
      if (next.has(person.id)) next.delete(person.id);
      else next.set(person.id, person);
      return next;
    });
  return <CommunityNewMembers deps={deps} language="fr" chosen={chosen} onToggle={toggle} />;
}

async function mountHost() {
  const chosen: { current: readonly string[] } = { current: [] };
  const host = await mounter.mount(<Host seen={(ids) => (chosen.current = ids)} />);
  return { host, chosen };
}

const candidate = (userId: string) => document.querySelector<HTMLButtonElement>(`[data-community-new-members-candidate="${userId}"]`);
const chip = (userId: string) => document.querySelector<HTMLButtonElement>(`[data-community-new-members-chosen="${userId}"]`);

describe('ajouter des membres à la création', () => {
  test('la section se nomme et ne propose personne avant la première lettre (comme iOS)', async () => {
    const { host } = await mountHost();
    expect(host.querySelector('h2')?.textContent).toBe('Ajouter des membres');
    expect(host.querySelector<HTMLInputElement>('[data-community-new-members-search]')?.placeholder).toBe('Rechercher par nom ou nom d’utilisateur…');
    expect(host.querySelector('[data-community-new-members-candidate]')).toBeNull();
  });

  test('dès une lettre, les amis répondent ; cocher choisit, la pastille retire', async () => {
    const { host, chosen } = await mountHost();
    typeInto(host.querySelector<HTMLInputElement>('[data-community-new-members-search]'), 'b');
    await mounter.settle();
    expect(candidate('u-bruno')?.getAttribute('aria-checked')).toBe('false');
    await mounter.click(candidate('u-bruno'));
    expect(chosen.current).toEqual(['u-bruno']);
    expect(candidate('u-bruno')?.getAttribute('aria-checked')).toBe('true');
    expect(chip('u-bruno')?.getAttribute('aria-label')).toBe('Retirer Bruno Laurent');
    await mounter.click(chip('u-bruno'));
    expect(chosen.current).toEqual([]);
    expect(chip('u-bruno')).toBeNull();
  });

  test('une recherche sans réponse le dit', async () => {
    const { host } = await mountHost();
    typeInto(host.querySelector<HTMLInputElement>('[data-community-new-members-search]'), 'zzzz');
    await mounter.settle();
    expect(host.querySelector('[data-community-new-members-empty]')?.textContent).toMatch(/Aucune personne trouvée|Recherche…/);
  });
});

describe('ce que la création remet au détail', () => {
  test('la phrase de l’invitation est remise UNE fois, puis oubliée', () => {
    handInviteStatus('c-new', inviteStatusOf('fr', { status: 'done', invited: 2, already: 0, refused: 1, failed: 0 }));
    expect(takeInviteStatus('c-new')).toBe('2 personnes ont rejoint la communauté. Certaines personnes n’ont pas pu être ajoutées.');
    expect(takeInviteStatus('c-new')).toBeNull();
  });
});

