import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult } from '@/lib/api/http';
import type { LinkInvitation, LinkJoined } from '@/lib/api/link-join';
import { sessionStore } from '@/lib/api/session';
import { compile, match } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ChatJoin, type ChatJoinDeps } from './chat-join';
import { ROUTES } from './route-table';

/**
 * `/chat/:link` — LA JONCTION PAR LIEN (#5561), rendue.
 *
 * Ce que les témoins du port (`link-join.test.ts`) ne peuvent pas prouver :
 * qui AFFICHE ce qu'ils décident, et ce que chaque geste déclenche. L'écran est
 * monté SANS routeur, ses effets de bord injectés (`ChatJoinDeps`) — même
 * dispositif que `MagicLinkValidation` (`validate`, `go`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
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
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
});

const LINK = 'mshy_equipe_7f3a';

const INVITATION: LinkInvitation = {
  title: 'Équipe déploiement',
  kind: 'group',
  inviter: { name: 'Awa Diallo', avatar: null },
  readsHistory: false,
};

const JOINED: ApiResult<LinkJoined> = { ok: true, data: { conversationId: 'c-deploiement', alreadyMember: false } };

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

type Recorded = {
  readonly loads: string[];
  readonly joins: Array<readonly [string, string | null]>;
  readonly order: string[];
};

function depsWith(overrides: Partial<ChatJoinDeps> = {}): { readonly deps: ChatJoinDeps; readonly recorded: Recorded } {
  const recorded: Recorded = { loads: [], joins: [], order: [] };
  const deps: ChatJoinDeps = {
    load: async (link) => {
      recorded.loads.push(link);
      return { ok: true, data: INVITATION };
    },
    join: async (link, language) => {
      recorded.joins.push([link, language]);
      return JOINED;
    },
    go: (url, replace) => {
      recorded.order.push(`go ${url} ${replace ? 'replace' : 'push'}`);
    },
    joined: () => {
      recorded.order.push('joined');
    },
    expireSession: () => {
      recorded.order.push('expire');
      sessionStore.getState().clearSession();
    },
    ...overrides,
  };
  return { deps, recorded };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function mount(deps: ChatJoinDeps, link = LINK): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<ChatJoin link={link} deps={deps} />);
  });
  await settle();
  return container;
}

const signIn = () =>
  act(() => {
    sessionStore.getState().establish({
      user: { id: '0'.repeat(24), username: 'ada', displayName: 'Ada', avatar: '', systemLanguage: 'en' },
      token: 'jeton-du-temoin',
      sessionToken: 'session-du-temoin',
      expiresIn: 3600,
    });
  });

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/gu, ' ');
const joinButton = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].find((button) => /Rejoindre|Entrée dans la conversation/u.test(text(button))) ?? null;
const anchorTo = (el: HTMLElement, pathname: string) =>
  [...el.querySelectorAll('a')].find((a) => new URL(a.getAttribute('href') ?? '', 'http://localhost').pathname === pathname) ?? null;
const nextOf = (anchor: HTMLAnchorElement | null) => new URL(anchor?.getAttribute('href') ?? '', 'http://localhost').searchParams.get('next');

async function click(button: HTMLElement | null) {
  await act(async () => {
    button?.click();
  });
  await settle();
}

describe('ROUTES — /chat/$link', () => {
  test('s’apparie à /chat/<lien>, en extrait `link`, et à rien d’autre', () => {
    const compiled = compile(ROUTES.chatJoin.pattern);
    expect(match(compiled, '/chat/mshy_equipe_7f3a')).toEqual({ link: 'mshy_equipe_7f3a' });
    expect(match(compiled, '/chat/')).toBeNull();
    expect(match(compiled, '/chat')).toBeNull();
    expect(match(compiled, '/c/mshy_equipe_7f3a')).toBeNull();
    expect(typeof ROUTES.chatJoin.screen).toBe('function');
  });
});

describe('l’invitation', () => {
  test('chargement : l’écran s’annonce avant que l’invitation n’arrive', async () => {
    const { deps } = depsWith({ load: () => never() });
    const el = await mount(deps);
    expect(text(el)).toContain('Ouverture de l’invitation…');
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  test('dit qui invite, le titre, le type et ce qu’on pourra lire', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    expect(recorded.loads).toEqual([LINK]);
    const rendu = text(el);
    expect(rendu).toContain('Awa Diallo');
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(rendu).toContain('Conversation de groupe');
    expect(rendu).toContain('après votre arrivée');
  });

  test('le droit de lire l’historique change la phrase', async () => {
    const { deps } = depsWith({ load: async () => ({ ok: true, data: { ...INVITATION, readsHistory: true } }) });
    const el = await mount(deps);
    expect(text(el)).toContain('messages déjà échangés');
  });
});

describe('un visiteur CONNECTÉ rejoint', () => {
  test('« Rejoindre », la langue du compte part, puis /c/:id, PUIS le cache des conversations', async () => {
    signIn();
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.joins).toEqual([[LINK, 'en']]);
    expect(recorded.order).toEqual(['go /c/c-deploiement replace', 'joined']);
  });

  test('succès : l’écran le dit pendant que le fil arrive', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="status"]'))).toContain('Vous avez rejoint');
  });

  test('un membre EXISTANT est redirigé vers son fil', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => ({ ok: true, data: { conversationId: 'c-deja', alreadyMember: true } }) });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.order).toEqual(['go /c/c-deja replace', 'joined']);
  });

  test('jonction en cours : le bouton est désactivé, et un second geste ne rejoint pas deux fois', async () => {
    signIn();
    const joins: string[] = [];
    const { deps } = depsWith({
      join: (link) => {
        joins.push(link);
        return never();
      },
    });
    const el = await mount(deps);
    await click(joinButton(el));
    const busy = joinButton(el);
    expect(busy?.disabled).toBe(true);
    expect(busy?.getAttribute('aria-busy')).toBe('true');
    expect(text(busy)).toContain('Entrée dans la conversation…');
    await click(busy);
    expect(joins).toEqual([LINK]);
  });

  test('aucune sortie vers la connexion n’est proposée à un compte connecté', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    expect(anchorTo(el, '/login')).toBeNull();
    expect(anchorTo(el, '/signup')).toBeNull();
  });
});

describe('un visiteur SANS session', () => {
  test('ne peut pas rejoindre : deux sorties, chacune ramène ici par `next`', async () => {
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    expect(joinButton(el)).toBeNull();
    const login = anchorTo(el, '/login');
    const signup = anchorTo(el, '/signup');
    expect(text(login)).toBe('Se connecter pour rejoindre');
    expect(text(signup)).toBe('Créer un compte');
    expect(nextOf(login)).toBe('/chat/mshy_equipe_7f3a');
    expect(nextOf(signup)).toBe('/chat/mshy_equipe_7f3a');
    expect(recorded.joins).toEqual([]);
  });

  test('un lien aux caractères encodés revient à la MÊME adresse', async () => {
    const { deps } = depsWith();
    const el = await mount(deps, 'mshy_équipe 7f3a');
    expect(nextOf(anchorTo(el, '/login'))).toBe('/chat/mshy_%C3%A9quipe%207f3a');
  });

  test('les deux sorties sont des cibles de 44 px au moins', async () => {
    const { deps } = depsWith();
    const el = await mount(deps);
    for (const anchor of [anchorTo(el, '/login'), anchorTo(el, '/signup')]) {
      expect(Number.parseInt(anchor?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(44);
    }
  });
});

const REFUSALS: ReadonlyArray<readonly [number, string | undefined, string]> = [
  [404, undefined, 'introuvable'],
  [410, 'LINK_DEACTIVATED', 'désactivé'],
  [410, 'LINK_INACTIVE', 'désactivé'],
  [410, 'LINK_EXPIRED', 'expiré'],
  [410, 'CONVERSATION_CLOSED', 'terminée'],
  [409, 'LINK_EXHAUSTED', 'limite de participants'],
  [410, 'LINK_MAX_USES', 'limite de participants'],
  [403, 'LANGUAGE_NOT_ALLOWED', 'votre langue'],
  [403, 'BANNED', 'ne pouvez plus rejoindre'],
  [429, undefined, 'Trop de tentatives'],
  [0, undefined, 'hors ligne'],
];

const failure = (status: number, code: string | undefined): ApiResult<never> =>
  code === undefined ? { ok: false, status, error: 'refus' } : { ok: false, status, error: 'refus', code };

describe('chaque refus est un bandeau qui dit la cause et garde une sortie', () => {
  for (const [status, code, cause] of REFUSALS) {
    test(`à la lecture — ${status} ${code ?? '(sans code)'}`, async () => {
      const { deps } = depsWith({ load: async () => failure(status, code) });
      const el = await mount(deps);
      const alert = el.querySelector('[role="alert"]');
      expect(text(alert)).toContain(cause);
      const home = [...(alert?.querySelectorAll('a') ?? [])].find((a) => a.getAttribute('href') === '/');
      expect(text(home ?? null)).toBe('Revenir à l’accueil');
      expect(Number.parseInt(home?.style.minHeight ?? '0', 10)).toBeGreaterThanOrEqual(44);
      expect(el.querySelector('h1')).toBeNull();
    });
  }

  test('à la jonction — un refus DÉFINITIF garde l’invitation et retire « Rejoindre »', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => failure(403, 'LANGUAGE_NOT_ALLOWED') });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="alert"]'))).toContain('votre langue');
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(joinButton(el)).toBeNull();
    expect(recorded.order).toEqual([]);
  });

  test('à la jonction — un refus PASSAGER (429) laisse rejoindre à nouveau', async () => {
    signIn();
    const { deps } = depsWith({ join: async () => failure(429, undefined) });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(text(el.querySelector('[role="alert"]'))).toContain('Trop de tentatives');
    expect(joinButton(el)?.disabled).toBe(false);
  });

  test('à la jonction — servie EN INVITÉ : la session est close, et l’on revient par la connexion', async () => {
    signIn();
    const { deps, recorded } = depsWith({ join: async () => failure(0, 'JOINED_AS_GUEST') });
    const el = await mount(deps);
    await click(joinButton(el));
    expect(recorded.order).toEqual(['expire']);
    expect(text(el.querySelector('[role="alert"]'))).toContain('session a expiré');
    expect(nextOf(anchorTo(el, '/login'))).toBe('/chat/mshy_equipe_7f3a');
    expect(joinButton(el)).toBeNull();
  });
});

describe('hors ligne', () => {
  test('sans réseau, aucune lecture ne part ; l’invitation arrive au retour du réseau', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const { deps, recorded } = depsWith();
    const el = await mount(deps);
    expect(recorded.loads).toEqual([]);
    expect(text(el.querySelector('[role="alert"]'))).toContain('hors ligne');

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(recorded.loads).toEqual([LINK]);
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
  });

  test('une invitation déjà lue reste affichée, et « Rejoindre » attend le réseau', async () => {
    signIn();
    const { deps } = depsWith();
    const el = await mount(deps);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(el.querySelector('h1')?.textContent).toBe('Équipe déploiement');
    expect(joinButton(el)?.disabled).toBe(true);
    expect(text(el)).toContain('Hors ligne');
  });
});
