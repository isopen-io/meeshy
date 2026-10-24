import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { resolveLensSections, type LensSection as LensSectionData } from '@/lib/lens/sections';
import { LONG_PRESS_MS } from '@/lib/view/long-press';
import { rowRoving } from '@/lib/view/row-roving';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow, ROW_HEIGHT } from './lens-row';
import { LensVirtualSections } from './lens-virtual-sections';

/**
 * LA LISTE DES CONVERSATIONS NE MONTE QUE CE QUI SE VOIT (#11228) — sur cinq
 * cents conversations, pas sur sept. Les témoins passent par les VRAIES
 * rangées (`LensRow`) et les VRAIES sections (`resolveLensSections`) : le
 * clavier, l'appui long et les épingles qu'on vérifie ici sont ceux que
 * l'utilisateur touche.
 */

const NOW = new Date('2026-10-20T12:00:00Z');
const DAY = 86_400_000;

const conversationAt = (index: number): Conversation =>
  ({
    id: `c-${String(index).padStart(3, '0')}`,
    type: 'group',
    title: `Groupe ${index}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date(NOW.getTime() - (30 + index) * DAY),
    lastMessageAt: new Date(NOW.getTime() - (30 + index) * DAY),
    unreadCount: 0,
    currentUserRole: 'member',
    isMember: true,
  }) as unknown as Conversation;

const CORPUS: readonly Conversation[] = Array.from({ length: 500 }, (_, index) => conversationAt(index));
const PINNED = ['c-250', 'c-480'];

const sectionsOf = (conversations: readonly Conversation[], pinned: readonly string[] = []): readonly LensSectionData[] =>
  resolveLensSections({
    conversations,
    overrides: Object.fromEntries(pinned.map((id) => [id, { flags: { isPinned: true } }])),
    now: NOW,
    timeZone: 'UTC',
  });

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  await loadRowMenuCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/chats');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function List({ sections }: { readonly sections: readonly LensSectionData[] }) {
  const frame = useRef<HTMLUListElement | null>(null);
  return (
    <ul ref={frame} id="contenu">
      <LensVirtualSections
        frame={frame}
        sections={sections}
        folds={sections.map(() => undefined)}
        rowOf={(c) => (
          <LensRow
            key={c.id}
            conversation={c}
            languages={['fr']}
            viewerId="u-moi"
            flags={{ isPinned: PINNED.includes(c.id), isMuted: false, isArchived: false }}
            unreadCount={0}
            onRowAction={() => {}}
          />
        )}
      />
    </ul>
  );
}

function mount(sections: readonly LensSectionData[]) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<List sections={sections} />);
  });
}

const frame = (): HTMLElement => {
  const node = container.querySelector<HTMLElement>('#contenu');
  if (node === null) throw new Error('défileur introuvable');
  return node;
};
const mountedRows = (scope: ParentNode = container): readonly string[] =>
  [...scope.querySelectorAll<HTMLElement>('[data-row]')].map((row) => row.dataset.row ?? '');
const section = (id: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(`[data-section="${id}"]`);
  if (node === null) throw new Error(`section ${id} introuvable`);
  return node;
};
const primaryOf = (id: string): HTMLElement => {
  const node = container.querySelector<HTMLElement>(`[data-row="${id}"] [data-row-primary]`);
  if (node === null) throw new Error(`lien de ${id} introuvable`);
  return node;
};

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/**
 * DÉFILER UNE SECTION — happy-dom ne met rien en page : la tête de la
 * section (sa cale d'ancrage) est posée à `-rows × 84` sous le haut du
 * défileur, comme après un défilement réel, puis l'événement part.
 */
async function scrollSectionTo(id: string, rows: number) {
  const anchor = section(id).querySelector<HTMLElement>('[data-row-gap]');
  if (anchor === null) throw new Error(`ancre de ${id} introuvable`);
  const top = -rows * ROW_HEIGHT;
  anchor.getBoundingClientRect = () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) }) as DOMRect;
  act(() => {
    frame().dispatchEvent(new Event('scroll'));
  });
  await wait(40);
}

describe('LensVirtualSections — la liste ne monte que les rangées visibles', () => {
  test('cinq cents conversations ⇒ moins de quarante rangées montées, et la hauteur de toutes réservée', () => {
    mount(sectionsOf(CORPUS));
    expect(mountedRows().length).toBeLessThan(40);
    const reserved = [...container.querySelectorAll<HTMLElement>('[data-row-gap]')].reduce((sum, gap) => sum + Number.parseFloat(gap.style.height || '0'), 0);
    expect(reserved + mountedRows().length * ROW_HEIGHT).toBe(500 * ROW_HEIGHT);
  });

  test('défiler ⇒ la fenêtre suit : les rangées du milieu se montent, celles du haut se démontent', async () => {
    mount(sectionsOf(CORPUS));
    expect(mountedRows()).toContain('c-005');
    await scrollSectionTo('lentille.older', 200);
    expect(mountedRows()).toContain('c-200');
    expect(mountedRows()).toContain('c-205');
    expect(mountedRows()).not.toContain('c-005');
    expect(mountedRows().length).toBeLessThan(40);
  });

  test('les deux bouts de la liste restent montés : Début et Fin y mènent', async () => {
    mount(sectionsOf(CORPUS));
    await scrollSectionTo('lentille.older', 200);
    expect(mountedRows()).toContain('c-000');
    expect(mountedRows()).toContain('c-499');
  });

  test('l’épinglée reste dans SA section, montée ou pas', async () => {
    mount(sectionsOf(CORPUS, PINNED));
    expect(mountedRows(section('pinned'))).toEqual(['c-250', 'c-480']);
    await scrollSectionTo('lentille.older', 240);
    expect(mountedRows(section('lentille.older'))).not.toContain('c-250');
    expect(section('pinned').querySelector('[data-sticker="pinned"]')).not.toBeNull();
    expect(mountedRows(section('pinned'))).toEqual(['c-250', 'c-480']);
  });

  test('le focus clavier survit au défilement : la rangée qui tient l’arrêt reste montée', async () => {
    mount(sectionsOf(CORPUS));
    act(() => primaryOf('c-004').focus());
    expect(rowRoving.snapshot()).toBe('c-004');
    await scrollSectionTo('lentille.older', 300);
    expect(mountedRows()).toContain('c-004');
    expect(document.activeElement).toBe(primaryOf('c-004'));
    act(() => {
      primaryOf('c-004').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(primaryOf('c-005'));
    act(() => primaryOf('c-005').blur());
    rowRoving.release('c-005');
  });

  test('Fin mène à la dernière conversation, même hors fenêtre', async () => {
    mount(sectionsOf(CORPUS));
    act(() => primaryOf('c-002').focus());
    act(() => {
      primaryOf('c-002').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(primaryOf('c-499'));
    act(() => primaryOf('c-499').blur());
    rowRoving.release('c-499');
  });

  test('l’appui long ouvre l’aperçu sur une rangée virtualisée', async () => {
    mount(sectionsOf(CORPUS));
    await scrollSectionTo('lentille.older', 300);
    const link = container.querySelector<HTMLElement>('[data-row="c-302"] a[href="/c/c-302"]:not([aria-hidden])');
    if (link === null) throw new Error('rangée c-302 non montée');
    act(() => {
      link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerType: 'touch', pointerId: 9, clientX: 40, clientY: 40 }));
    });
    await wait(LONG_PRESS_MS + 40);
    expect(document.body.querySelector('[data-conversation-peek]')).not.toBeNull();
  });
});
