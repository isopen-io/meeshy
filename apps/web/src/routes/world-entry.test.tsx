import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { WorldEntry } from '@meeshy/shared/types/world';

import type { ApiResult } from '@/lib/api/http';
import type { GuestJoinBody, LinkGuestJoined } from '@/lib/api/link-join';
import type { GuestIdentity } from '@/lib/api/session';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { WorldGuestEntry, type WorldEntryDeps } from './world-entry';

/**
 * ENTRER DANS WORLD WIDE SANS COMPTE (#10003, planche « Onboarding ») — nom,
 * glissement, langue principale proposée depuis l'appareil, puis le fil.
 *
 * Les effets de bord sont INJECTÉS (motif `ChatJoinDeps`) : chaque témoin
 * compte ce qu'un geste DÉCLENCHE — la jonction, l'identité adoptée, la langue,
 * la navigation —, jamais un nœud trouvé dans le DOM.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  await loadInviteCatalog('fr');
  ensureHappyDomRegistered({ url: 'http://localhost/world' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
});

const ENTRY: WorldEntry = { identifier: 'world', title: 'World Wide', shareLinkIdentifier: 'mshy_world_served', memberCount: 42 };

const JOINED: LinkGuestJoined = {
  conversationId: 'c-world',
  participantId: 'p-awa',
  sessionToken: 'anon_awa',
  readsHistory: false,
  mayWrite: true,
  attachmentKinds: ['text', 'audio'],
};

type Recorded = {
  readonly joins: Array<readonly [string, GuestJoinBody]>;
  readonly adopted: Array<readonly [string, GuestIdentity]>;
  readonly languages: string[];
  readonly gone: Array<readonly [string, boolean]>;
};

function deps(overrides: Partial<WorldEntryDeps> = {}): { readonly deps: WorldEntryDeps; readonly recorded: Recorded } {
  const recorded: Recorded = { joins: [], adopted: [], languages: [], gone: [] };
  return {
    recorded,
    deps: {
      loadWorld: async () => ({ ok: true, data: ENTRY }),
      joinGuest: async (link, body) => {
        recorded.joins.push([link, body]);
        return { ok: true, data: JOINED };
      },
      adoptGuest: (token, guest) => recorded.adopted.push([token, guest]),
      adoptInterfaceLanguage: (code) => recorded.languages.push(code),
      heldGuest: () => null,
      signedIn: () => false,
      deviceLanguages: () => ['es-ES', 'en'],
      go: (url, replace) => recorded.gone.push([url, replace]),
      joined: () => undefined,
      canGoBack: () => false,
      back: () => recorded.gone.push(['<back>', false]),
      ...overrides,
    },
  };
}

async function mount(props: { readonly initialName?: string; readonly deps: WorldEntryDeps }): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<WorldGuestEntry initialName={props.initialName ?? ''} deps={props.deps} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const nameField = (host: HTMLElement) => host.querySelector<HTMLInputElement>('[data-world-name]');
const step = (host: HTMLElement) => host.querySelector('[data-world-step]')?.getAttribute('data-world-step');
const radio = (host: HTMLElement, code: string) => host.querySelector<HTMLButtonElement>(`[data-world-language="${code}"]`);
const click = async (element: Element | null) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};
const submitName = async (host: HTMLElement) => {
  await act(async () => {
    host.querySelector('[data-world-name-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

describe('WorldGuestEntry — le nom, puis la langue', () => {
  test('sans nom transmis, l’écran s’ouvre sur le nom', async () => {
    const { deps: d } = deps();
    const host = await mount({ deps: d });
    expect(step(host)).toBe('name');
    expect(nameField(host)).not.toBeNull();
  });

  test('un nom vide ne glisse pas vers la langue', async () => {
    const { deps: d } = deps();
    const host = await mount({ deps: d });
    await submitName(host);
    expect(step(host)).toBe('name');
  });

  test('le nom validé glisse vers la langue, et la salutation le reprend', async () => {
    const { deps: d } = deps();
    const host = await mount({ deps: d });
    typeInto(nameField(host), 'Awa');
    await submitName(host);
    expect(step(host)).toBe('language');
    expect(host.textContent?.replace(/[\u2066-\u2069]/gu, '')).toContain('Bonjour Awa');
  });

  test('le nom venu de la landing ouvre directement sur la langue', async () => {
    const { deps: d } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    expect(step(host)).toBe('language');
  });

  test('la langue de l’appareil est proposée parmi les sept', async () => {
    const { deps: d } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    expect(host.querySelectorAll('[role="radio"]').length).toBe(7);
    expect(radio(host, 'es')?.getAttribute('aria-checked')).toBe('true');
    expect(radio(host, 'fr')?.getAttribute('aria-checked')).toBe('false');
  });

  test('la première langue de l’appareil parmi les sept est proposée', async () => {
    const { deps: d } = deps({ deviceLanguages: () => ['ja-JP', 'de-DE', 'en'] });
    const host = await mount({ initialName: 'Awa', deps: d });
    expect(radio(host, 'de')?.getAttribute('aria-checked')).toBe('true');
  });

  test('retour depuis le nom rend la page d’avant quand l’application en a une', async () => {
    const { deps: d, recorded } = deps({ canGoBack: () => true });
    const host = await mount({ deps: d });
    await click(host.querySelector('[data-world-back]'));
    expect(recorded.gone).toEqual([['<back>', false]]);
  });

  /* L'historique du navigateur compte aussi l'entrée qu'a posée l'étape de la
     langue (retour matériel) et les pages des autres sites : seul ce que
     l'application sait de SA page d'avant décide. */
  test('retour depuis le nom mène à l’accueil quand /world a été ouvert seul, quel que soit l’historique', async () => {
    window.history.pushState({}, '', '/world');
    const { deps: d, recorded } = deps({ canGoBack: () => false });
    const host = await mount({ deps: d });
    await click(host.querySelector('[data-world-back]'));
    expect(recorded.gone).toEqual([['/', true]]);
  });

  test('les flèches parcourent les langues, un seul arrêt de tabulation', async () => {
    const { deps: d } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await act(async () => {
      radio(host, 'es')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(radio(host, 'pt')?.getAttribute('aria-checked')).toBe('true');
    expect(Array.from(host.querySelectorAll('[role="radio"]')).filter((node) => node.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  test('en arabe, la flèche gauche avance', async () => {
    await loadInviteCatalog('ar');
    document.documentElement.lang = 'ar';
    try {
      const { deps: d } = deps();
      const host = await mount({ initialName: 'Awa', deps: d });
      expect(host.querySelector('[data-world-entry-screen]')?.getAttribute('dir')).toBe('rtl');
      await act(async () => {
        radio(host, 'es')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      });
      expect(radio(host, 'pt')?.getAttribute('aria-checked')).toBe('true');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });

  test('retour depuis la langue rend le nom, saisi tel quel', async () => {
    const { deps: d } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(host.querySelector('[data-world-back]'));
    expect(step(host)).toBe('name');
    expect(nameField(host)?.value).toBe('Awa');
  });
});

describe('WorldGuestEntry — entrer', () => {
  test('entrer rejoint par la clé SERVIE, avec le nom et la langue choisie', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(radio(host, 'pt'));
    await click(host.querySelector('[data-world-enter]'));
    expect(recorded.joins).toEqual([['mshy_world_served', { language: 'pt', nickname: 'Awa' }]]);
  });

  test('la jonction ouvre la session invité, avec les familles de pièces jointes du lien', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(host.querySelector('[data-world-enter]'));
    expect(recorded.adopted).toEqual([
      [
        'anon_awa',
        {
          participantId: 'p-awa',
          nickname: 'Awa',
          conversationId: 'c-world',
          link: 'mshy_world_served',
          mayWrite: true,
          language: 'es',
          attachmentKinds: ['text', 'audio'],
        },
      ],
    ]);
  });

  test('la langue choisie devient la langue d’interface, puis le fil s’ouvre sans retour vers l’entrée', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(host.querySelector('[data-world-enter]'));
    expect(recorded.languages).toEqual(['es']);
    expect(recorded.gone).toEqual([['/c/c-world', true]]);
  });

  test('un nom déjà pris ramène au nom, la suggestion pré-remplie', async () => {
    const taken: ApiResult<LinkGuestJoined> = {
      ok: false,
      status: 409,
      error: 'pris',
      code: 'USERNAME_TAKEN_IN_CONVERSATION',
      suggestedNickname: 'Awa2',
    };
    const { deps: d, recorded } = deps({ joinGuest: async () => taken });
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(host.querySelector('[data-world-enter]'));
    expect(step(host)).toBe('name');
    expect(nameField(host)?.value).toBe('Awa2');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(recorded.adopted).toEqual([]);
  });

  test('une jonction refusée par le lien le dit, sans session ouverte', async () => {
    const refused: ApiResult<LinkGuestJoined> = { ok: false, status: 410, error: 'fermé', code: 'LINK_INACTIVE' };
    const { deps: d, recorded } = deps({ joinGuest: async () => refused });
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(host.querySelector('[data-world-enter]'));
    expect(host.querySelector('[data-world-refused]')).not.toBeNull();
    expect(recorded.adopted).toEqual([]);
    expect(recorded.gone).toEqual([]);
  });
});

describe('WorldGuestEntry — ce qui précède le parcours', () => {
  test('une entrée fermée (WORLD_UNAVAILABLE) le dit et n’offre aucune entrée', async () => {
    const closed: ApiResult<WorldEntry> = { ok: false, status: 404, error: 'fermé', code: 'WORLD_UNAVAILABLE' };
    const { deps: d } = deps({ loadWorld: async () => closed });
    const host = await mount({ initialName: 'Awa', deps: d });
    expect(host.querySelector('[data-world-unavailable]')).not.toBeNull();
    expect(host.querySelector('[data-world-enter]')).toBeNull();
  });

  test('un invité déjà entré par ce lien retourne directement dans le fil', async () => {
    const held: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world_served', mayWrite: true };
    const { deps: d, recorded } = deps({ heldGuest: () => held });
    await mount({ initialName: 'Autre', deps: d });
    expect(recorded.gone).toEqual([['/c/c-world', true]]);
    expect(recorded.joins).toEqual([]);
  });

  test('un compte connecté suit la jonction par lien, sans formulaire d’invité', async () => {
    const { deps: d, recorded } = deps({ signedIn: () => true });
    await mount({ deps: d });
    expect(recorded.gone).toEqual([['/chat/mshy_world_served', true]]);
  });
});
