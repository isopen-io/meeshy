import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { fixtureCommunity } from '@/lib/api/fixtures-communities';
import { communityMembersQueryKey, type CommunityMember, type CommunityMemberPage } from '@/lib/api/community-members';
import type { HttpTransport } from '@/lib/api/http';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadCommunityMembershipCatalog } from '@/lib/i18n-community-membership-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommunityInviteSheet } from './community-invite';

/**
 * LA FEUILLE « INVITER » (#6376) — les amis d'abord, une personne déjà membre
 * ne se choisit pas, et l'invitation choisie paraît dans les membres.
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

const row = (userId: string): CommunityMember => ({ id: `r-${userId}`, userId, role: 'member', name: userId, username: userId, avatar: null, online: false });

async function mountSheet({ members }: { readonly members: readonly CommunityMember[] }) {
  const community = fixtureCommunity('m-polyglottes');
  if (community === null) throw new Error('fixture absente');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey(community.id), {
    pages: [{ members, nextOffset: null }],
    pageParams: [0],
  });
  const deps = { source: 'fixtures' as const, transport: {} as HttpTransport, queryClient, isOnline: () => true };
  const done: string[] = [];
  const host = await mounter.mount(
    <CommunityInviteSheet community={community} viewerId="u-viewer" deps={deps} language="fr" onClose={() => undefined} onDone={(status) => done.push(status)} />,
  );
  await mounter.settle();
  const rows = () => queryClient.getQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey(community.id))?.pages.flatMap((page) => page.members) ?? [];
  return { host, done, rows };
}

const candidate = (userId: string) => document.querySelector<HTMLButtonElement>(`[data-community-invite-candidate="${userId}"]`);

describe('CommunityInviteSheet', () => {
  test('les amis sont proposés avant toute frappe', async () => {
    await mountSheet({ members: [] });
    expect(candidate('u-bruno')).not.toBeNull();
    expect(document.body.textContent).toContain('Amis');
  });

  test('une personne déjà membre est dite telle et ne se choisit pas', async () => {
    await mountSheet({ members: [row('u-bruno')] });
    expect(candidate('u-bruno')?.disabled).toBe(true);
    expect(candidate('u-bruno')?.textContent).toContain('Déjà membre');
  });

  test('choisir puis inviter : la personne paraît dans les membres et l’issue se dit', async () => {
    const { done, rows } = await mountSheet({ members: [] });
    const submit = () => document.querySelector<HTMLButtonElement>('[data-community-invite-submit]');
    expect(submit()?.disabled).toBe(true);
    await mounter.click(candidate('u-bruno'));
    expect(candidate('u-bruno')?.getAttribute('aria-checked')).toBe('true');
    expect(submit()?.textContent).toBe('Inviter 1 personne');
    await mounter.click(submit());
    await mounter.settle();
    expect(rows().map((member) => member.userId)).toEqual(['u-bruno']);
    expect(done).toEqual(['1 personne a rejoint la communauté.']);
  });
});
