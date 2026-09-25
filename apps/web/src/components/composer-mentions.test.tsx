import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { publishMentionSource, type MentionSource } from '@/lib/view/mention-source';
import { MENTION_REMOTE_DEBOUNCE_MS } from '@/lib/view/use-mention-suggestions';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Composer } from './composer';

/**
 * TAPER `@` PROPOSE LES PERSONNES À MENTIONNER (#7826) — le comportement vu
 * du lecteur : ce qui s'ouvre, ce que le clavier fait, ce que le champ porte
 * après le choix, et ce qui n'est PAS envoyé pendant qu'on choisit.
 *
 * La source est PUBLIÉE comme le fil la publie (`publishMentionSource`), avec
 * une recherche distante bouchonnée qui COMPTE ses appels : le seuil de deux
 * caractères et le débounce se mesurent sur ce compte, jamais supposés.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const alice: MentionCandidate = { id: 'u-alice', username: 'alice', displayName: 'Alice Martin' };
const albert: MentionCandidate = { id: 'u-albert', username: 'albert', displayName: 'Albert' };
const alina: MentionCandidate = { id: 'u-alina', username: 'alina', displayName: 'Alina', badge: 'friend' };

type Fixture = {
  readonly el: HTMLDivElement;
  readonly sent: string[];
  readonly searches: string[];
};

let container: HTMLDivElement;
let root: Root;
let withdraw: () => void = () => {};

afterEach(() => {
  withdraw();
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function mountComposer(options: { readonly remote?: readonly MentionCandidate[]; readonly published?: boolean } = {}): Promise<Fixture> {
  const sent: string[] = [];
  const searches: string[] = [];
  const source: MentionSource = {
    selfId: 'u-me',
    locals: [alice, albert],
    search: async (query) => {
      searches.push(query);
      return options.remote ?? [];
    },
  };
  withdraw = options.published === false ? () => {} : publishMentionSource(source);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Composer onSend={(payload) => sent.push(payload.text)} />);
  });
  return { el: container, sent, searches };
}

const fieldOf = (el: HTMLElement): HTMLTextAreaElement => {
  const field = el.querySelector('textarea');
  if (field === null) throw new Error('Aucun champ');
  return field;
};

function typeAt(el: HTMLElement, value: string, caret: number = value.length): void {
  const field = fieldOf(el);
  act(() => {
    field.focus();
    field.value = value;
    field.setSelectionRange(caret, caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(el: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    fieldOf(el).dispatchEvent(event);
  });
  return event;
}

const options = (el: HTMLElement): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
const names = (el: HTMLElement): (string | undefined)[] => options(el).map((o) => o.dataset.mentionOption);
const panel = (el: HTMLElement): Element | null => el.querySelector('[data-mention-suggestions]');

async function passDebounce(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, MENTION_REMOTE_DEBOUNCE_MS + 60));
  });
}

describe('taper @ ouvre la liste des personnes du fil', () => {
  test('un @ nu propose les expéditeurs du fil, sans réseau', async () => {
    const { el, searches } = await mountComposer();
    typeAt(el, 'salut @');
    expect(names(el)).toEqual(['alice', 'albert']);
    expect(el.querySelector('[role="listbox"]')?.getAttribute('aria-label')).toBe('Suggestions de mention');
    await passDebounce();
    expect(searches).toEqual([]);
  });

  test('la liste montre le nom et le @pseudo', async () => {
    const { el } = await mountComposer();
    typeAt(el, '@');
    const first = options(el)[0];
    expect(first?.textContent).toContain('Alice Martin');
    expect(first?.textContent).toContain('@alice');
  });

  test('une adresse e-mail n’ouvre rien', async () => {
    const { el } = await mountComposer();
    typeAt(el, 'écris à contact@exemple.com');
    expect(panel(el)).toBeNull();
  });

  test('sans fil publié, aucun @ n’ouvre de liste', async () => {
    const { el } = await mountComposer({ published: false });
    typeAt(el, '@al');
    expect(panel(el)).toBeNull();
  });

  test('la requête est lue AU CURSEUR, pas en fin de texte', async () => {
    const { el } = await mountComposer();
    typeAt(el, 'bonjour @alb et à demain', 12);
    expect(names(el)).toEqual(['albert']);
  });
});

describe('le clavier choisit sans envoyer', () => {
  test('↓ puis Entrée insère la personne active — et n’envoie PAS le message', async () => {
    const { el, sent } = await mountComposer();
    typeAt(el, 'salut @al');
    const field = fieldOf(el);
    expect(field.getAttribute('aria-activedescendant')).toBe(options(el)[0]?.id ?? 'absent');
    press(el, 'ArrowDown');
    expect(options(el)[1]?.getAttribute('aria-selected')).toBe('true');
    expect(field.getAttribute('aria-activedescendant')).toBe(options(el)[1]?.id ?? 'absent');
    const enter = press(el, 'Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(sent).toEqual([]);
    expect(field.value).toBe('salut @albert ');
    expect(panel(el)).toBeNull();
  });

  test('↑ depuis la première rangée revient à la dernière', async () => {
    const { el } = await mountComposer();
    typeAt(el, '@');
    press(el, 'ArrowUp');
    expect(options(el)[1]?.getAttribute('aria-selected')).toBe('true');
  });

  test('Tab insère aussi, au milieu d’une phrase, sans doubler l’espace', async () => {
    const { el } = await mountComposer();
    typeAt(el, 'bonjour @ali et à demain', 12);
    press(el, 'Tab');
    expect(fieldOf(el).value).toBe('bonjour @alice et à demain');
  });

  test('Échap ferme la liste ; Entrée envoie alors le message', async () => {
    const { el, sent } = await mountComposer();
    typeAt(el, 'salut @al');
    press(el, 'Escape');
    expect(panel(el)).toBeNull();
    press(el, 'Enter');
    expect(sent).toEqual(['salut @al']);
  });

  test('liste fermée, Entrée envoie comme avant', async () => {
    const { el, sent } = await mountComposer();
    typeAt(el, 'bonjour');
    press(el, 'Enter');
    expect(sent).toEqual(['bonjour']);
  });
});

describe('toucher une personne l’insère', () => {
  test('le clic insère `@username ` et garde le focus dans le champ', async () => {
    const { el } = await mountComposer();
    typeAt(el, 'merci @al');
    const option = options(el)[0];
    if (option === undefined) throw new Error('aucune rangée');
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
    act(() => {
      option.dispatchEvent(down);
      option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(down.defaultPrevented).toBe(true);
    expect(fieldOf(el).value).toBe('merci @alice ');
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.activeElement).toBe(fieldOf(el));
  });
});

describe('la passerelle complète la liste', () => {
  test('à partir de deux caractères, après le débounce : locaux d’abord, puis les distants absents', async () => {
    const { el, searches } = await mountComposer({ remote: [alice, alina] });
    typeAt(el, '@a');
    expect(searches).toEqual([]);
    typeAt(el, '@al');
    expect(names(el)).toEqual(['alice', 'albert']);
    await passDebounce();
    expect(searches).toEqual(['al']);
    expect(names(el)).toEqual(['alice', 'albert', 'alina']);
    expect(options(el)[2]?.textContent).toContain('Contact');
  });

  test('une réponse de la passerelle est servie telle quelle, même trouvée sur un champ que le client ne voit pas', async () => {
    const marc: MentionCandidate = { id: 'u-marc', username: 'md', displayName: 'M. D.' };
    const { el } = await mountComposer({ remote: [marc] });
    typeAt(el, '@marc');
    await passDebounce();
    expect(names(el)).toEqual(['md']);
  });

  test('personne ne correspond : la liste le DIT', async () => {
    const { el } = await mountComposer();
    typeAt(el, '@zz');
    await passDebounce();
    expect(options(el)).toHaveLength(0);
    expect(panel(el)?.textContent).toContain('Aucune personne trouvée');
  });
});
