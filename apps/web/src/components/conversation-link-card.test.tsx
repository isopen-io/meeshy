import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { conversationCardQueryKey } from '@/lib/api/conversation-card';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { attachmentSrc } from '@/lib/api/media-url';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { ConversationLinkTarget } from '@/lib/links/conversation-link';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationLinkCard } from './conversation-link-card';

/**
 * **LA CARTE DE CONVERSATION DANS UNE BULLE (#8099).**
 *
 * Directive porteur 2026-09-26 : une belle carte — citation de l'invitation,
 * bannière et avatar, titre, description courte, statistiques — puis
 * « Rejoindre » pleine largeur, ou « Rejoindre en anonyme | Rejoindre »,
 * ou « Quitter | Ouvrir » quand on en fait déjà partie, Quitter EN PREMIER.
 *
 * Les témoins lisent des TEXTES du catalogue anglais (jamais des clés) et
 * jouent les gestes jusqu'à la REQUÊTE qui part : un bouton dont le geste
 * n'envoie rien serait un contrôle qui ment (loi 4).
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('en');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const SHARE: ConversationLinkTarget = { kind: 'share-link', identifier: 'mshy_beta' };
const DIRECT: ConversationLinkTarget = { kind: 'direct', identifier: 'c-beta' };

const card = (overrides: Partial<ConversationCard> = {}): ConversationCard => ({
  kind: 'share-link',
  conversationId: null,
  title: 'Beta testers',
  description: 'A group to test things',
  avatarUrl: null,
  bannerUrl: null,
  conversationType: 'group',
  stats: { memberCount: 7, onlineCount: null, messageCount: 42, languages: ['fr', 'en'] },
  viewer: { isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: true },
  link: { identifier: 'mshy_beta', isActive: true, expiresAt: null },
  inviter: { displayName: 'Alice Martin', username: 'alice', avatarUrl: null },
  inviteMessage: 'Come test the beta with us',
  ...overrides,
});

type Reply = ApiResult<unknown> | 'pending';

const transportOf = (replies: Readonly<Record<string, Reply>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'never' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: false, status: 404, error: 'not found' };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, calls: () => calls };
};

type Mounted = { readonly root: Root; readonly host: HTMLElement; readonly client: QueryClient };
const mounted: Mounted[] = [];

afterEach(() => {
  mounted.splice(0).forEach(({ root, host }) => {
    act(() => root.unmount());
    host.remove();
  });
});

const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

const mount = async (params: {
  readonly target: ConversationLinkTarget;
  readonly replies?: Readonly<Record<string, Reply>>;
  readonly seed?: ConversationCard | null;
  readonly signedIn?: boolean;
}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (params.seed !== undefined) client.setQueryData(conversationCardQueryKey(params.target), params.seed);
  const { deps, calls } = transportOf(params.replies ?? {});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host, client });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationLinkCard
          target={params.target}
          deps={deps}
          language="en"
          signedIn={params.signedIn ?? true}
          accountLanguage="fr"
        />
      </QueryClientProvider>,
    );
  });
  await settle();
  return { host, calls, client };
};

const buttons = (host: HTMLElement) => [...host.querySelectorAll('button, a')].map((element) => element.textContent?.trim() ?? '');

const click = async (element: Element | null | undefined) => {
  if (!element) throw new Error('élément absent');
  await act(async () => {
    (element as HTMLElement).click();
  });
  await settle();
};

const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('button, a')].find((element) => element.textContent?.trim() === text);

describe('ConversationLinkCard — états', () => {
  test('squelette pendant le premier chargement, annoncé au lecteur d’écran', async () => {
    const { host } = await mount({ target: SHARE, replies: { 'GET /api/v1/links/mshy_beta/card': 'pending' } });
    expect(host.querySelector('[data-conversation-card="loading"]')).not.toBeNull();
    expect(host.querySelector('[aria-busy="true"]')?.getAttribute('aria-label')).toBe('Loading the conversation');
  });

  test('une carte en cache se peint sans squelette', async () => {
    const { host } = await mount({ target: SHARE, seed: card(), replies: { 'GET /api/v1/links/mshy_beta/card': 'pending' } });
    expect(host.querySelector('[data-conversation-card="loading"]')).toBeNull();
    expect(host.textContent).toContain('Beta testers');
  });

  test('lien de partage : citation de l’inviteur AVANT la carte du groupe, statistiques et langues', async () => {
    const { host } = await mount({ target: SHARE, seed: card() });
    const text = host.textContent ?? '';
    expect(text).toContain('Alice Martin');
    expect(text).toContain('invites you to join this conversation');
    expect(text.indexOf('Come test the beta with us')).toBeLessThan(text.indexOf('Beta testers'));
    expect(text).toContain('7 members');
    expect(text).toContain('42 messages');
    expect([...host.querySelectorAll('[data-card-language]')].map((pill) => pill.textContent)).toEqual(['FR', 'EN']);
  });

  test('lien expiré : carte grisée « Link expired », aucune action', async () => {
    const expired = card({
      link: { identifier: 'mshy_beta', isActive: false, expiresAt: null },
      viewer: { isMember: false, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
      description: null,
      inviter: null,
      inviteMessage: null,
      stats: { memberCount: 0, onlineCount: null, messageCount: null, languages: [] },
    });
    const { host } = await mount({ target: SHARE, seed: expired });
    expect(host.textContent).toContain('Link expired');
    expect(host.querySelectorAll('button')).toHaveLength(0);
  });

  test('lien direct d’un non-membre (404) : « Private conversation », aucune action', async () => {
    const { host } = await mount({ target: DIRECT });
    expect(host.textContent).toContain('Private conversation');
    expect(host.querySelectorAll('button, a')).toHaveLength(0);
  });

  test('erreur réseau sans cache : message et « Retry » qui relance la lecture', async () => {
    const { host, calls } = await mount({ target: SHARE, replies: { 'GET /api/v1/links/mshy_beta/card': { ok: false, status: 0, error: 'offline' } } });
    expect(host.textContent).toContain('Could not load this conversation');
    await click(byText(host, 'Retry'));
    expect(calls().filter((call) => call.path === '/api/v1/links/mshy_beta/card')).toHaveLength(2);
  });
});

describe('ConversationLinkCard — actions', () => {
  test('non-membre connecté : « Join » seul, pleine largeur', async () => {
    const { host } = await mount({ target: SHARE, seed: card() });
    expect(buttons(host)).toEqual(['Join']);
    expect(byText(host, 'Join')?.getAttribute('data-full-width')).toBe('true');
  });

  test('visiteur sans compte, lien qui l’accepte : « Join anonymously » puis « Join »', async () => {
    const { host } = await mount({ target: SHARE, seed: card(), signedIn: false });
    expect(buttons(host)).toEqual(['Join anonymously', 'Join']);
    expect(byText(host, 'Join anonymously')?.getAttribute('href')).toBe('/chat/mshy_beta');
    expect(byText(host, 'Join')?.getAttribute('href')).toBe('/login?next=%2Fchat%2Fmshy_beta');
  });

  test('visiteur sans compte, lien qui exige un compte : « Join » seul', async () => {
    const accountOnly = card({ viewer: { isMember: false, canJoin: true, requiresAccount: true, canJoinAnonymously: false } });
    const { host } = await mount({ target: SHARE, seed: accountOnly, signedIn: false });
    expect(buttons(host)).toEqual(['Join']);
  });

  test('membre : « Leave » EN PREMIER, puis « Open » vers le fil', async () => {
    const member = card({
      conversationId: 'c-beta',
      viewer: { isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
    });
    const { host } = await mount({ target: SHARE, seed: member });
    expect(buttons(host)).toEqual(['Leave', 'Open']);
    expect(byText(host, 'Open')?.getAttribute('href')).toBe('/c/c-beta');
  });

  test('« Join » bascule la carte en membre AVANT la réponse, puis appelle la porte canonique', async () => {
    const { host, calls } = await mount({
      target: SHARE,
      seed: card(),
      replies: { 'POST /api/v1/links/mshy_beta/members': 'pending' },
    });
    await click(byText(host, 'Join'));
    expect(calls().some((call) => call.method === 'POST' && call.path === '/api/v1/links/mshy_beta/members')).toBe(true);
    expect(calls().find((call) => call.method === 'POST')?.body).toEqual({ language: 'fr' });
    expect(buttons(host)).toEqual(['Leave', 'Open']);
  });

  test('une jonction refusée revient en arrière et le dit', async () => {
    const { host } = await mount({
      target: SHARE,
      seed: card(),
      replies: { 'POST /api/v1/links/mshy_beta/members': { ok: false, status: 500, error: 'boom' } },
    });
    await click(byText(host, 'Join'));
    expect(buttons(host)).toEqual(['Join']);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Could not join. Try again.');
  });

  test('« Leave » demande confirmation, puis part par la route de départ', async () => {
    const member = card({
      conversationId: 'c-beta',
      viewer: { isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
    });
    const { host, calls } = await mount({
      target: SHARE,
      seed: member,
      replies: {
        'POST /api/v1/conversations/c-beta/leave': { ok: true, data: { conversationId: 'c-beta' } },
        'GET /api/v1/links/mshy_beta/card': { ok: true, data: card() },
      },
    });
    await click(byText(host, 'Leave'));
    expect(calls().some((call) => call.method === 'POST')).toBe(false);
    const dialog = document.querySelector('[data-confirm-dialog="conversation-card-leave"]');
    expect(dialog?.textContent).toContain('Leave “Beta testers”?');
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Leave');
    await click(confirm);
    expect(calls().some((call) => call.method === 'POST' && call.path === '/api/v1/conversations/c-beta/leave')).toBe(true);
    expect(buttons(host)).toEqual(['Join']);
  });
});

/**
 * **LES PORTRAITS DE LA CARTE (#8137).** La passerelle sert `inviter.avatarUrl`,
 * `avatarUrl` et `bannerUrl` comme les autres portraits : une CLÉ de stockage
 * (`avatars/user/<id>.jpg`). Posée telle quelle, elle se résolvait contre le
 * CHEMIN du document et peignait une image brisée. La carte passe par la même
 * résolution que tous les avatars (`attachmentSrc`), et une image qui échoue
 * cède la place aux initiales — jamais l'icône brisée du navigateur.
 */
describe('ConversationLinkCard — portraits', () => {
  const INVITER_KEY = 'avatars/user/68f2a81417a557e8ce4ddfc1.jpg';

  test('l’avatar de l’inviteur passe par la route de flux, jamais la clé nue', async () => {
    const { host } = await mount({
      target: SHARE,
      seed: card({ inviter: { displayName: 'Alice Martin', username: 'alice', avatarUrl: INVITER_KEY } }),
    });
    const img = host.querySelector('[data-conversation-card-invite] img');
    expect(img?.getAttribute('src')).toBe(attachmentSrc(INVITER_KEY));
    expect(img?.getAttribute('src')).toContain('/api/v1/attachments/file/');
  });

  test('l’avatar et la bannière du groupe passent par la même résolution', async () => {
    const { host } = await mount({
      target: SHARE,
      seed: card({ avatarUrl: 'avatars/conversation/c1.jpg', bannerUrl: 'banners/conversation/c1.jpg' }),
    });
    const images = [...host.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(images).toContain(attachmentSrc('avatars/conversation/c1.jpg'));
    const banner = host.querySelector('[data-conversation-card-banner] img');
    expect(banner?.getAttribute('src')).toBe(attachmentSrc('banners/conversation/c1.jpg'));
    await act(async () => {
      banner?.dispatchEvent(new Event('error'));
    });
    expect(host.querySelector('[data-conversation-card-banner]')).not.toBeNull();
    expect(host.querySelector('[data-conversation-card-banner] img')).toBeNull();
  });

  test('une image qui échoue cède la place aux initiales — jamais une image brisée', async () => {
    const { host } = await mount({
      target: SHARE,
      seed: card({ inviter: { displayName: 'Théo (foot)', username: 'theo', avatarUrl: INVITER_KEY } }),
    });
    const img = host.querySelector('[data-conversation-card-invite] img');
    expect(img).not.toBeNull();
    await act(async () => {
      img?.dispatchEvent(new Event('error'));
    });
    const invite = host.querySelector('[data-conversation-card-invite]');
    expect(invite?.querySelector('img')).toBeNull();
    expect(invite?.querySelector('[data-portrait-initials]')?.textContent).toBe('TF');
  });
});

/**
 * **DEUX CARTES, UNE CONVERSATION (#8138).** Un même fil peut porter la carte
 * d'un lien de PARTAGE et celle du lien DIRECT d'une même conversation. Le
 * geste de l'une changeait sa seule clé de cache : l'autre restait « Private
 * conversation » après une jonction, « Leave | Open » après un départ. Le geste
 * relit désormais toutes les cartes de la conversation.
 */
describe('ConversationLinkCard — les cartes d’une même conversation suivent le geste', () => {
  const memberCard = (overrides: Partial<ConversationCard> = {}) =>
    card({
      conversationId: 'c-beta',
      stats: { memberCount: 8, onlineCount: null, messageCount: 42, languages: ['fr', 'en'] },
      viewer: { isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
      ...overrides,
    });

  const directMember = (): ConversationCard => ({ ...memberCard(), kind: 'direct', link: null, inviter: null, inviteMessage: null });

  const mountBoth = async (params: {
    readonly share: ConversationCard | null;
    readonly direct: ConversationCard | null;
    readonly replies: Readonly<Record<string, Reply>>;
  }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(conversationCardQueryKey(SHARE), params.share);
    client.setQueryData(conversationCardQueryKey(DIRECT), params.direct);
    const { deps, calls } = transportOf(params.replies);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host, client });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <div data-slot="share">
            <ConversationLinkCard target={SHARE} deps={deps} language="en" signedIn accountLanguage="fr" />
          </div>
          <div data-slot="direct">
            <ConversationLinkCard target={DIRECT} deps={deps} language="en" signedIn accountLanguage="fr" />
          </div>
        </QueryClientProvider>,
      );
    });
    await settle();
    const slot = (name: string): HTMLElement => {
      const element = host.querySelector<HTMLElement>('[data-slot="' + name + '"]');
      if (element === null) throw new Error('emplacement absent');
      return element;
    };
    return { share: () => slot('share'), direct: () => slot('direct'), calls };
  };

  test('rejoindre par la carte de partage fait passer la carte directe « privée » à « membre »', async () => {
    const { share, direct } = await mountBoth({
      share: card(),
      direct: null,
      replies: {
        'POST /api/v1/links/mshy_beta/members': { ok: true, data: { conversationId: 'c-beta' } },
        'GET /api/v1/conversations/c-beta/card': { ok: true, data: directMember() },
        'GET /api/v1/links/mshy_beta/card': { ok: true, data: memberCard() },
      },
    });
    expect(direct().querySelector('[data-conversation-card="private"]')).not.toBeNull();
    await click(byText(share(), 'Join'));
    await settle();
    expect(direct().querySelector('[data-conversation-card="member"]')).not.toBeNull();
    expect(buttons(direct())).toEqual(['Leave', 'Open']);
    expect(direct().textContent).toContain('8 members');
  });

  test('quitter par la carte directe remet la carte de partage à « Join »', async () => {
    const { share, direct } = await mountBoth({
      share: memberCard(),
      direct: directMember(),
      replies: {
        'POST /api/v1/conversations/c-beta/leave': { ok: true, data: { conversationId: 'c-beta' } },
        'GET /api/v1/links/mshy_beta/card': { ok: true, data: card() },
        'GET /api/v1/conversations/c-beta/card': { ok: false, status: 404, error: 'not found' },
      },
    });
    expect(buttons(share())).toEqual(['Leave', 'Open']);
    await click(byText(direct(), 'Leave'));
    const dialog = document.querySelector('[data-confirm-dialog="conversation-card-leave"]');
    const confirm = [...(dialog?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === 'Leave');
    await click(confirm);
    await settle();
    expect(buttons(share())).toEqual(['Join']);
    expect(share().textContent).toContain('7 members');
    expect(direct().querySelector('[data-conversation-card="private"]')).not.toBeNull();
  });
});
