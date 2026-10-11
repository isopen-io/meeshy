import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { WorldEntry } from '@meeshy/shared/types/world';
import { getLanguageInfo } from '@meeshy/shared/utils/languages';

import type { ApiResult } from '@/lib/api/http';
import type { GuestJoinBody, LinkGuestJoined } from '@/lib/api/link-join';
import type { GuestIdentity } from '@/lib/api/session';
import { loadInviteCatalog } from '@/lib/i18n-invite-catalog';
import { typeInto } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { WorldGuestEntry, type WorldEntryDeps } from './world-entry';

/**
 * ENTRER DANS WORLD WIDE SANS COMPTE (#10003, #10098) — une vue : le nom, la
 * langue (celle de l'interface proposée), puis le fil, d'un clic.
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
const languageSelect = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('select[data-world-language]');
const shownFlag = (host: HTMLElement) => {
  const select = languageSelect(host);
  return Array.from(select?.options ?? []).find((option) => option.value === select?.value)?.textContent?.split(' ')[0] ?? null;
};
const enterButton = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('[data-world-enter]');
const click = async (element: Element | null) => {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};
const pick = async (host: HTMLElement, code: string) => {
  const select = languageSelect(host);
  if (select === null) throw new Error('aucun sélecteur de langue');
  await act(async () => {
    select.value = code;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const submit = async (host: HTMLElement) => {
  await act(async () => {
    host.querySelector('[data-world-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await act(async () => {
    await Promise.resolve();
  });
};
const precedes = (first: Element | null, second: Element | null): boolean =>
  first !== null && second !== null && (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('WorldGuestEntry — une vue, un clic (#10098)', () => {
  test('le nom, la liste déroulante de la langue, puis « Entrer » — sur la même vue, sans étape', async () => {
    const { deps: d } = deps();
    const host = await mount({ deps: d });
    expect(host.querySelector('[data-world-step]')).toBeNull();
    expect(host.querySelectorAll('[role="radio"]').length).toBe(0);
    expect(precedes(nameField(host), languageSelect(host))).toBe(true);
    expect(precedes(languageSelect(host), enterButton(host))).toBe(true);
    expect(languageSelect(host)?.closest('label')?.classList.contains('ld-language')).toBe(true);
    expect(languageSelect(host)?.querySelectorAll('option').length).toBe(7);
  });

  test('la langue proposée est celle de l’INTERFACE, drapeau de la source unique', async () => {
    const { deps: d } = deps();
    const host = await mount({ deps: d });
    expect(languageSelect(host)?.value).toBe('fr');
    expect(shownFlag(host)).toBe(getLanguageInfo('fr').flag);
    for (const option of Array.from(languageSelect(host)?.querySelectorAll('option') ?? [])) {
      expect(option.textContent?.startsWith(getLanguageInfo(option.value).flag)).toBe(true);
    }
  });

  test('un clic entre : la clé SERVIE, le nom et la langue montrée', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ deps: d });
    typeInto(nameField(host), 'Awa');
    await submit(host);
    expect(recorded.joins).toEqual([['mshy_world_served', { language: 'fr', nickname: 'Awa' }]]);
  });

  test('une autre langue choisie change le drapeau, et c’est elle qui entre', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await pick(host, 'pt');
    expect(shownFlag(host)).toBe(getLanguageInfo('pt').flag);
    await click(enterButton(host));
    expect(recorded.joins).toEqual([['mshy_world_served', { language: 'pt', nickname: 'Awa' }]]);
  });

  test('un nom vide n’entre pas : le refus est dit et le champ reprend le focus', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ deps: d });
    await submit(host);
    expect(recorded.joins).toEqual([]);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(document.activeElement).toBe(nameField(host));
  });

  test('le nom venu d’une adresse est pré-rempli', async () => {
    const { deps: d } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    expect(nameField(host)?.value).toBe('Awa');
  });

  test('retour rend la page d’avant quand l’application en a une', async () => {
    const { deps: d, recorded } = deps({ canGoBack: () => true });
    const host = await mount({ deps: d });
    await click(host.querySelector('[data-world-back]'));
    expect(recorded.gone).toEqual([['<back>', false]]);
  });

  /* L'historique du navigateur compte aussi les pages des autres sites : seul
     ce que l'application sait de SA page d'avant décide. */
  test('retour mène à l’accueil quand /world a été ouvert seul, quel que soit l’historique', async () => {
    window.history.pushState({}, '', '/world');
    const { deps: d, recorded } = deps({ canGoBack: () => false });
    const host = await mount({ deps: d });
    await click(host.querySelector('[data-world-back]'));
    expect(recorded.gone).toEqual([['/', true]]);
  });

  test('en arabe, l’écran se lit de droite à gauche et propose l’arabe', async () => {
    await loadInviteCatalog('ar');
    document.documentElement.lang = 'ar';
    try {
      const { deps: d } = deps();
      const host = await mount({ initialName: 'Awa', deps: d });
      expect(host.querySelector('[data-world-entry-screen]')?.getAttribute('dir')).toBe('rtl');
      expect(languageSelect(host)?.value).toBe('ar');
      expect(languageSelect(host)?.querySelector('option[value="ar"]')?.getAttribute('dir')).toBe('rtl');
    } finally {
      document.documentElement.lang = 'fr';
    }
  });
});

describe('WorldGuestEntry — entrer', () => {
  test('la jonction ouvre la session invité, avec les familles de pièces jointes du lien', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(enterButton(host));
    expect(recorded.adopted).toEqual([
      [
        'anon_awa',
        {
          participantId: 'p-awa',
          nickname: 'Awa',
          conversationId: 'c-world',
          link: 'mshy_world_served',
          mayWrite: true,
          language: 'fr',
          attachmentKinds: ['text', 'audio'],
        },
      ],
    ]);
  });

  test('la langue choisie devient la langue d’interface, puis le fil s’ouvre sans retour vers l’entrée', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await pick(host, 'es');
    await click(enterButton(host));
    expect(recorded.languages).toEqual(['es']);
    expect(recorded.gone).toEqual([['/c/c-world', true]]);
  });

  test('un nom déjà pris garde la vue, la suggestion pré-remplie et le refus dit', async () => {
    const taken: ApiResult<LinkGuestJoined> = {
      ok: false,
      status: 409,
      error: 'pris',
      code: 'USERNAME_TAKEN_IN_CONVERSATION',
      suggestedNickname: 'Awa2',
    };
    const { deps: d, recorded } = deps({ joinGuest: async () => taken });
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(enterButton(host));
    expect(nameField(host)?.value).toBe('Awa2');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(recorded.adopted).toEqual([]);
  });

  test('une jonction refusée par le lien le dit, sans session ouverte', async () => {
    const refused: ApiResult<LinkGuestJoined> = { ok: false, status: 410, error: 'fermé', code: 'LINK_INACTIVE' };
    const { deps: d, recorded } = deps({ joinGuest: async () => refused });
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(enterButton(host));
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
