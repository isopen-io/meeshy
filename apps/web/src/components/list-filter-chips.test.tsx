import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { useState } from 'react';

import { NEUTRAL_SELECTION, toggleFilter, type ListSelection } from '@/lib/lens/filters';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ListFilterChips } from './list-filter-chips';

/**
 * LES PUCES DE LA LISTE : QUATRE AU REPOS, LE RARE DERRIÈRE « PLUS » (épure #18361, règle 6).
 * Tous, Non lus, Personnel, Privée restent à l'écran ; Ouvertes, Globales, Channels, Favoris, Épinglés et Archivées
 * se rangent derrière « Plus » — et restent atteignables, et visibles dès que l'une d'elles est posée.
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, click, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadRowMenuCatalog('fr');
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

function Host({ initial = NEUTRAL_SELECTION }: { readonly initial?: ListSelection }) {
  const [selection, setSelection] = useState<ListSelection>(initial);
  return <ListFilterChips selection={selection} language="fr" onToggle={(filter) => setSelection((current) => toggleFilter(filter, current))} />;
}

const shown = (host: ParentNode) => [...host.querySelectorAll('[data-list-filter]')].map((node) => node.getAttribute('data-list-filter'));
const more = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[data-list-filters-more]');

describe('les puces au repos', () => {
  test('quatre puces et « Plus » : les six autres ne sont pas à l’écran', async () => {
    const host = await mount(<Host />);
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private']);
    expect(more(host)?.textContent).toBe('Plus');
    expect(more(host)?.getAttribute('aria-expanded')).toBe('false');
  });

  test('« Plus » ouvre les six autres, dans l’ordre des puces, et se referme', async () => {
    const host = await mount(<Host />);
    await click(more(host));
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private', 'open', 'global', 'channels', 'favorites', 'pinned', 'archived']);
    expect(more(host)?.getAttribute('aria-expanded')).toBe('true');
    await click(more(host));
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private']);
  });

  test('une puce rangée se pose depuis « Plus » et reste visible tant qu’elle est posée', async () => {
    const host = await mount(<Host />);
    await click(more(host));
    await click(host.querySelector('[data-list-filter="archived"]'));
    expect(host.querySelector('[data-list-filter="archived"]')?.getAttribute('aria-pressed')).toBe('true');
    await click(more(host));
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private', 'archived']);
    expect(more(host)?.getAttribute('aria-expanded')).toBe('false');
  });

  test('« Plus » n’est jamais inerte : avec une puce rangée posée, il replie les autres et les rouvre', async () => {
    const host = await mount(<Host initial={['pinned']} />);
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private', 'pinned']);
    await click(more(host));
    expect(shown(host)).toHaveLength(10);
    await click(more(host));
    expect(shown(host)).toEqual(['all', 'unread', 'personal', 'private', 'pinned']);
  });

  test('une sélection rangée au montage (Épinglés) n’est jamais cachée', async () => {
    const host = await mount(<Host initial={['pinned']} />);
    expect(host.querySelector('[data-list-filter="pinned"]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
