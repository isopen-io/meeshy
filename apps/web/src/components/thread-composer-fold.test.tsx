import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { SafeStorage } from '@/lib/storage';
import { composerFoldMemory, type ComposerFoldMemory } from '@/lib/view/composer-fold-memory';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadComposerChrome } from './thread-composer-chrome';

/**
 * #16341 (et #9955 côté web) — LA BARRE D'UNE CONVERSATION SE REPLIE, ET LA
 * CONVERSATION S'EN SOUVIENT. Le ⌄, tout à droite, la réduit à une bulle ; la
 * bulle la rouvre ; le brouillon reste monté. Revenir dans la conversation, ou
 * recharger, la retrouve repliée ; une autre conversation reste dépliée.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const disk = (): SafeStorage => {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
};

function mount(conversationId: string, memory: ComposerFoldMemory) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() =>
    root.render(
      <ThreadComposerChrome fold={{ conversationId, memory }}>
        <form data-composer="">
          <textarea data-field defaultValue="brouillon" />
        </form>
      </ThreadComposerChrome>,
    ),
  );
  return {
    container,
    folded: () => container.querySelector('[data-composer-unfold]') !== null,
    click: (selector: string) => act(() => container.querySelector<HTMLElement>(selector)!.click()),
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('le repli de la barre d’une conversation (#16341)', () => {
  test('dépliée par défaut, le ⌄ tout à droite porte son libellé', () => {
    const view = mount('c-1', composerFoldMemory(disk()));
    expect(view.folded()).toBe(false);
    expect(view.container.querySelector('[data-composer-fold]')?.getAttribute('aria-label')).toBe('Réduire la barre de message');
    view.close();
  });

  test('le ⌄ replie en une bulle, le brouillon reste monté, la bulle rouvre', () => {
    const view = mount('c-1', composerFoldMemory(disk()));
    view.click('[data-composer-fold]');
    expect(view.folded()).toBe(true);
    expect(view.container.querySelector('[data-composer-unfold]')?.getAttribute('aria-label')).toBe('Afficher la barre de message');
    expect(view.container.querySelector('[data-composer-fold]')).toBeNull();
    expect(view.container.querySelector<HTMLTextAreaElement>('[data-field]')?.value).toBe('brouillon');
    view.click('[data-composer-unfold]');
    expect(view.folded()).toBe(false);
    view.close();
  });

  test('revenir dans la conversation (ou recharger) la retrouve repliée ; une autre reste dépliée', () => {
    const storage = disk();
    const first = mount('c-1', composerFoldMemory(storage));
    first.click('[data-composer-fold]');
    first.close();
    const again = mount('c-1', composerFoldMemory(storage));
    expect(again.folded()).toBe(true);
    again.close();
    const other = mount('c-2', composerFoldMemory(storage));
    expect(other.folded()).toBe(false);
    other.close();
  });

  test('rouvrir s’en souvient aussi', () => {
    const storage = disk();
    const first = mount('c-1', composerFoldMemory(storage));
    first.click('[data-composer-fold]');
    first.click('[data-composer-unfold]');
    first.close();
    const again = mount('c-1', composerFoldMemory(storage));
    expect(again.folded()).toBe(false);
    again.close();
  });

  test('une saisie qui commence (focus sur le champ, ex. « Répondre ») rouvre la barre', () => {
    const view = mount('c-1', composerFoldMemory(disk()));
    view.click('[data-composer-fold]');
    act(() => view.container.querySelector<HTMLTextAreaElement>('[data-field]')!.focus());
    expect(view.folded()).toBe(false);
    view.close();
  });

  test('sans conversation (le bandeau qui remplace la barre), aucun repli n’est offert', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<ThreadComposerChrome><p>verrou</p></ThreadComposerChrome>));
    expect(container.querySelector('[data-composer-fold]')).toBeNull();
    act(() => root.unmount());
    container.remove();
  });
});
