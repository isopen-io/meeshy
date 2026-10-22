import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { readingModeStore } from '@/lib/reading-mode/store';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';

/**
 * LA LISTE SE PARCOURT AU CLAVIER (#11227) ET LE MENU D'UNE LIGNE OUVRE LA
 * RECHERCHE ET LE MODE DE LECTURE (#11226).
 *
 * Un seul arrêt de tabulation par rangée — son lien vers le fil —, et un seul
 * pour la liste entière une fois qu'on y est entré : les flèches haut et bas
 * changent de rangée, droite et gauche passent d'un contrôle de la rangée à
 * l'autre (l'avatar, le bouton d'actions). Cent rangées ne coûtent plus trois
 * cents tabulations.
 */
const base = {
  status: 'active',
  visibility: 'private',
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  unreadCount: 0,
  userPreferences: [],
  currentUserRole: 'member',
};

const group = (id: string, title: string): Conversation =>
  ({ ...base, id, type: 'group', title, memberCount: 4, participants: [] }) as unknown as Conversation;

const direct = (id: string): Conversation =>
  ({
    ...base,
    id,
    type: 'direct',
    memberCount: 2,
    participants: [
      { id: 'p-me', userId: 'u-moi', displayName: 'Moi' },
      { id: 'p-amina', userId: 'u-amina', displayName: 'Amina', user: { id: 'u-amina', username: 'amina' } },
    ],
  }) as unknown as Conversation;

const ROWS = [group('c-lyon', 'Équipe Lyon'), direct('c-amina'), group('c-paris', 'Équipe Paris')];

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
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
});

function mount(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(
      <ul id="contenu">
        {ROWS.map((conversation) => (
          <LensRow
            key={conversation.id}
            conversation={conversation}
            languages={['fr']}
            viewerId="u-moi"
            flags={{ isPinned: false, isMuted: false, isArchived: false }}
            unreadCount={0}
            onRowAction={() => undefined}
            onOpenDetails={() => undefined}
            onRowIntent={() => undefined}
            categories={[]}
          />
        ))}
      </ul>,
    );
  });
}

const FOCUSABLE = 'a[href], button';
const row = (id: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`[data-row="${id}"]`);
  if (found === null) throw new Error(`rangée ${id} absente`);
  return found;
};
const primary = (id: string): HTMLElement => {
  const link = row(id).querySelector<HTMLElement>('[data-row-primary]');
  if (link === null) throw new Error(`lien de ${id} absent`);
  return link;
};
const tabStops = (scope: ParentNode): HTMLElement[] => [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0);
const press = (key: string) =>
  act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
const focusedRow = () => document.activeElement?.closest('[data-row]')?.getAttribute('data-row');

describe('LensRow — un arrêt de tabulation par rangée, les flèches pour le reste', () => {
  test('chaque rangée n’offre à la tabulation que son lien vers le fil — ni l’avatar, ni le bouton d’actions', () => {
    mount();
    for (const { id } of ROWS) {
      expect(tabStops(row(id))).toEqual([primary(id)]);
    }
    const actions = row('c-amina').querySelector('button[aria-haspopup="menu"]');
    expect(actions?.getAttribute('aria-hidden')).toBeNull();
  });

  test('une fois dans la liste, elle n’est plus qu’UN arrêt : la rangée qui a eu le focus', () => {
    mount();
    act(() => primary('c-amina').focus());
    expect(tabStops(container)).toEqual([primary('c-amina')]);
  });

  test('bas et haut changent de rangée ; Fin et Début vont aux bouts', () => {
    mount();
    act(() => primary('c-lyon').focus());
    press('ArrowDown');
    expect(document.activeElement).toBe(primary('c-amina'));
    press('ArrowDown');
    expect(document.activeElement).toBe(primary('c-paris'));
    press('ArrowDown');
    expect(document.activeElement).toBe(primary('c-paris'));
    press('Home');
    expect(document.activeElement).toBe(primary('c-lyon'));
    press('End');
    expect(document.activeElement).toBe(primary('c-paris'));
    press('ArrowUp');
    expect(document.activeElement).toBe(primary('c-amina'));
    expect(tabStops(container)).toEqual([primary('c-amina')]);
  });

  test('droite mène du lien au bouton d’actions de SA rangée, gauche ramène au lien puis à l’avatar', () => {
    mount();
    act(() => primary('c-amina').focus());
    press('ArrowRight');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Actions de conversation');
    expect(focusedRow()).toBe('c-amina');
    press('ArrowLeft');
    expect(document.activeElement).toBe(primary('c-amina'));
    press('ArrowLeft');
    expect(document.activeElement?.getAttribute('aria-label')).toContain('Amina');
    expect(focusedRow()).toBe('c-amina');
  });

  test('dans le menu ouvert, les flèches restent au menu — elles ne changent pas de rangée', async () => {
    mount();
    act(() => primary('c-lyon').focus());
    press('ArrowRight');
    act(() => (document.activeElement as HTMLElement | null)?.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    const before = document.activeElement;
    expect(before?.closest('[role="menu"]')).not.toBeNull();
    press('ArrowDown');
    expect(document.activeElement).not.toBe(before);
    expect(document.activeElement?.closest('[role="menu"]')).not.toBeNull();
  });
});

const openMenuOf = (id: string) => act(() => row(id).querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.click());
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
const entry = (label: string) => [...document.body.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find((b) => b.textContent?.startsWith(label) === true);

describe('LensRow — Rechercher et Mode de lecture ont un effet (#11226)', () => {
  test('« Rechercher » ouvre le fil de la conversation sur sa recherche', () => {
    mount();
    openMenuOf('c-lyon');
    act(() => entry('Rechercher')?.click());
    expect(`${window.location.pathname}${window.location.search}`).toBe('/c/c-lyon?search=1');
  });

  test('« Mode de lecture › Bulles » écrit la préférence de CETTE conversation, « Automatique » l’efface', async () => {
    window.history.replaceState(null, '', '/chats');
    mount();
    openMenuOf('c-paris');
    act(() => entry('Mode de lecture')?.click());
    await settle();
    act(() => entry('Bulles')?.click());
    expect(readingModeStore.getPreference('u_u-moi', 'c-paris')).toBe('bubbles');
    expect(readingModeStore.getPreference('u_u-moi', 'c-lyon')).toBeNull();
    openMenuOf('c-paris');
    act(() => entry('Mode de lecture')?.click());
    await settle();
    expect(entry('Bulles')?.getAttribute('aria-checked')).toBe('true');
    act(() => entry('Automatique')?.click());
    expect(readingModeStore.getPreference('u_u-moi', 'c-paris')).toBeNull();
  });

  test('un mode indisponible s’annonce désactivé et ne s’écrit pas', async () => {
    window.history.replaceState(null, '', '/chats');
    mount();
    openMenuOf('c-paris');
    act(() => entry('Mode de lecture')?.click());
    await settle();
    const river = entry('Rivière');
    expect(river?.getAttribute('aria-disabled')).toBe('true');
    act(() => river?.click());
    expect(readingModeStore.getPreference('u_u-moi', 'c-paris')).toBeNull();
  });
});
