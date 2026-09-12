import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { ConversationRail } from './conversation-rail';
import type { Conversation } from '@/lib/api/types';
import type { ConversationOverride } from '@/lib/conversation-store';

/**
 * `ConversationRail` — UN rail, DEUX géographies (#6103). Voir le
 * doc-comment du module pour le pourquoi (`StoryTrayView.swift`,
 * `ConversationListView.swift:1659-1671`).
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(() => {
  if (root !== undefined) {
    const r = root;
    act(() => {
      r.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

const conversation = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c1',
    title: 'Sans titre',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

function mount(props: {
  readonly variant: 'grande' | 'pinned';
  readonly conversations: readonly Conversation[];
  readonly overrides?: Readonly<Record<string, ConversationOverride>>;
  readonly loading?: boolean;
  readonly inert?: boolean;
}): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  const r = createRoot(c);
  container = c;
  root = r;
  act(() => {
    r.render(
      <ConversationRail
        variant={props.variant}
        conversations={props.conversations}
        viewerId="u-viewer"
        overrides={props.overrides ?? {}}
        loading={props.loading ?? false}
        {...(props.inert === undefined ? {} : { inert: props.inert })}
      />,
    );
  });
  return c;
}

describe('ConversationRail — la grande en flux, la compacte épinglée', () => {
  test('`grande` rend un `ul[data-rail="grande"]`, tuiles GRANDES, libellés visibles', () => {
    const el = mount({ variant: 'grande', conversations: [conversation({ id: 'c-1', title: 'Amina Diallo' })] });
    const ul = el.querySelector('ul[data-rail="grande"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector('[data-rail-tile="72"]')).not.toBeNull();
    expect(el.textContent).toContain('Amina Diallo');
  });

  test('`pinned` rend un `ul[data-rail="pinned"]`, tuiles COMPACTES, aucun libellé — aria-label conservé', () => {
    const el = mount({ variant: 'pinned', conversations: [conversation({ id: 'c-1', title: 'Amina Diallo' })] });
    const ul = el.querySelector('ul[data-rail="pinned"]');
    expect(ul).not.toBeNull();
    expect(ul?.querySelector('[data-rail-tile="30"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Amina Diallo');
    expect(ul?.getAttribute('aria-label')).toBe('Accès rapide aux conversations');
  });

  test('les conversations ARCHIVÉES sont exclues, dans les DEUX géographies', () => {
    const archived = conversation({ id: 'c-archivee', title: 'Archivée', userPreferences: [{ isArchived: true }] });
    const active = conversation({ id: 'c-active', title: 'Active' });
    for (const variant of ['grande', 'pinned'] as const) {
      const el = mount({ variant, conversations: [archived, active] });
      expect(el.textContent).not.toContain('Archivée');
      expect(el.querySelectorAll('[data-rail-tile]').length).toBe(1);
    }
  });

  test('chargement + corpus vide, `grande` ⇒ UNE tuile fantôme aria-hidden', () => {
    const el = mount({ variant: 'grande', conversations: [], loading: true });
    const fantome = el.querySelector('[aria-hidden="true"]');
    expect(fantome).not.toBeNull();
    expect((fantome as HTMLElement).style.visibility).toBe('hidden');
  });

  test('chargement + corpus vide, `pinned` ⇒ AUCUNE tuile fantôme', () => {
    const el = mount({ variant: 'pinned', conversations: [], loading: true });
    expect(el.querySelector('ul[data-rail="pinned"]')).toBeNull();
  });

  test('corpus vide SANS chargement ⇒ rien de rendu', () => {
    const el = mount({ variant: 'grande', conversations: [], loading: false });
    expect(el.innerHTML).toBe('');
  });

  test('le conteneur horizontal masque sa barre de défilement (iOS `showsIndicators: false`)', () => {
    const el = mount({ variant: 'grande', conversations: [conversation({ id: 'c-1' })] });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.style.scrollbarWidth).toBe('none');
  });
});

/**
 * `inert` — LE GRAND RAIL NE DOUBLE PAS LA BANDE AU CLAVIER (#6103,
 * revue-correction). Voir le doc-comment du module : sans cette garde, les
 * liens du grand rail restaient à la fois dans l'ordre de TABULATION et
 * dans l'arbre D'ACCESSIBILITÉ pendant que la bande, montée ailleurs,
 * portait le MÊME corpus sous le MÊME `aria-label` — un doublon, dans les
 * deux sens.
 */
describe('ConversationRail — `inert` retire le grand rail du clavier et de l’accessibilité', () => {
  test('`inert` pose l’attribut HTML natif sur le `<ul>`', () => {
    const el = mount({ variant: 'grande', conversations: [conversation({ id: 'c-1' })], inert: true });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(true);
  });

  test('sans `inert` (défaut), le `<ul>` reste un attribut ABSENT — jamais `inert="false"`', () => {
    const el = mount({ variant: 'grande', conversations: [conversation({ id: 'c-1' })] });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(false);
  });

  test('`inert` : aucun lien du rail n’est FOCALISABLE — `.focus()` reste sans effet', () => {
    const el = mount({
      variant: 'grande',
      conversations: [conversation({ id: 'c-1', title: 'Amina Diallo' })],
      inert: true,
    });
    const lien = el.querySelector('a[data-conversation="c-1"]') as HTMLElement;
    document.body.focus();
    act(() => {
      lien.focus();
    });
    // Un `<ul>` marqué `inert` retire tout son sous-arbre de l'ordre de
    // tabulation ET empêche le focus PROGRAMMATIQUE : `.focus()` sur un lien
    // qu'il contient ne doit JAMAIS le rendre actif.
    expect(document.activeElement).not.toBe(lien);
  });

  test('`inert` : la région perd son `aria-label` — deux régions ne peuvent plus s’annoncer sous le MÊME nom', () => {
    const el = mount({ variant: 'grande', conversations: [conversation({ id: 'c-1' })], inert: true });
    const ul = el.querySelector('ul[data-rail="grande"]') as HTMLElement;
    expect(ul.getAttribute('aria-label')).toBeNull();
  });

  test('`pinned` n’est JAMAIS inerte — la bande qui remplace le titre reste, elle, atteignable', () => {
    const el = mount({ variant: 'pinned', conversations: [conversation({ id: 'c-1', title: 'Amina Diallo' })] });
    const ul = el.querySelector('ul[data-rail="pinned"]') as HTMLElement;
    expect(ul.hasAttribute('inert')).toBe(false);
    const lien = el.querySelector('a[data-conversation="c-1"]') as HTMLElement;
    act(() => {
      lien.focus();
    });
    expect(document.activeElement).toBe(lien);
  });
});
