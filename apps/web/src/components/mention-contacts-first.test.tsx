import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { FriendRequestRecord, FriendRequestsData } from '@/lib/api/friend-requests';
import { friendRequestsQueryKey } from '@/lib/api/friend-requests';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { publishMentionSource, type MentionSource } from '@/lib/view/mention-source';
import { MENTION_REMOTE_DEBOUNCE_MS } from '@/lib/view/use-mention-suggestions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * TAPER `@` MONTRE D'ABORD SES CONTACTS, DEPUIS LE CACHE (#7846) — la matrice
 * de la règle du porteur, jouée sur le composeur du fil, avec un COMPTEUR
 * d'appels réseau qui additionne les deux chemins par lesquels un `@` peut
 * partir sur le fil : le chargement des contacts (un vol de la requête
 * `['friends','requests','accepted']`, lu sur le cache de requêtes lui-même)
 * et la recherche distante de la source (bouchonnée, elle compte ses appels).
 *
 * La loi de déclenchement est celle de `@meeshy/shared` (`mentionLookupStage`,
 * #14053, directive porteur du 2026-10-31) :
 *
 * | frappe            | ce qui se montre                          | réseau |
 * |-------------------|-------------------------------------------|--------|
 * | `@`               | contacts, puis participants               | 0      |
 * | `@c`              | filtré ET trié localement                 | 0      |
 * | `@cl` (trouvé)    | filtré ET trié localement                 | 0      |
 * | `@zz` (personne)  | la recherche part dès la 2ᵉ lettre        | 1      |
 * | `@cla`,`@clau`…   | locaux en tête, puis les autres           | +1     |
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const CONTACTS_KEY = friendRequestsQueryKey('accepted');

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const person = (id: string, username: string, displayName: string) => ({ id, username, displayName, avatar: null });

const friendship = (other: ReturnType<typeof person>): FriendRequestRecord => ({
  id: `fr-${other.id}`,
  senderId: other.id,
  receiverId: 'u-me',
  status: 'accepted',
  message: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  sender: other,
  receiver: person('u-me', 'moi', 'Moi'),
});

const contactsPage = (people: readonly ReturnType<typeof person>[]): FriendRequestsData => ({
  pages: [{ requests: people.map(friendship), nextCursor: null }],
  pageParams: [null],
});

const claire = person('u-claire', 'claire', 'Claire Dubois');
const marc = person('u-marc', 'marc', 'Marc Clavel');
const participants: readonly MentionCandidate[] = [
  { id: 'u-clovis', username: 'clovis', displayName: 'Clovis' },
  { id: 'u-marc', username: 'marc', displayName: 'Marc Clavel' },
  { id: 'u-albert', username: 'albert', displayName: 'Albert' },
];
const olga: MentionCandidate = { id: 'u-olga', username: 'claudine.o', displayName: 'Olga Claudine', badge: 'other' };

type Fixture = {
  readonly el: HTMLDivElement;
  readonly searches: string[];
  readonly contactFetches: () => number;
  readonly network: () => number;
};

let container: HTMLDivElement;
let root: Root;
let cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.removeQueries({ queryKey: CONTACTS_KEY });
});

async function mount(options: {
  readonly cache: 'fresh' | 'stale' | 'empty';
  readonly selfId?: string;
  readonly remote?: (query: string) => readonly MentionCandidate[];
  readonly reach?: MentionSource['reach'];
}): Promise<Fixture> {
  if (options.cache !== 'empty') {
    const age = options.cache === 'fresh' ? 1_000 : 60 * 60_000;
    appQueryClient.setQueryData(CONTACTS_KEY, contactsPage([marc, claire]), { updatedAt: Date.now() - age });
  }
  let fetches = 0;
  cleanups.push(
    appQueryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'fetch' && event.query.queryHash === JSON.stringify(CONTACTS_KEY)) fetches += 1;
    }),
  );
  const searches: string[] = [];
  const source: MentionSource = {
    selfId: options.selfId ?? 'u-me',
    locals: participants,
    search: async (query) => {
      searches.push(query);
      return options.remote?.(query) ?? [];
    },
    ...(options.reach === undefined ? {} : { reach: options.reach }),
  };
  cleanups.push(publishMentionSource(source));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Composer onSend={() => {}} />);
  });
  return { el: container, searches, contactFetches: () => fetches, network: () => fetches + searches.length };
}

const fieldOf = (el: HTMLElement): HTMLTextAreaElement => {
  const field = el.querySelector('textarea');
  if (field === null) throw new Error('Aucun champ');
  return field;
};

function typeText(el: HTMLElement, value: string): void {
  const field = fieldOf(el);
  act(() => {
    field.focus();
    field.value = value;
    field.setSelectionRange(value.length, value.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const names = (el: HTMLElement): (string | undefined)[] =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="option"]')).map((option) => option.dataset.mentionOption);

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

const passDebounce = () => wait(MENTION_REMOTE_DEBOUNCE_MS + 60);

describe('@ seul — les contacts, puis les participants, sans réseau', () => {
  test('un cache frais répond immédiatement, contacts d’abord, et rien ne part', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, 'salut @');
    expect(names(fx.el)).toEqual(['claire', 'marc', 'clovis', 'albert']);
    await passDebounce();
    expect(fx.network()).toBe(0);
  });

  test('un contact porte la pastille « Contact » ; un participant non', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@');
    const rows = Array.from(fx.el.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(rows[0]?.textContent).toContain('Contact');
    expect(rows[2]?.textContent).not.toContain('Contact');
  });

  test('un cache PÉRIMÉ est servi tel quel, puis réchauffé une fois', async () => {
    const fx = await mount({ cache: 'stale' });
    typeText(fx.el, '@');
    expect(names(fx.el).slice(0, 2)).toEqual(['claire', 'marc']);
    await wait(20);
    expect(fx.contactFetches()).toBe(1);
    expect(fx.searches).toEqual([]);
  });

  test('un cache VIDE se charge à la frappe de @, et la liste s’y remplit', async () => {
    const fx = await mount({ cache: 'empty', selfId: 'u-viewer' });
    typeText(fx.el, '@');
    expect(names(fx.el)).toEqual(['clovis', 'marc', 'albert']);
    await wait(50);
    expect(fx.contactFetches()).toBe(1);
    expect(names(fx.el)[0]).toBe('bruno.laurent');
  });

  test('sans @, les contacts ne sont jamais chargés', async () => {
    const fx = await mount({ cache: 'empty' });
    typeText(fx.el, 'bonjour à tous');
    await passDebounce();
    expect(fx.network()).toBe(0);
  });
});

describe('une lettre — filtre et tri locaux, sans réseau', () => {
  test('`@c` garde contacts puis participants, chacun trié par la force de la correspondance', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@c');
    expect(names(fx.el)).toEqual(['claire', 'marc', 'clovis']);
    await passDebounce();
    expect(fx.network()).toBe(0);
  });
});

describe('la loi de déclenchement — le cache d’abord, le réseau au 3ᵉ caractère (#14053)', () => {
  test('une lettre : aucun appel', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@z');
    await passDebounce();
    expect(fx.network()).toBe(0);
  });

  test('deux lettres qui trouvent quelqu’un en local : aucun appel', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@cl');
    expect(names(fx.el)).toEqual(['claire', 'marc', 'clovis']);
    await passDebounce();
    expect(fx.network()).toBe(0);
    expect(names(fx.el)).toEqual(['claire', 'marc', 'clovis']);
  });

  test('deux lettres qui ne trouvent personne en local : l’appel part dès la 2ᵉ lettre', async () => {
    const zora: MentionCandidate = { id: 'u-zora', username: 'zora', displayName: 'Zora Zidane', badge: 'other' };
    const fx = await mount({ cache: 'fresh', remote: () => [zora] });
    typeText(fx.el, '@zz');
    await passDebounce();
    expect(fx.searches).toEqual(['zz']);
    expect(names(fx.el)).toEqual(['zora']);
  });

  test('trois caractères : l’appel part, même quand le local a trouvé', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@cla');
    expect(names(fx.el)).toEqual(['claire', 'marc']);
    await passDebounce();
    expect(fx.searches).toEqual(['cla']);
    expect(fx.network()).toBe(1);
  });
});

describe('trois caractères et plus — la recherche réseau, débouncée, sans clignotement', () => {
  test('`@cla` : un appel, les locaux restent en tête, puis le serveur dans son ordre', async () => {
    const fx = await mount({ cache: 'fresh', remote: () => [olga, { id: 'u-claire', username: 'claire', displayName: 'Claire Dubois' }] });
    typeText(fx.el, '@cla');
    expect(names(fx.el)).toEqual(['claire', 'marc']);
    expect(fx.network()).toBe(0);
    await passDebounce();
    expect(fx.searches).toEqual(['cla']);
    expect(fx.network()).toBe(1);
    expect(names(fx.el)).toEqual(['claire', 'marc', 'claudine.o']);
  });

  test('une frappe rapide ne part qu’une fois, pour la dernière requête', async () => {
    const fx = await mount({ cache: 'fresh' });
    typeText(fx.el, '@cla');
    await wait(80);
    typeText(fx.el, '@clau');
    await wait(80);
    typeText(fx.el, '@claud');
    await passDebounce();
    expect(fx.searches).toEqual(['claud']);
    expect(fx.network()).toBe(1);
  });

  test('pendant la recherche suivante, les résultats connus restent affichés, affinés', async () => {
    const fx = await mount({ cache: 'fresh', remote: () => [olga] });
    typeText(fx.el, '@cla');
    await passDebounce();
    expect(names(fx.el)).toEqual(['claire', 'marc', 'claudine.o']);
    typeText(fx.el, '@claudi');
    expect(names(fx.el)).toEqual(['claudine.o']);
    typeText(fx.el, '@claud');
    expect(names(fx.el)).toEqual(['claudine.o']);
    await passDebounce();
    expect(fx.searches).toEqual(['cla', 'claud']);
    expect(fx.network()).toBe(2);
  });
});

describe('une suggestion sans effet ne s’affiche pas (#14071)', () => {
  test('dans un groupe, le contact qui n’en est pas membre n’est pas proposé', async () => {
    const reach = { scope: 'members' as const, memberIds: ['u-me', 'u-clovis', 'u-marc', 'u-albert'] };
    const fx = await mount({ cache: 'fresh', reach });
    typeText(fx.el, '@');
    expect(names(fx.el)).toEqual(['marc', 'clovis', 'albert']);
  });

  test('un non-membre ne voit personne, et la recherche ne rend rien non plus', async () => {
    const fx = await mount({ cache: 'fresh', reach: { scope: null, memberIds: [] }, remote: () => [olga] });
    typeText(fx.el, '@cla');
    await passDebounce();
    expect(names(fx.el)).toEqual([]);
  });
});
