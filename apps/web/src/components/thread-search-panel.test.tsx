import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { CONVERSATION_ID } from '@/lib/api/fixtures-base';
import type { Conversation, Participant } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { MenuRow } from '@/lib/reading-mode/catalog';
import { THREAD_SEARCH_DEBOUNCE_MS } from '@/lib/view/thread-search';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeader } from './thread-header';

/**
 * LA LOUPE DE L'EN-TÊTE CHERCHE ENFIN — elle était un bouton SANS
 * gestionnaire depuis septembre. Monté dans l'en-tête réel, sur le corpus de
 * fixtures (`c-deploiement`, la source des témoins) : la loupe ouvre le champ,
 * la frappe interroge après l'anti-rebond, les résultats s'affichent avec le
 * mot marqué, toucher un résultat ferme la recherche et demande le saut au
 * message, Échap ferme, et le Résumé Vivant repasse en script pour que le
 * saut ait un fil où atterrir.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered({ url: `http://localhost/c/${CONVERSATION_ID}` });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

const participant = (id: string, name: string): Participant =>
  ({
    id: `p-${id}`,
    conversationId: CONVERSATION_ID,
    userId: `u-${id}`,
    type: 'user',
    displayName: name,
    role: 'member',
    language: 'fr',
    isActive: true,
    isOnline: false,
    joinedAt: new Date('2026-01-01'),
    user: { id: `u-${id}`, username: id, displayName: name },
  }) as Participant;

const CONVERSATION = {
  id: CONVERSATION_ID,
  type: 'group',
  title: 'Déploiement',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 3,
  participants: [participant('amina', 'Amina'), participant('moi', 'Moi')],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
} as unknown as Conversation;

const row = (mode: MenuRow['mode'], isCurrent: boolean): MenuRow => ({ mode, title: mode, subtitle: '', isCurrent, isAvailable: true, reason: null });

type Spy = { readonly jumps: string[]; readonly modes: string[] };

const header = (spy: Spy, rows: readonly MenuRow[] = []) => (
  <ThreadHeader
    title="Déploiement"
    accent="#0ea5e9"
    conversation={CONVERSATION}
    viewerId="u-moi"
    group
    otherUnread={0}
    expanded={false}
    onToggleExpanded={() => {}}
    currentRowTitle=""
    isAuto
    readingMenuRows={rows}
    onSelectReadingMode={(mode) => spy.modes.push(mode)}
    onResetReadingModeToAuto={() => {}}
    onJumpToMessage={(id) => spy.jumps.push(id)}
  />
);

const mount = (node: React.ReactNode): HTMLDivElement => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
  return container;
};

const loupe = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[aria-label="Rechercher dans la conversation"]');
const panel = (el: HTMLElement) => el.querySelector('[data-thread-search]');

const typeInto = async (el: HTMLElement, value: string) => {
  const field = el.querySelector<HTMLInputElement>('[data-thread-search-input]');
  await act(async () => {
    if (field === null) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, THREAD_SEARCH_DEBOUNCE_MS + 60));
  });
};

describe('la recherche dans la conversation (en-tête du fil)', () => {
  test('rendu serveur : la loupe est un bouton qui annonce son état, le panneau est fermé', () => {
    const html = renderToStaticMarkup(header({ jumps: [], modes: [] }));
    expect(html).toContain('aria-label="Rechercher dans la conversation"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-thread-search=""');
  });

  test('la loupe ouvre le champ et l’aide dit ce qu’il manque ; la retoucher le ferme', () => {
    const el = mount(header({ jumps: [], modes: [] }));
    act(() => loupe(el)?.click());
    expect(panel(el)).not.toBeNull();
    expect(loupe(el)?.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('[data-thread-search-input]')?.getAttribute('placeholder')).toBe('Rechercher dans la conversation…');
    expect(el.querySelector('[data-thread-search-status]')?.textContent).toBe('Tapez au moins deux caractères');
    act(() => loupe(el)?.click());
    expect(panel(el)).toBeNull();
  });

  test('la frappe interroge, les résultats s’affichent avec le mot marqué, toucher amène au message', async () => {
    const spy: Spy = { jumps: [], modes: [] };
    const el = mount(header(spy));
    act(() => loupe(el)?.click());
    await typeInto(el, 'rapport');
    expect(el.querySelector('[data-thread-search-status]')?.textContent).toBe('1 résultat');
    const hit = el.querySelector<HTMLButtonElement>('[data-thread-search-hit="m2"]');
    expect(hit).not.toBeNull();
    expect(hit?.querySelector('mark')?.textContent).toBe('rapport');
    act(() => hit?.click());
    expect(spy.jumps).toEqual(['m2']);
    expect(spy.modes).toEqual([]);
    expect(panel(el)).toBeNull();
  });

  test('un message trouvé par sa TRADUCTION le dit', async () => {
    const el = mount(header({ jumps: [], modes: [] }));
    act(() => loupe(el)?.click());
    await typeInto(el, 'déploiement');
    const hit = el.querySelector('[data-thread-search-hit="m1"]');
    expect(hit?.querySelector('[data-thread-search-translated]')?.textContent).toBe('Trouvé dans une traduction');
  });

  test('aucun résultat se dit', async () => {
    const el = mount(header({ jumps: [], modes: [] }));
    act(() => loupe(el)?.click());
    await typeInto(el, 'zzzzintrouvable');
    expect(el.querySelector('[data-thread-search-status]')?.textContent).toBe('Aucun résultat');
    expect(el.querySelector('[data-thread-search-results]')).toBeNull();
  });

  test('Échap ferme la recherche', () => {
    const el = mount(header({ jumps: [], modes: [] }));
    act(() => loupe(el)?.click());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(panel(el)).toBeNull();
  });

  test('le bouton « Fermer la recherche » ferme', () => {
    const el = mount(header({ jumps: [], modes: [] }));
    act(() => loupe(el)?.click());
    act(() => el.querySelector<HTMLButtonElement>('[data-thread-search-close]')?.click());
    expect(panel(el)).toBeNull();
  });

  test('en Résumé Vivant, toucher un résultat repasse en script AVANT le saut', async () => {
    const spy: Spy = { jumps: [], modes: [] };
    const el = mount(header(spy, [row('script', false), row('summary', true)]));
    act(() => loupe(el)?.click());
    await typeInto(el, 'rapport');
    act(() => el.querySelector<HTMLButtonElement>('[data-thread-search-hit="m2"]')?.click());
    expect(spy.modes).toEqual(['script']);
    expect(spy.jumps).toEqual(['m2']);
  });
});
