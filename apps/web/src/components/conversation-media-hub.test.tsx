import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { mediaHubPath, mediaHubQueryKey } from '@/lib/api/conversation-media-hub';
import type { ConversationsDeps } from '@/lib/api/conversations';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import type { MessagesPage } from '@/lib/api/messages-pages';
import type { Message } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { MediaHubKind } from '@/lib/view/media-hub';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationMediaHub, SEARCH_DEBOUNCE_MS } from './conversation-media-hub';
import { ConversationMediaSection } from './conversation-media-section';

/**
 * **L'ÉCRAN « MÉDIAS, LIENS ET DOCUMENTS » (#8103)** — ce que l'utilisateur
 * voit et touche : les segments, la grille, les états dessinés (chargement,
 * vide, erreur, hors ligne), le cache d'abord, la recherche posée, et la
 * visionneuse qui feuillette toute la conversation (#6303).
 */

const wireMessage = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  conversationId: 'c1',
  senderId: 'u-nour',
  sender: { id: 'p-nour', displayName: 'Nour Haddad' },
  content: '',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  translations: [],
  attachments: [],
  ...overrides,
});

const photoMessage = (id: string) =>
  wireMessage(id, {
    attachments: [
      {
        id: `a-${id}`,
        messageId: id,
        fileName: `${id}.jpg`,
        originalName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 2048,
        fileUrl: `/uploads/${id}.jpg`,
        thumbnailUrl: `/uploads/${id}-thumb.jpg`,
        width: 640,
        height: 480,
        isViewOnce: false,
        isBlurred: false,
        createdAt: '2026-09-20T10:00:00.000Z',
      },
    ],
  });

const page = (messages: readonly unknown[], hasMore = false): ApiResult<unknown> =>
  ({ ok: true, data: messages, cursorPagination: { hasMore, nextCursor: hasMore ? 'curseur' : null, limit: 30 } }) as ApiResult<unknown>;

const pathOf = (kind: MediaHubKind, term: string | null = null, before?: string) =>
  `GET ${mediaHubPath({ conversationId: 'c1', kind, term, before })}`;

const transportOf = (replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>) => {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: '' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    calls.push(req);
    const reply = replies[`${req.method} ${req.path}`];
    if (reply === 'pending') return new Promise(() => {});
    return reply ?? { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls: () => calls };
};

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
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
});

const settle = (ms = 10) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Attend qu'un état dessiné paraisse — sous charge, un seul tour de boucle ne suffit pas à la réponse. */
const until = async (check: () => boolean) => {
  for (let tries = 0; tries < 100 && !check(); tries += 1) await settle(20);
};

const mountHub = (options: {
  readonly replies: Readonly<Record<string, ApiResult<unknown> | 'pending'>>;
  readonly client?: QueryClient;
  readonly onJump?: (messageId: string) => void;
  readonly canJumpTo?: (messageId: string) => boolean;
}) => {
  const { deps, calls } = transportOf(options.replies);
  const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ConversationMediaHub
          conversationId="c1"
          viewerId="u-moi"
          accent="#6366f1"
          deps={deps}
          onClose={() => {}}
          {...(options.onJump === undefined ? {} : { onJumpToMessage: options.onJump })}
          {...(options.canJumpTo === undefined ? {} : { canJumpTo: options.canJumpTo })}
        />
      </QueryClientProvider>,
    );
  });
  return { calls, client };
};

const $ = (selector: string) => document.querySelector<HTMLElement>(selector);
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

const click = (element: HTMLElement | null) => {
  if (element === null) throw new Error('élément introuvable');
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};

const typer = createActMounter().type;
const type = (value: string) => typer(document, 'input[type="search"]', value);

describe('les segments', () => {
  test('sept onglets, Médias sélectionné d’abord, un seul arrêt de tabulation', async () => {
    mountHub({ replies: { [pathOf('visual')]: 'pending' } });
    const tabs = $$('[role="tab"]');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Médias', 'Audio', 'Documents', 'Liens', 'Contacts', 'Conversations', 'Lieux']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toHaveLength(1);
  });

  test('les flèches changent de segment et la requête suit le genre', async () => {
    const { calls } = mountHub({ replies: { [pathOf('visual')]: page([]), [pathOf('audio')]: 'pending' } });
    act(() => {
      $('[role="tablist"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    await until(() => calls().some((call) => call.path.includes('kinds=audio')));
    expect($('[data-media-hub-segment="audio"]')?.getAttribute('aria-selected')).toBe('true');
    expect(calls().map((call) => call.path)).toContain(mediaHubPath({ conversationId: 'c1', kind: 'audio', term: null, before: undefined }));
  });
});

describe('les états dessinés', () => {
  test('segment jamais chargé : un squelette, annoncé', () => {
    mountHub({ replies: { [pathOf('visual')]: 'pending' } });
    expect($('[data-media-hub-loading]')).not.toBeNull();
    expect($('[data-media-hub-loading] .offscreen')?.textContent).toBe('Chargement…');
  });

  test('vide : une phrase qui nomme le segment', async () => {
    mountHub({ replies: { [pathOf('visual')]: page([]) } });
    await until(() => $('[data-media-hub-empty]') !== null);
    expect($('[data-media-hub-empty]')?.textContent).toBe('Rien à afficher dans « Médias » pour l’instant.');
  });

  test('erreur : un message et « Réessayer », qui relance', async () => {
    const { calls } = mountHub({ replies: {} });
    await until(() => $('[data-media-hub-error]') !== null);
    expect($('[data-media-hub-error]')?.getAttribute('role')).toBe('alert');
    const before = calls().length;
    click($('[data-media-hub-error] button'));
    await until(() => calls().length > before);
    expect(calls().length).toBe(before + 1);
  });

  test('hors ligne sans cache : on le dit, sans squelette', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    mountHub({ replies: { [pathOf('visual')]: 'pending' } });
    expect($('[data-media-hub-offline-empty]')?.textContent).toBe('Hors ligne — cette liste n’a pas encore été chargée.');
    expect($('[data-media-hub-loading]')).toBeNull();
  });
});

describe('cache d’abord', () => {
  test('un segment déjà en cache se peint tout de suite, sans squelette, même si la revalidation traîne', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const cached: MessagesPage = { messages: [photoMessage('m1')] as unknown as readonly Message[], hasOlder: false, nextCursor: null };
    client.setQueryData(mediaHubQueryKey('c1', 'visual', null), { pages: [cached], pageParams: [undefined] }, { updatedAt: 0 });
    mountHub({ client, replies: { [pathOf('visual')]: 'pending' } });
    expect($('[data-media-hub-loading]')).toBeNull();
    expect($$('[data-media-hub-tile]')).toHaveLength(1);
  });
});

describe('la grille et la visionneuse conversation-entière (#6303)', () => {
  test('les vignettes ne chargent que la VIGNETTE servie, paresseusement', async () => {
    mountHub({ replies: { [pathOf('visual')]: page([photoMessage('m2'), photoMessage('m1')]) } });
    await until(() => $$('[data-media-hub-tile]').length === 2);
    const images = $$('[data-media-hub-tile] img');
    expect(images.map((image) => image.getAttribute('src'))).toEqual(['/uploads/m2-thumb.jpg', '/uploads/m1-thumb.jpg'].map((src) => images.find((i) => i.getAttribute('src')?.endsWith(src))?.getAttribute('src') ?? src));
    expect(images.every((image) => image.getAttribute('loading') === 'lazy')).toBe(true);
    expect($('[data-media-hub-tile]')?.getAttribute('aria-label')).toContain('Nour Haddad');
  });

  test('toucher la deuxième vignette ouvre la visionneuse sur ELLE, parmi tous les médias de la conversation', async () => {
    mountHub({ replies: { [pathOf('visual')]: page([photoMessage('m3'), photoMessage('m2'), photoMessage('m1')]) } });
    await until(() => $$('[data-media-hub-tile]').length === 3);
    click($$('[data-media-hub-tile]')[1] ?? null);
    for (let tries = 0; tries < 50 && $('[data-media-viewer]') === null; tries += 1) await settle(20);
    const viewer = $('[data-media-viewer]');
    expect(viewer?.getAttribute('data-viewer-index')).toBe('1');
    expect(viewer?.getAttribute('aria-label')).toBe('Média 2 sur 3');
    expect(viewer?.querySelector('[data-viewer-footer]')?.textContent).toContain('Nour Haddad');
  });
});

describe('la recherche', () => {
  test('la requête part une fois la frappe posée, avec le terme ; un seul caractère ne cherche rien', async () => {
    const { calls } = mountHub({ replies: { [pathOf('visual')]: page([]), [pathOf('visual', 'plage')]: page([]) } });
    await until(() => $('[data-media-hub-empty]') !== null);
    type('p');
    await settle(SEARCH_DEBOUNCE_MS + 20);
    expect(calls().filter((call) => call.path.includes('q='))).toHaveLength(0);
    type('pla');
    type('plage');
    await until(() => calls().some((call) => call.path.includes('q=')) && $('[data-media-hub-empty]')?.textContent?.includes('plage') === true);
    expect(calls().filter((call) => call.path.includes('q=')).map((call) => call.path)).toEqual([
      mediaHubPath({ conversationId: 'c1', kind: 'visual', term: 'plage', before: undefined }),
    ]);
    expect($('[data-media-hub-empty]')?.textContent).toBe('Aucun résultat pour « plage ».');
  });
});

describe('les rangées', () => {
  test('un lien s’ouvre ailleurs ; « Aller au message » n’est posé que pour un message du fil chargé', async () => {
    const jumped: string[] = [];
    mountHub({
      onJump: (id) => jumped.push(id),
      canJumpTo: (id) => id === 'm-recent',
      replies: {
        [pathOf('visual')]: page([]),
        [pathOf('link')]: page([
          wireMessage('m-recent', { content: 'Lis https://example.org/article' }),
          wireMessage('m-ancien', { content: 'Et https://exemple.fr' }),
        ]),
      },
    });
    await until(() => $('[data-media-hub-empty]') !== null);
    click($('[data-media-hub-segment="link"]'));
    await until(() => $('[data-media-hub-jump="m-recent"]') !== null);
    const link = $('[data-media-hub-link="https://example.org/article"]');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect($('[data-media-hub-jump="m-ancien"]')).toBeNull();
    click($('[data-media-hub-jump="m-recent"]'));
    expect(jumped).toEqual(['m-recent']);
  });
});

describe('ConversationMediaSection — l’aperçu de la feuille de détails (#7834)', () => {
  test('les dernières vignettes, lues sur la MÊME clé de cache que l’écran, et l’entrée vers l’écran complet', async () => {
    const { deps } = transportOf({ [pathOf('visual')]: page([photoMessage('m5'), photoMessage('m4'), photoMessage('m3'), photoMessage('m2'), photoMessage('m1')]) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ConversationMediaSection conversationId="c1" viewerId="u-moi" accent="#6366f1" deps={deps} />
        </QueryClientProvider>,
      );
    });
    await until(() => $$('[data-conversation-details-media-strip] [data-media-hub-tile]').length === 4);
    expect($$('[data-conversation-details-media-strip] [data-media-hub-tile]')).toHaveLength(4);
    expect(client.getQueryData(mediaHubQueryKey('c1', 'visual', null))).toBeDefined();
    expect($('[data-conversation-details-media-open]')?.textContent).toContain('Médias, liens et documents');
  });
});
