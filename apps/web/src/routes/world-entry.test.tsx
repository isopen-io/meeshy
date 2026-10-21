import { act, useState, type ReactNode } from 'react';
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

import { WORLD_ENTRY_HANDOFF_KEY } from '@/landing/world-entry';

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
      signedIn: () => false,
      go: (url, replace) => recorded.gone.push([url, replace]),
      joined: () => undefined,
      canGoBack: () => false,
      back: () => recorded.gone.push(['<back>', false]),
      handoff: () => memoryStorage(),
      now: () => NOW,
      ...overrides,
    },
  };
}

const NOW = 1_800_000_000_000;

/** Un `sessionStorage` d'onglet en mémoire — le jeton de passage de la landing y est posé. */
function memoryStorage(seed: Readonly<Record<string, string>> = {}): Storage {
  const values = new Map(Object.entries(seed));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** Le fil en focus, réduit à ce qu'il dit : la conversation qu'il ouvre. */
const focusStub = (conversationId: string): ReactNode => <div data-focus-thread={conversationId} />;

/**
 * L'HÔTE DE LA SESSION — ce que `useStore(sessionStore)` fait en vrai : une
 * identité ADOPTÉE devient l'invité TENU au rendu suivant. `expire` la retire,
 * comme le 401 d'une session périmée.
 */
let expire: (() => void) | null = null;

function Harness(props: { readonly initialName: string; readonly initialLanguage?: string | null; readonly held: GuestIdentity | null; readonly deps: WorldEntryDeps }) {
  const [held, setHeld] = useState<GuestIdentity | null>(props.held);
  expire = () => setHeld(null);
  const deps: WorldEntryDeps = {
    ...props.deps,
    adoptGuest: (token, guest) => {
      props.deps.adoptGuest(token, guest);
      setHeld(guest);
    },
  };
  return (
    <WorldGuestEntry
      initialName={props.initialName}
      initialLanguage={props.initialLanguage ?? null}
      held={held}
      deps={deps}
      focus={focusStub}
    />
  );
}

async function mount(props: {
  readonly initialName?: string;
  readonly initialLanguage?: string | null;
  readonly held?: GuestIdentity | null;
  readonly deps: WorldEntryDeps;
}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<Harness initialName={props.initialName ?? ''} initialLanguage={props.initialLanguage ?? null} held={props.held ?? null} deps={props.deps} />);
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

  test('la session adopte le pseudo FINAL servi par la passerelle, pas celui saisi (#10602)', async () => {
    const { deps: d, recorded } = deps({
      joinGuest: async () => ({ ok: true, data: { ...JOINED, nickname: 'ano_Awa4821' } }),
    });
    const host = await mount({ initialName: 'Awa', deps: d });
    await click(enterButton(host));
    expect(recorded.adopted.map(([, guest]) => guest.nickname)).toEqual(['ano_Awa4821']);
  });

  test('la langue choisie devient la langue d’interface, puis le fil s’ouvre SUR /world, sans retour vers l’entrée (#10100)', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', deps: d });
    await pick(host, 'es');
    await click(enterButton(host));
    expect(recorded.languages).toEqual(['es']);
    expect(recorded.gone).toEqual([['/world', true]]);
    expect(host.querySelector('[data-focus-thread]')?.getAttribute('data-focus-thread')).toBe('c-world');
    expect(host.querySelector('[data-world-form]')).toBeNull();
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

  test('un compte connecté suit la jonction par lien, sans formulaire d’invité', async () => {
    const { deps: d, recorded } = deps({ signedIn: () => true });
    await mount({ deps: d });
    expect(recorded.gone).toEqual([['/chat/mshy_world_served', true]]);
  });

  /* La landing d'un compte mène aussi à `/world?name=…&language=…` (#10100) :
     le nom et la langue qu'il y a choisis le suivent jusqu'à la jonction, qui
     le fait entrer sous son identité anonyme (#8816) comme avant. */
  test('un compte venu de la landing garde son nom et sa langue jusqu’à la jonction anonyme', async () => {
    const { deps: d, recorded } = deps({ signedIn: () => true });
    await mount({ initialName: ' Awa ', initialLanguage: 'pt', deps: d });
    expect(recorded.gone).toEqual([['/chat/mshy_world_served?mode=anonymous&name=Awa&language=pt', true]]);
  });
});

const HELD: GuestIdentity = { participantId: 'p-awa', nickname: 'Awa', conversationId: 'c-world', link: 'mshy_world_served', mayWrite: true };

describe('WorldGuestEntry — l’invité RESTE sur /world, le fil en focus (#10100)', () => {
  test('un invité déjà entré par ce lien voit le fil EN PLACE, sans navigation ni formulaire', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Autre', held: HELD, deps: d });
    expect(host.querySelector('[data-focus-thread]')?.getAttribute('data-focus-thread')).toBe('c-world');
    expect(host.querySelector('[data-world-form]')).toBeNull();
    expect(recorded.gone).toEqual([]);
    expect(recorded.joins).toEqual([]);
  });

  test('rafraîchir rouvre le fil SANS attendre le réseau (cache d’abord) : l’entrée n’est pas encore lue', async () => {
    const { deps: d } = deps({ loadWorld: () => new Promise<ApiResult<WorldEntry>>(() => undefined) });
    const host = await mount({ held: HELD, deps: d });
    expect(host.querySelector('[data-focus-thread]')?.getAttribute('data-focus-thread')).toBe('c-world');
  });

  test('hors ligne, le fil tenu reste lisible', async () => {
    const offline: ApiResult<WorldEntry> = { ok: false, status: 0, error: 'réseau', code: 'NETWORK_ERROR' };
    const { deps: d } = deps({ loadWorld: async () => offline });
    const host = await mount({ held: HELD, deps: d });
    expect(host.querySelector('[data-focus-thread]')).not.toBeNull();
  });

  test('l’invité d’un AUTRE lien voit l’entrée de World Wide, pas sa conversation', async () => {
    const { deps: d } = deps();
    const host = await mount({ held: { ...HELD, link: 'autre_lien', conversationId: 'c-autre' }, deps: d });
    expect(host.querySelector('[data-focus-thread]')).toBeNull();
    expect(host.querySelector('[data-world-form]')).not.toBeNull();
  });

  test('une session expirée ou retirée rend l’entrée (nom + langue)', async () => {
    const { deps: d } = deps();
    const host = await mount({ held: HELD, deps: d });
    await act(async () => expire?.());
    expect(host.querySelector('[data-focus-thread]')).toBeNull();
    expect(nameField(host)).not.toBeNull();
    expect(languageSelect(host)).not.toBeNull();
  });
});

describe('WorldGuestEntry — la landing fait entrer sur /world (#10100, jeton #10094)', () => {
  const token = (fields: Partial<{ link: string; name: string; language: string; at: number }> = {}) =>
    JSON.stringify({ link: 'mshy_world_served', name: 'Awa', language: 'pt', at: NOW - 1000, ...fields });

  test('le jeton de passage de la landing fait entrer sans autre geste, sous le nom et la langue choisis', async () => {
    const storage = memoryStorage({ [WORLD_ENTRY_HANDOFF_KEY]: token() });
    const { deps: d, recorded } = deps({ handoff: () => storage });
    const host = await mount({ initialName: 'Awa', initialLanguage: 'pt', deps: d });
    expect(recorded.joins).toEqual([['mshy_world_served', { language: 'pt', nickname: 'Awa' }]]);
    expect(recorded.gone).toEqual([['/world', true]]);
    expect(host.querySelector('[data-focus-thread]')?.getAttribute('data-focus-thread')).toBe('c-world');
    expect(storage.getItem(WORLD_ENTRY_HANDOFF_KEY)).toBeNull();
  });

  test('sans jeton (adresse forgée), rien ne part : le nom et la langue sont pré-remplis et attendent le geste', async () => {
    const { deps: d, recorded } = deps();
    const host = await mount({ initialName: 'Awa', initialLanguage: 'pt', deps: d });
    expect(recorded.joins).toEqual([]);
    expect(nameField(host)?.value).toBe('Awa');
    expect(languageSelect(host)?.value).toBe('pt');
  });

  test('un jeton périmé ou pour un autre nom ne fait entrer personne', async () => {
    for (const stale of [token({ at: NOW - 60_000 }), token({ name: 'Mallory' })]) {
      const { deps: d, recorded } = deps({ handoff: () => memoryStorage({ [WORLD_ENTRY_HANDOFF_KEY]: stale }) });
      await mount({ initialName: 'Awa', initialLanguage: 'pt', deps: d });
      expect(recorded.joins).toEqual([]);
      act(() => mounted?.root.unmount());
      mounted?.container.remove();
      mounted = null;
    }
  });
});
