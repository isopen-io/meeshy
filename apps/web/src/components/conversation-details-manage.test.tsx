import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

import { CONVERSATIONS_QUERY_KEY, type ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { sessionStore } from '@/lib/api/session';
import type { Conversation, Participant } from '@/lib/api/types';
import { loadConversationManageCatalog } from '@/lib/i18n-conversation-manage-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationDetailsSheet } from './conversation-details-sheet';

/**
 * **LA FICHE D'UN GROUPE SE GÈRE DEPUIS LE WEB, COMME SUR iOS** (#10613, #7836)
 * — un administrateur change un rang, expulse, règle le groupe ; un simple
 * membre ne voit aucun de ces gestes ; chaque lecteur inscrit règle ses
 * propres options. Tout est vu À TRAVERS la feuille montée.
 */

const participant = (id: string, name: string, role = 'member'): Participant =>
  ({
    id: `p-${id}`,
    conversationId: 'c-groupe',
    userId: `u-${id}`,
    type: 'user',
    displayName: name,
    role,
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: `u-${id}`, username: id, displayName: name },
  }) as Participant;

const conversation = (overrides: Partial<Conversation> = {}): Conversation =>
  ({
    id: 'c-groupe',
    type: 'group',
    title: 'Équipe Lyon',
    description: 'On prépare le lancement',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    currentUserRole: 'admin',
    defaultWriteRole: 'everyone',
    isAnnouncementChannel: false,
    slowModeSeconds: 0,
    autoTranslateEnabled: true,
    participants: [participant('moi', 'Moi Même', 'admin'), participant('ali', 'Ali Ben'), participant('nour', 'Nour Haddad', 'moderator')],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    unreadCount: 0,
    ...overrides,
  }) as Conversation;

const wire = (p: Participant) => ({
  id: p.id,
  userId: p.userId,
  type: 'user',
  username: p.user?.username,
  displayName: p.displayName,
  avatar: null,
  conversationRole: p.role,
});

const MEMBERS = 'GET /api/v1/conversations/c-groupe/participants?limit=50';
const pagination = (count: number): PaginationMeta => Object.assign({ total: count, offset: 0, limit: 50, hasMore: false }, { nextCursor: null, totalCount: count });

const transportOf = (replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>) => {
  const calls: HttpRequest[] = [];
  const request = async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: true, data: {} };
  };
  const transport = Object.assign((req: HttpRequest) => request(req), { request }) as unknown as HttpTransport;
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls: () => calls };
};

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await Promise.all([loadInterfaceCatalog('fr'), loadConversationManageCatalog('fr'), loadRowMenuCatalog('fr')]);
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

const mount = async (
  c: Conversation,
  replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>> = {},
  focus?: 'invite' | 'members',
) => {
  const { deps, calls } = transportOf({ [MEMBERS]: { ok: true, data: c.participants.map(wire), pagination: pagination(c.participants.length) }, ...replies });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(CONVERSATIONS_QUERY_KEY, { pages: [{ conversations: [c] }], pageParams: [undefined] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationDetailsSheet conversation={c} title={c.title ?? ''} accent="#6366f1" viewerId="u-moi" deps={deps} origin="https://meeshy.me" onClose={() => {}} {...(focus === undefined ? {} : { focus })} />
      </QueryClientProvider>,
    );
  });
  await settle();
  return { calls, client };
};

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const click = (selector: string) => act(() => $(selector)?.click());
const typeInto = async (selector: string, value: string) => {
  const field = $(selector) as HTMLInputElement | HTMLTextAreaElement | null;
  await act(async () => {
    if (field === null) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const writes = (calls: () => HttpRequest[]) => calls().filter((call) => call.method !== 'GET');

describe('gérer les membres (#10613)', () => {
  test('un admin change le rang d’un membre : le rang se voit AVANT la réponse, la route part en minuscules', async () => {
    const { calls } = await mount(conversation(), { 'PATCH /api/v1/conversations/c-groupe/participants/u-ali/role': 'pending' });
    expect($('[data-member-manage="p-moi"]')).toBeNull();
    expect($('[data-member-manage="p-nour"]')).not.toBeNull();
    click('[data-member-manage="p-ali"]');
    const offered = [...document.querySelectorAll('[data-member-action]')].map((node) => node.getAttribute('data-member-action'));
    expect(offered).toEqual(['promote-moderator', 'expel', 'ban']);
    click('[data-member-action="promote-moderator"]');
    await settle();
    expect($('[data-conversation-member="p-ali"] [data-member-role]')?.textContent).toBe('Modérateur');
    expect(writes(calls)[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/conversations/c-groupe/participants/u-ali/role', body: { role: 'moderator' } });
  });

  test('le geste confirmé se dit', async () => {
    await mount(conversation());
    click('[data-member-manage="p-nour"]');
    click('[data-member-action="demote-member"]');
    await settle();
    expect($('[data-conversation-members-status]')?.textContent).toBe('Rôle mis à jour');
  });

  test('expulser demande confirmation, puis la rangée part avant la réponse', async () => {
    const { calls } = await mount(conversation(), { 'DELETE /api/v1/conversations/c-groupe/participants/u-ali': 'pending' });
    click('[data-member-manage="p-ali"]');
    click('[data-member-action="expel"]');
    expect($('[data-confirm-dialog="member-expel"]')?.textContent).toContain('Expulser Ali Ben ?');
    expect(writes(calls)).toEqual([]);
    click('[data-confirm-dialog="member-expel"] [data-confirm="confirm"]');
    await settle();
    expect($('[data-conversation-member="p-ali"]')).toBeNull();
    expect(writes(calls)[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/conversations/c-groupe/participants/u-ali' });
  });

  test('un refus remet la rangée et le dit', async () => {
    await mount(conversation(), { 'DELETE /api/v1/conversations/c-groupe/participants/u-ali': { ok: false, status: 403, error: 'non' } });
    click('[data-member-manage="p-ali"]');
    click('[data-member-action="expel"]');
    click('[data-confirm-dialog="member-expel"] [data-confirm="confirm"]');
    await settle();
    expect($('[data-conversation-member="p-ali"]')).not.toBeNull();
    expect($('[data-conversation-members-status]')?.textContent).toBe('Ce geste a été refusé.');
  });

  test('ajouter : on cherche, on choisit, UN appel porte le choix et la personne paraît aussitôt', async () => {
    const { calls } = await mount(conversation(), {
      'GET /api/v1/directory/people?q=zo&limit=20': { ok: true, data: [{ id: 'u-zoe', username: 'zoe', displayName: 'Zoé Martin', avatar: null }] },
      'POST /api/v1/conversations/c-groupe/participants': 'pending',
    });
    click('[data-conversation-members-add]');
    await settle();
    await typeInto('[data-add-members] input[type="search"]', 'zo');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    await settle();
    click('[data-add-member-candidate="u-zoe"]');
    expect($('[data-add-member-candidate="u-zoe"]')?.getAttribute('aria-checked')).toBe('true');
    expect($('[data-add-members-submit]')?.textContent).toBe('Ajouter 1 personne');
    click('[data-add-members-submit]');
    await settle();
    expect(writes(calls)[0]).toMatchObject({ method: 'POST', path: '/api/v1/conversations/c-groupe/participants', body: { userIds: ['u-zoe'] } });
    expect($('[data-conversation-member="pending-u-zoe"]')?.textContent).toContain('Zoé Martin');
  });

  test('ouverte pour « Inviter », la fiche ouvre d’office l’ajout de membres (revue #11211)', async () => {
    await mount(conversation(), {}, 'invite');
    await settle();
    expect($('[data-add-members]')).not.toBeNull();
  });

  test('ouverte sans intention, la fiche n’ouvre pas l’ajout', async () => {
    await mount(conversation());
    await settle();
    expect($('[data-add-members]')).toBeNull();
  });

  test('un simple membre ne voit aucun geste de gestion, ni ajout, ni réglages', async () => {
    await mount(conversation({ currentUserRole: 'member' }));
    expect(document.querySelectorAll('[data-member-manage]').length).toBe(0);
    expect($('[data-conversation-members-add]')).toBeNull();
    expect($('[data-conversation-settings]')).toBeNull();
  });

  test('la recherche filtre la liste', async () => {
    await mount(conversation());
    await typeInto('[data-conversation-members-search]', 'nour');
    const shown = [...document.querySelectorAll('[data-conversation-member]')].map((node) => node.getAttribute('data-conversation-member'));
    expect(shown).toEqual(['p-nour']);
  });
});

describe('les réglages du groupe (#7836)', () => {
  test('un modérateur règle l’identité mais ne voit pas les permissions', async () => {
    await mount(conversation({ currentUserRole: 'moderator' }));
    expect($('[data-conversation-settings]')).not.toBeNull();
    expect($('[data-conversation-announcement]')).toBeNull();
  });

  test('renommer : un seul PATCH avec le nouveau titre', async () => {
    const { calls } = await mount(conversation());
    expect(($('[data-conversation-settings-save]') as HTMLButtonElement).disabled).toBe(true);
    await typeInto('[data-conversation-settings-title]', 'Équipe Paris');
    click('[data-conversation-settings-save]');
    await settle();
    expect(writes(calls)[0]).toEqual({ method: 'PATCH', path: '/api/v1/conversations/c-groupe', body: { title: 'Équipe Paris' } });
    expect($('[data-conversation-settings-status]')?.textContent).toBe('Conversation mise à jour');
  });

  test('un admin bascule le mode annonce d’un geste', async () => {
    const { calls } = await mount(conversation());
    click('[data-conversation-announcement]');
    await settle();
    expect(writes(calls)[0]).toEqual({ method: 'PATCH', path: '/api/v1/conversations/c-groupe', body: { isAnnouncementChannel: true } });
  });

  test('« Créé le … » sous l’en-tête', async () => {
    await mount(conversation());
    expect($('[data-conversation-details-created]')?.textContent).toBe('Créé le 15 janvier 2026');
  });
});

describe('mes options (#7836)', () => {
  test('épingler depuis la feuille : le même geste que la liste', async () => {
    sessionStore.setState({
      session: { status: 'authenticated', user: { id: 'u-moi', username: 'moi', displayName: 'Moi Même' }, token: 'jwt', sessionToken: 's', expiresAt: Number.MAX_SAFE_INTEGER },
    } as Parameters<typeof sessionStore.setState>[0]);
    try {
      const { calls } = await mount(conversation({ currentUserRole: 'member' }));
      click('[data-conversation-option-pin]');
      expect($('[data-conversation-option-pin]')?.getAttribute('aria-checked')).toBe('true');
      await settle();
      expect(writes(calls)[0]).toMatchObject({ method: 'PUT', path: '/api/v1/user-preferences/conversations/c-groupe', body: { isPinned: true } });
    } finally {
      sessionStore.setState({ session: { status: 'anonymous' } });
    }
  });
});
