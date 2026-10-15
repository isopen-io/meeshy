import { readFileSync } from 'node:fs';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { departureStore } from '@/lib/conversation-departure';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ROW_SWIPE_MAX_ACTIONS } from '@/lib/view/conversation-row-swipe';
import { dismissOpenRowSwipe } from '@/lib/view/row-swipe-open';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ROW_SWIPE_SETTLE_MS, useDismissRowSwipeOnViewChange } from './conversation-row-swipe';
import { LensRow } from './lens-row';

/**
 * **UNE LIGNE DE CONVERSATION SE BALAIE** (#10580) — la rangée montée en DOM
 * réel, pilotée par des événements de pointeur : les deux bords et leurs
 * actions, le geste progressif et annulable, et tout ce qui la remet en place.
 */
const conversation = (id: string, title: string): Conversation =>
  ({
    id,
    type: 'group',
    title,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 4,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
  }) as unknown as Conversation;

const LYON = conversation('c-lyon', 'Équipe Lyon');
const PARIS = conversation('c-paris', 'Équipe Paris');
const FLAGS: ConversationFlags = { isPinned: false, isMuted: false, isArchived: false };
const LANGUAGES: readonly string[] = ['fr'];

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement | undefined;
let root: Root | undefined;

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
afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  departureStore.setState({ request: null, failure: null });
  await act(async () => {});
});

type Mounted = {
  readonly actions: string[];
  readonly opened: string[];
  readonly row: (id: string) => HTMLElement;
  readonly outside: HTMLElement;
};

async function monter(options: { readonly flags?: ConversationFlags; readonly dir?: 'rtl'; readonly unread?: number } = {}): Promise<Mounted> {
  const actions: string[] = [];
  const opened: string[] = [];
  const onRowAction = (id: string, action: string) => void actions.push(`${id}:${action}`);
  const host = document.createElement('div');
  document.body.append(host);
  container = host;
  root = createRoot(host);
  await act(async () =>
    root?.render(
      <div {...(options.dir === undefined ? {} : { dir: options.dir })}>
        <button type="button" data-outside>
          en-tête
        </button>
        <ul
          onClick={(event) => {
            const link = (event.target as Element).closest('a');
            if (link === null) return;
            event.preventDefault();
            opened.push(link.getAttribute('href') ?? '');
          }}
        >
          {[LYON, PARIS].map((item) => (
            <LensRow
              key={item.id}
              conversation={item}
              languages={LANGUAGES}
              viewerId="u-moi"
              flags={options.flags ?? FLAGS}
              unreadCount={options.unread ?? 0}
              onRowAction={onRowAction}
            />
          ))}
        </ul>
      </div>,
    ),
  );
  const row = (id: string): HTMLElement => {
    const found = host.querySelector<HTMLElement>(`[data-row="${id}"]`);
    if (found === null) throw new Error(`rangée ${id} absente`);
    return found;
  };
  const outside = host.querySelector<HTMLElement>('[data-outside]');
  if (outside === null) throw new Error('en-tête absent');
  return { actions, opened, row, outside };
}

const pointer = (type: string, x: number, y: number, pointerType = 'touch') =>
  new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType, isPrimary: true });

async function glisser(surface: Element, path: readonly (readonly [number, number])[], pointerType = 'touch') {
  const [first, ...rest] = path;
  if (first === undefined) return;
  await act(async () => surface.dispatchEvent(pointer('pointerdown', first[0], first[1], pointerType)));
  for (const [x, y] of rest) await act(async () => surface.dispatchEvent(pointer('pointermove', x, y, pointerType)));
  const last = rest[rest.length - 1] ?? first;
  await act(async () => surface.dispatchEvent(pointer('pointerup', last[0], last[1], pointerType)));
}

const versLaDroite = (surface: Element, distance: number) => glisser(surface, [[100, 40], [100 + distance, 41]]);
const versLaGauche = (surface: Element, distance: number) => glisser(surface, [[300, 40], [300 - distance, 41]]);

const offsetOf = (row: HTMLElement): string => row.style.getPropertyValue('--row-swipe');
const stateOf = (row: HTMLElement): string | null => row.getAttribute('data-row-swipe');
const zoneOf = (row: HTMLElement): HTMLElement | null => row.querySelector<HTMLElement>('[data-row-swipe-actions]');
const labelsOf = (row: HTMLElement): readonly string[] =>
  [...row.querySelectorAll<HTMLButtonElement>('[data-row-swipe-actions] button')].map((button) => button.textContent ?? '');
const actionOf = (row: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...row.querySelectorAll<HTMLButtonElement>('[data-row-swipe-actions] button')].find((button) => button.textContent === label);
  if (found === undefined) throw new Error(`action « ${label} » absente`);
  return found;
};
const reposer = () => act(async () => new Promise<void>((resolve) => setTimeout(resolve, ROW_SWIPE_SETTLE_MS + 40)));
const estFermee = (row: HTMLElement): boolean => stateOf(row) === null && zoneOf(row) === null && offsetOf(row) === '';

describe('LensRow — les deux bords', () => {
  test('au repos, aucune action de balayage n’est montée — le menu « ⋮ » reste', async () => {
    const { row } = await monter();
    expect(zoneOf(row('c-lyon'))).toBeNull();
    expect(row('c-lyon').querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
  });

  test('vers la droite : Épingler puis Silence, au bord de début', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    expect(stateOf(row('c-lyon'))).toBe('open');
    expect(zoneOf(row('c-lyon'))?.getAttribute('data-row-swipe-actions')).toBe('leading');
    expect(labelsOf(row('c-lyon'))).toEqual(['Épingler', 'Silence']);
    expect(offsetOf(row('c-lyon'))).toBe('152px');
  });

  test('vers la gauche : Archiver, Lu / Non lu, Supprimer, au bord de fin', async () => {
    const { row } = await monter();
    await versLaGauche(row('c-lyon'), 100);
    expect(zoneOf(row('c-lyon'))?.getAttribute('data-row-swipe-actions')).toBe('trailing');
    expect(labelsOf(row('c-lyon'))).toEqual(['Archiver', 'Non lu', 'Supprimer']);
    expect(offsetOf(row('c-lyon'))).toBe('-228px');
  });

  test('aucun bord ne monte plus de 3 boutons', async () => {
    const { row } = await monter({ flags: { isPinned: true, isMuted: true, isArchived: true }, unread: 4 });
    await versLaGauche(row('c-lyon'), 100);
    expect(labelsOf(row('c-lyon')).length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
    await reposer();
    await versLaDroite(row('c-paris'), 80);
    expect(labelsOf(row('c-paris')).length).toBeLessThanOrEqual(ROW_SWIPE_MAX_ACTIONS);
  });

  test('archive imposée : « Désarchiver » ne se balaie pas', async () => {
    const { row } = await monter({ flags: { isPinned: false, isMuted: false, isArchived: true, archiveLocked: true } });
    await versLaGauche(row('c-lyon'), 100);
    expect(labelsOf(row('c-lyon'))).toEqual(['Non lu', 'Supprimer']);
    expect(offsetOf(row('c-lyon'))).toBe('-152px');
  });

  test('en arabe, le bord de début se révèle en balayant vers la GAUCHE', async () => {
    const { row } = await monter({ dir: 'rtl' });
    await versLaGauche(row('c-lyon'), 80);
    expect(zoneOf(row('c-lyon'))?.getAttribute('data-row-swipe-actions')).toBe('leading');
    expect(offsetOf(row('c-lyon'))).toBe('-152px');
  });

  test('les actions révélées sont de vrais boutons nommés', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    const button = actionOf(row('c-lyon'), 'Épingler');
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(zoneOf(row('c-lyon'))?.getAttribute('role')).toBe('group');
  });
});

describe('LensRow — le geste', () => {
  test('la ligne suit le doigt pendant le balayage, actions montées', async () => {
    const { row } = await monter();
    const surface = row('c-lyon');
    await act(async () => surface.dispatchEvent(pointer('pointerdown', 100, 40)));
    await act(async () => surface.dispatchEvent(pointer('pointermove', 140, 41)));
    expect(stateOf(surface)).toBe('dragging');
    expect(offsetOf(surface)).toBe('40px');
    expect(surface.style.getPropertyValue('--row-reveal')).toBe('40px');
    expect(labelsOf(surface)).toEqual(['Épingler', 'Silence']);
    await act(async () => surface.dispatchEvent(pointer('pointermove', 60, 41)));
    expect(offsetOf(surface)).toBe('-40px');
    expect(zoneOf(surface)?.getAttribute('data-row-swipe-actions')).toBe('trailing');
    await act(async () => surface.dispatchEvent(pointer('pointerup', 60, 41)));
  });

  test('relâchée avant 35 % de la zone, elle revient en place et démonte ses actions', async () => {
    const { row, actions } = await monter();
    await versLaDroite(row('c-lyon'), 40);
    expect(offsetOf(row('c-lyon'))).toBe('0px');
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
    expect(actions).toEqual([]);
  });

  test('un geste vertical appartient au défilement', async () => {
    const { row } = await monter();
    await glisser(row('c-lyon'), [[100, 40], [130, 200]]);
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('la souris ne balaie pas', async () => {
    const { row } = await monter();
    await glisser(row('c-lyon'), [[100, 40], [240, 41]], 'mouse');
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('le geste interrompu par le système revient à sa position de départ', async () => {
    const { row } = await monter();
    const surface = row('c-lyon');
    await act(async () => surface.dispatchEvent(pointer('pointerdown', 100, 40)));
    await act(async () => surface.dispatchEvent(pointer('pointermove', 220, 41)));
    await act(async () => surface.dispatchEvent(pointer('pointercancel', 220, 41)));
    expect(offsetOf(surface)).toBe('0px');
    await reposer();
    expect(estFermee(surface)).toBe(true);
  });

  test('mouvement réduit : le retour est immédiat, sans attendre de transition', async () => {
    const host = globalThis as { matchMedia?: unknown };
    const native = host.matchMedia;
    host.matchMedia = (query: string) => ({ matches: query.includes('prefers-reduced-motion') });
    try {
      const { row } = await monter();
      await versLaDroite(row('c-lyon'), 40);
      expect(estFermee(row('c-lyon'))).toBe(true);
    } finally {
      host.matchMedia = native;
    }
  });

  test('le clic qui suit un balayage n’ouvre pas la conversation', async () => {
    const { row, opened } = await monter();
    await versLaDroite(row('c-lyon'), 40);
    await act(async () => row('c-lyon').querySelector<HTMLElement>('[data-name]')?.click());
    expect(opened).toEqual([]);
  });

  test('ouverte, le balayage inverse la referme', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await versLaGauche(row('c-lyon'), 80);
    expect(offsetOf(row('c-lyon'))).toBe('0px');
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });
});

describe('LensRow — le retour en place', () => {
  test('choisir une action l’exécute et referme la ligne', async () => {
    const { row, actions } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => actionOf(row('c-lyon'), 'Épingler').click());
    expect(actions).toEqual(['c-lyon:pin']);
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('« Supprimer » demande la confirmation existante, jamais une action de drapeau', async () => {
    const { row, actions } = await monter();
    await versLaGauche(row('c-lyon'), 100);
    await act(async () => actionOf(row('c-lyon'), 'Supprimer').click());
    expect(departureStore.getState().request).toEqual({ conversationId: 'c-lyon', kind: 'delete', returnToList: false });
    expect(actions).toEqual([]);
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('toucher le contenu d’une ligne ouverte la referme SANS ouvrir la conversation', async () => {
    const { row, opened } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await reposer();
    const name = row('c-lyon').querySelector<HTMLElement>('[data-name]');
    await act(async () => name?.dispatchEvent(pointer('pointerdown', 200, 40)));
    await act(async () => name?.dispatchEvent(pointer('pointerup', 200, 40)));
    await act(async () => name?.click());
    expect(opened).toEqual([]);
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
    await act(async () => name?.click());
    expect(opened.length).toBe(1);
  });

  test('toucher ailleurs — l’en-tête — la referme', async () => {
    const { row, outside } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => outside.dispatchEvent(pointer('pointerdown', 10, 10)));
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('une seule ligne ouverte : en balayer une autre referme la première', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await versLaGauche(row('c-paris'), 100);
    expect(stateOf(row('c-paris'))).toBe('open');
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
    expect(container?.querySelectorAll('[data-row-swipe="open"]').length).toBe(1);
  });

  test('faire défiler la referme', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => row('c-lyon').parentElement?.dispatchEvent(new Event('scroll')));
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('changer de vue — filtre ou recherche — la referme', async () => {
    const actions: string[] = [];
    const onRowAction = (id: string, action: string) => void actions.push(`${id}:${action}`);
    function Liste({ view }: { readonly view: string }) {
      useDismissRowSwipeOnViewChange(view);
      return (
        <ul>
          <LensRow conversation={LYON} languages={LANGUAGES} viewerId="u-moi" flags={FLAGS} unreadCount={0} onRowAction={onRowAction} />
        </ul>
      );
    }
    const host = document.createElement('div');
    document.body.append(host);
    container = host;
    root = createRoot(host);
    await act(async () => root?.render(<Liste view="all" />));
    const row = host.querySelector<HTMLElement>('[data-row="c-lyon"]');
    if (row === null) throw new Error('rangée absente');
    await versLaDroite(row, 80);
    await act(async () => root?.render(<Liste view="all" />));
    expect(stateOf(row)).toBe('open');
    await act(async () => root?.render(<Liste view="unread" />));
    await reposer();
    expect(estFermee(row)).toBe(true);
  });

  test('la durée du retour est celle de la feuille de style', () => {
    const css = readFileSync(new URL('../styles/conversation-row-swipe.css', import.meta.url).pathname, 'utf8');
    const durations = [...css.matchAll(/(?:translate|width) (\d+)ms/g)].map((found) => Number(found[1]));
    expect(durations.length).toBe(2);
    expect(durations.every((duration) => duration === ROW_SWIPE_SETTLE_MS)).toBe(true);
  });

  test('le retour matériel la referme sans quitter la liste', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('Échap la referme', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    await reposer();
    expect(estFermee(row('c-lyon'))).toBe(true);
  });

  test('une ligne démontée ouverte ne retient rien : la suivante s’ouvre seule', async () => {
    const { row } = await monter();
    await versLaDroite(row('c-lyon'), 80);
    await act(async () => root?.unmount());
    root = undefined;
    expect(() => dismissOpenRowSwipe()).not.toThrow();
  });
});
