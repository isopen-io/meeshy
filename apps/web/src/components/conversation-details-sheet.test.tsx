import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { PaginationMeta } from '@meeshy/shared/types/api-responses';

import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { Conversation, Participant } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { PortailPartage } from '@/lib/view/invitation';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationDetailsSheet } from './conversation-details-sheet';
import { ThreadHeader } from './thread-header';

/**
 * **TOUCHER LE TITRE D'UNE CONVERSATION OUVRE SES DÉTAILS** (#7829) — la
 * feuille (cache d'abord, membres, partage d'un lien) et les portes de
 * l'en-tête qui l'ouvrent.
 */

const participant = (id: string, username: string, name: string, role = 'member'): Participant =>
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
    user: { id: `u-${id}`, username, displayName: name },
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
    memberCount: 12,
    currentUserRole: 'moderator',
    participants: [participant('nour', 'nour', 'Nour Haddad', 'admin'), participant('moi', 'moi', 'Moi Même')],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    ...overrides,
  }) as Conversation;

const wireMember = (id: string, username: string, name: string, role = 'member') => ({
  id: `p-${id}`,
  userId: `u-${id}`,
  type: 'user',
  username,
  displayName: name,
  avatar: null,
  conversationRole: role,
});

const cursorPagination = (totalCount: number): PaginationMeta =>
  Object.assign({ total: totalCount, offset: 0, limit: 50, hasMore: false }, { nextCursor: null, totalCount });

/** Un transport dont on tient chaque réponse : `pending` laisse la requête en vol. */
const transportOf = (replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls: () => calls };
};

const MEMBERS = 'GET /api/v1/conversations/c-groupe/participants?limit=50';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/c/c-groupe');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

const monteFeuille = async (options: {
  readonly conversation?: Conversation;
  readonly replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>;
  readonly portail?: PortailPartage;
}) => {
  const { deps, calls } = transportOf(options.replies);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationDetailsSheet
          conversation={options.conversation ?? conversation()}
          title={options.conversation?.title ?? 'Équipe Lyon'}
          accent="#6366f1"
          viewerId="u-moi"
          storyRingOf={(authorId) => (authorId === 'u-nour' ? { entryStoryId: 's-nour', unseen: true } : undefined)}
          deps={deps}
          origin="https://meeshy.me"
          {...(options.portail === undefined ? {} : { portail: options.portail })}
          onClose={() => {}}
        />
      </QueryClientProvider>,
    );
  });
  return { calls };
};

const noms = (): string[] =>
  [...container.ownerDocument.querySelectorAll('[data-conversation-member] .text-body')].map((node) => node.textContent ?? '');

describe('ConversationDetailsSheet — ce que la feuille montre (#7829)', () => {
  test('l’en-tête : nom, description, type et nombre de membres', async () => {
    await monteFeuille({ replies: { [MEMBERS]: 'pending' } });
    expect(document.querySelector('[data-conversation-details-name]')?.textContent).toBe('Équipe Lyon');
    expect(document.querySelector('[data-conversation-details-description]')?.textContent).toBe('On prépare le lancement');
    expect(document.querySelector('[data-conversation-details-meta]')?.textContent).toBe('Groupe · 12 membres');
  });

  test('CACHE D’ABORD : les participants déjà connus se peignent avant la réponse, sans squelette', async () => {
    await monteFeuille({ replies: { [MEMBERS]: 'pending' } });
    expect(noms()).toEqual(['Nour Haddad', 'Moi Même · Vous']);
    expect(document.querySelector('[data-conversation-details-loading]')).toBeNull();
    expect(document.querySelector('[data-member-role="admin"]')?.textContent).toBe('Administrateur');
  });

  test('la page de la passerelle remplace le cache quand elle arrive', async () => {
    await monteFeuille({
      replies: {
        [MEMBERS]: {
          ok: true,
          data: [wireMember('nour', 'nour', 'Nour Haddad', 'admin'), wireMember('ali', 'ali', 'Ali Ben'), wireMember('moi', 'moi', 'Moi Même')],
          pagination: cursorPagination(3),
        },
      },
    });
    await settle();
    expect(noms()).toEqual(['Nour Haddad', 'Ali Ben', 'Moi Même · Vous']);
    expect(document.querySelector('[data-conversation-details-meta]')?.textContent).toBe('Groupe · 3 membres');
  });

  test('cache VIDE et réponse en vol : le squelette, annoncé au lecteur d’écran', async () => {
    await monteFeuille({ conversation: conversation({ participants: [] }), replies: { [MEMBERS]: 'pending' } });
    const loading = document.querySelector('[data-conversation-details-loading]');
    expect(loading?.getAttribute('aria-busy')).toBe('true');
    expect(loading?.textContent).toContain('Chargement des membres');
  });

  test('cache vide et refus : l’erreur se dit, « Réessayer » relance la requête', async () => {
    const { calls } = await monteFeuille({
      conversation: conversation({ participants: [] }),
      replies: { [MEMBERS]: { ok: false, status: 500, error: 'panne' } },
    });
    await settle();
    const erreur = document.querySelector('[data-conversation-details-error]');
    expect(erreur?.textContent).toContain('Impossible de charger les membres.');
    act(() => erreur?.querySelector('button')?.click());
    await settle();
    expect(calls().filter((call) => call.path.includes('/participants')).length).toBe(2);
  });

  test('toucher un membre ouvre son profil', async () => {
    await monteFeuille({ replies: { [MEMBERS]: 'pending' } });
    const lien = document.querySelector<HTMLAnchorElement>('[data-conversation-member="p-nour"] a');
    expect(lien?.getAttribute('href')).toBe('/u/nour');
    act(() => {
      lien?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/u/nour');
  });

  test('l’appui long sur un membre ouvre le menu d’avatar — profil, story — sans « Détails » : on y est', async () => {
    await monteFeuille({ replies: { [MEMBERS]: 'pending' } });
    const lien = document.querySelector('[data-conversation-member="p-nour"] a');
    act(() => {
      lien?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    const entrees = [...document.querySelectorAll<HTMLElement>('[data-avatar-menu-entry]')].map((node) => node.dataset.avatarMenuEntry);
    expect(entrees).toEqual(['profile', 'story']);
    /* Posé DANS le `<dialog>` : hors de lui, une feuille modale le rendrait inerte. */
    expect(document.querySelector('[data-avatar-menu]')?.closest('dialog')).not.toBeNull();
  });

  test('« Partager un lien » crée le lien et le partage en un geste ; l’issue se dit', async () => {
    const copies: string[] = [];
    await monteFeuille({
      replies: {
        [MEMBERS]: 'pending',
        'POST /api/v1/links': {
          ok: true,
          data: {
            linkId: 'mshy_lyon',
            conversationId: 'c-groupe',
            shareLink: { id: 'l1', linkId: 'mshy_lyon', name: null, description: null, expiresAt: null, isActive: true },
          },
        },
      },
      portail: { copier: async (texte) => void copies.push(texte) },
    });
    act(() => document.querySelector<HTMLButtonElement>('[data-conversation-details-share]')?.click());
    await settle();
    expect(copies).toEqual(['https://meeshy.me/chat/mshy_lyon']);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Lien copié — il ne reste qu’à le coller.');
  });

  test('une conversation DIRECTE ne propose aucun lien de partage (la passerelle le refuserait)', async () => {
    await monteFeuille({ conversation: conversation({ type: 'direct', title: 'Nour Haddad' }), replies: { [MEMBERS]: 'pending' } });
    expect(document.querySelector('[data-conversation-details-share]')).toBeNull();
    expect(document.querySelector('[data-conversation-details-meta]')?.textContent).toContain('Discussion privée');
  });
});

describe('ThreadHeader — les portes vers les détails (#7829)', () => {
  const monteEnTete = (options: { readonly conversation: Conversation; readonly title: string; readonly expanded: boolean }) => {
    const ouvertures: string[] = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <ThreadHeader
          title={options.title}
          accent="#6366f1"
          conversation={options.conversation}
          viewerId="u-moi"
          group={options.conversation.type !== 'direct'}
          otherUnread={0}
          expanded={options.expanded}
          onToggleExpanded={() => ouvertures.push('bascule')}
          onOpenDetails={() => ouvertures.push('details')}
          currentRowTitle=""
          isAuto
          readingMenuRows={[]}
          onSelectReadingMode={() => {}}
          onResetReadingModeToAuto={() => {}}
        />,
      );
    });
    return ouvertures;
  };

  test('en groupe, toucher le titre ouvre les détails', () => {
    const ouvertures = monteEnTete({ conversation: conversation(), title: 'Équipe Lyon', expanded: true });
    const titre = document.querySelector<HTMLButtonElement>('[data-thread-title-details]');
    expect(titre?.textContent).toBe('Équipe Lyon');
    expect(titre?.getAttribute('aria-haspopup')).toBe('dialog');
    act(() => titre?.click());
    expect(ouvertures).toEqual(['details']);
  });

  test('en direct, le titre mène toujours au pair ; son appui long offre profil et détails', () => {
    const direct = conversation({ type: 'direct', participants: [participant('nour', 'nour', 'Nour Haddad'), participant('moi', 'moi', 'Moi Même')] });
    const ouvertures = monteEnTete({ conversation: direct, title: 'Nour Haddad', expanded: true });
    const lien = document.querySelector<HTMLAnchorElement>('h1 a');
    expect(lien?.getAttribute('href')).toBe('/u/nour');
    act(() => {
      lien?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    const entrees = [...document.querySelectorAll<HTMLElement>('[data-avatar-menu-entry]')].map((node) => node.dataset.avatarMenuEntry);
    expect(entrees).toEqual(['profile', 'details']);
    act(() => document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="details"]')?.click());
    expect(ouvertures).toEqual(['details']);
  });

  test('l’appui long sur l’avatar de l’en-tête (replié) ouvre le menu, pas la bascule', () => {
    const ouvertures = monteEnTete({ conversation: conversation(), title: 'Équipe Lyon', expanded: false });
    const bascule = document.querySelector('button[aria-label="Déplier l’en-tête"]');
    act(() => {
      bascule?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
    });
    const entrees = [...document.querySelectorAll<HTMLElement>('[data-avatar-menu-entry]')].map((node) => node.dataset.avatarMenuEntry);
    expect(entrees).toEqual(['details']);
    expect(ouvertures).toEqual([]);
  });
});
