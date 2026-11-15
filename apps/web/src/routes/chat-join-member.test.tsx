import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import type { ApiResult } from '@/lib/api/http';
import type { LinkInvitation } from '@/lib/api/link-join';
import { sessionStore } from '@/lib/api/session';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ChatJoin, type ChatJoinDeps } from './chat-join';

/**
 * `/chat/:link` — UN MEMBRE QUI ROUVRE L'ADRESSE D'INVITATION (#10282).
 *
 * La page lit l'invitation par une porte aveugle au compte : sans la CARTE du
 * lien (`viewer.isMember`), un membre se voyait proposer de rejoindre ce qu'il
 * a déjà rejoint. Il doit pouvoir l'OUVRIR ou la QUITTER — les gestes de la
 * carte de bulle et d'iOS. Le visiteur, le non-membre et `?mode=anonymous`
 * restent tels qu'ils étaient.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInviteCatalog('fr');
  ensureHappyDomRegistered({ url: 'http://localhost/chat/mshy_equipe_7f3a' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => {
    mounted?.root.unmount();
    sessionStore.getState().clearSession();
  });
  mounted?.container.remove();
  mounted = null;
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
});

const LINK = 'mshy_equipe_7f3a';
const CONVERSATION = 'c-deploiement';

const INVITATION: LinkInvitation = {
  linkId: LINK,
  title: 'Équipe déploiement',
  kind: 'group',
  inviter: { name: 'Awa Diallo', username: 'awa', avatar: null },
  message: null,
  group: { description: null, createdAt: null, avatar: null, banner: null },
  stats: { people: 248, languages: [] },
  limits: { expiresAt: null, maxUses: null, currentUses: 0 },
  readsHistory: false,
  guest: {
    allowed: true,
    nicknameRequired: true,
    emailRequired: false,
    birthdayRequired: false,
    languages: [],
    mayWrite: true,
    mayImages: true,
    mayFiles: false,
  },
};

const cardOf = (isMember: boolean): ConversationCard => ({
  kind: 'share-link',
  conversationId: isMember ? CONVERSATION : null,
  title: 'Équipe déploiement',
  description: null,
  avatarUrl: null,
  bannerUrl: null,
  conversationType: 'group',
  stats: { memberCount: 248, onlineCount: null, messageCount: null, languages: [] },
  viewer: { isMember, canJoin: !isMember, requiresAccount: false, canJoinAnonymously: !isMember },
  link: { identifier: LINK, isActive: true, expiresAt: null },
  inviter: null,
  inviteMessage: null,
});

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

type Recorded = { readonly cardLoads: string[]; readonly leaves: string[]; readonly left: string[]; readonly order: string[] };

function depsWith(overrides: Partial<ChatJoinDeps> = {}): { readonly deps: ChatJoinDeps; readonly recorded: Recorded } {
  const recorded: Recorded = { cardLoads: [], leaves: [], left: [], order: [] };
  const deps: ChatJoinDeps = {
    load: async () => ({ ok: true, data: INVITATION }),
    join: async () => ({ ok: true, data: { conversationId: CONVERSATION, alreadyMember: false } }),
    joinGuest: never,
    adoptGuest: () => undefined,
    adoptInterfaceLanguage: () => undefined,
    go: (url, replace) => {
      recorded.order.push(`go ${url} ${replace ? 'replace' : 'push'}`);
    },
    joined: () => undefined,
    expireSession: () => undefined,
    copyText: async () => 'copied',
    shareUrl: async () => 'partage',
    origin: () => 'https://meeshy.me',
    now: () => new Date('2026-09-24T12:00:00.000Z'),
    handoff: () => ({ getItem: () => null, removeItem: () => undefined }),
    cachedCard: () => undefined,
    loadCard: async (link) => {
      recorded.cardLoads.push(link);
      return { ok: true, data: cardOf(true) };
    },
    leave: async (conversationId) => {
      recorded.leaves.push(conversationId);
      return { ok: true, data: null };
    },
    left: (link, conversationId) => {
      recorded.left.push(`${link} ${conversationId}`);
    },
    ...overrides,
  };
  return { deps, recorded };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount(deps: ChatJoinDeps, anonymousRequested = false): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<ChatJoin link={LINK} deps={deps} anonymousRequested={anonymousRequested} />);
  });
  await settle();
  return container;
}

const signIn = () =>
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '', systemLanguage: 'fr' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });

const text = (el: Element | null) => (el?.textContent ?? '').replace(/[⁨⁩]/gu, '').replace(/\s+/gu, ' ').trim();
const actions = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-invite-primary-bar] a, [data-invite-primary-bar] button'), ...el.querySelectorAll('[data-invite-identity-switch] a')].map(text);
const openLink = (el: HTMLElement) => el.querySelector<HTMLAnchorElement>('[data-invite-member-open]');
const leaveButton = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('[data-invite-member-leave]');
const confirmButton = () => document.querySelector<HTMLButtonElement>('[data-confirm-dialog="invite-member-leave"] [data-confirm="confirm"]');

async function click(button: HTMLElement | null) {
  await act(async () => {
    button?.click();
  });
  await settle();
}

describe('un membre CONNECTÉ rouvre l’adresse d’invitation (#10282)', () => {
  test('il voit « Ouvrir la conversation » et « Quitter », jamais « Rejoindre » ni « Anonyme »', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const host = await mount(deps);
    expect(recorded.cardLoads).toEqual([LINK]);
    expect(actions(host)).toEqual(['Ouvrir la conversation', 'Quitter la conversation']);
    expect(new URL(openLink(host)?.getAttribute('href') ?? '', 'http://localhost').pathname).toBe(`/c/${CONVERSATION}`);
    expect(host.querySelector('[data-invite-join-account]')).toBeNull();
    expect(host.querySelector('[data-invite-anonymous-offer]')).toBeNull();
  });

  test('pendant que la carte se lit, ni « Rejoindre » ni « Ouvrir » : l’action attend', async () => {
    signIn();
    const { deps } = depsWith({ loadCard: never });
    const host = await mount(deps);
    expect(host.querySelector('[data-invite-join-account]')).toBeNull();
    expect(openLink(host)).toBeNull();
    expect(host.querySelector('[data-invite-member-pending]')?.getAttribute('aria-busy')).toBe('true');
  });

  test('une carte déjà en cache se peint tout de suite, sans attendre la lecture', async () => {
    signIn();
    const { deps } = depsWith({ cachedCard: () => cardOf(true), loadCard: never });
    const host = await mount(deps);
    expect(actions(host)).toEqual(['Ouvrir la conversation', 'Quitter la conversation']);
  });

  test('« Quitter » demande confirmation ; confirmé, le départ part et la page repropose Rejoindre', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const host = await mount(deps);
    await click(leaveButton(host));
    expect(recorded.leaves).toEqual([]);
    expect(text(document.querySelector('[data-confirm-dialog="invite-member-leave"]'))).toContain('Quitter « Équipe déploiement » ?');
    await click(confirmButton());
    expect(recorded.leaves).toEqual([CONVERSATION]);
    expect(recorded.left).toEqual([`${LINK} ${CONVERSATION}`]);
    expect(openLink(host)).toBeNull();
    expect(text(host.querySelector('[data-invite-join-account]'))).toBe('Rejoindre avec mon compte');
  });

  test('le départ est OPTIMISTE : Rejoindre revient avant la réponse, inerte le temps du départ', async () => {
    signIn();
    const { deps } = depsWith({ leave: never });
    const host = await mount(deps);
    await click(leaveButton(host));
    await click(confirmButton());
    expect(openLink(host)).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[data-invite-join-account]')?.disabled).toBe(true);
  });

  test('un départ REFUSÉ rend Ouvrir et Quitter, et le dit', async () => {
    signIn();
    const { deps, recorded } = depsWith({ leave: async () => ({ ok: false, status: 500, error: 'boom' }) });
    const host = await mount(deps);
    await click(leaveButton(host));
    await click(confirmButton());
    expect(recorded.left).toEqual([]);
    expect(actions(host)).toEqual(['Ouvrir la conversation', 'Quitter la conversation']);
    expect(text(host.querySelector('[data-invite-member-error]'))).toBe('Impossible de quitter la conversation. Réessaie.');
    expect(host.querySelector('[data-invite-member-error]')?.getAttribute('role')).toBe('alert');
  });

  test('« Annuler » ne fait rien partir', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const host = await mount(deps);
    await click(leaveButton(host));
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="invite-member-leave"] [data-confirm="cancel"]'));
    expect(recorded.leaves).toEqual([]);
    expect(actions(host)).toEqual(['Ouvrir la conversation', 'Quitter la conversation']);
  });
});

describe('ce qui ne change pas (#10282)', () => {
  test('un NON-membre connecté : « Rejoindre avec mon compte » et « Continuer en anonyme »', async () => {
    signIn();
    const { deps } = depsWith({ loadCard: async () => ({ ok: true, data: cardOf(false) }) });
    const host = await mount(deps);
    expect(actions(host)).toEqual(['Rejoindre avec mon compte', 'Continuer en anonyme']);
  });

  test('une carte ILLISIBLE retombe sur Rejoindre', async () => {
    signIn();
    const failed: ApiResult<ConversationCard | null> = { ok: false, status: 503, error: 'indisponible' };
    const { deps } = depsWith({ loadCard: async () => failed });
    const host = await mount(deps);
    expect(actions(host)).toEqual(['Rejoindre avec mon compte', 'Continuer en anonyme']);
  });

  test('un visiteur SANS session : la carte n’est pas lue, la page reste celle de l’invité', async () => {
    const { deps, recorded } = depsWith();
    const host = await mount(deps);
    expect(recorded.cardLoads).toEqual([]);
    expect(openLink(host)).toBeNull();
    expect(host.querySelector('[data-invite-sign-in]')).not.toBeNull();
  });

  test('`?mode=anonymous` : même membre, le compte a choisi l’anonyme — la carte n’est pas lue', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const host = await mount(deps, true);
    expect(recorded.cardLoads).toEqual([]);
    expect(openLink(host)).toBeNull();
    expect(host.querySelector('[data-invite-account-offer]')).not.toBeNull();
  });
});
