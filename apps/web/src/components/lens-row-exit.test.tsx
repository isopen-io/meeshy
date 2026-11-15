import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Conversation } from '@/lib/api/types';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ExitPresence } from '@/lib/view/exit-presence';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LensRow } from './lens-row';
import { LensSection } from './lens-sticker';

/**
 * LA LIGNE DE LA LISTE PORTE SA SORTIE (#11574) — montée sous l'`ExitPresence`
 * de l'écran, une ligne archivée reste à sa place, inerte, le temps de se
 * replier ; la section qu'elle vidait se replie avec elle.
 */

const conversationOf = (id: string) =>
  ({
    id,
    type: 'group',
    title: `Groupe ${id}`,
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    unreadCount: 0,
  }) as unknown as Conversation;

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const mounted: { root: Root; host: HTMLElement }[] = [];
const saved: { animate?: PropertyDescriptor | undefined } = {};

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/chats' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
  saved.animate = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  HTMLElement.prototype.animate = function () {
    return { finished: new Promise<void>(() => {}), cancel: () => {} } as unknown as Animation;
  } as typeof HTMLElement.prototype.animate;
});
afterAll(async () => {
  if (saved.animate === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  else Object.defineProperty(HTMLElement.prototype, 'animate', saved.animate);
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

const rowOf = (id: string) => (
  <LensRow
    key={id}
    conversation={conversationOf(id)}
    languages={['fr']}
    viewerId="u-moi"
    flags={{ isPinned: false, isMuted: false, isArchived: false }}
    unreadCount={0}
    onRowAction={() => {}}
  />
);

const screenOf = (sections: readonly (readonly string[])[]) => (
  <ul>
    <ExitPresence scope="all">
      {sections.map((ids, i) => (
        <LensSection key={i === 0 ? 'lentille.today' : 'lentille.yesterday'} id={i === 0 ? 'lentille.today' : 'lentille.yesterday'}>
          <ExitPresence scope="all">{ids.map(rowOf)}</ExitPresence>
        </LensSection>
      ))}
    </ExitPresence>
  </ul>
);

const mount = (sections: readonly (readonly string[])[]) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(screenOf(sections)));
  return { host, rerender: (next: readonly (readonly string[])[]) => act(() => root.render(screenOf(next))) };
};

describe('LensRow sous ExitPresence — la ligne archivée se replie à sa place', () => {
  test('la ligne partie reste montée, sortante et inerte', () => {
    const { host, rerender } = mount([['c-a', 'c-b']]);
    rerender([['c-a']]);
    const leaving = host.querySelector<HTMLElement>('[data-row="c-b"]');
    expect(leaving?.hasAttribute('data-row-exiting')).toBe(true);
    expect(leaving?.hasAttribute('inert')).toBe(true);
    expect(host.querySelector('[data-row="c-a"]')?.hasAttribute('data-row-exiting')).toBe(false);
  });

  test('la section que la dernière ligne vidait se replie avec elle', () => {
    const { host, rerender } = mount([['c-a'], ['c-b']]);
    rerender([['c-a']]);
    expect(host.querySelector('[data-section="lentille.yesterday"]')?.hasAttribute('data-row-exiting')).toBe(true);
  });
});

describe('LensRow — sa pastille de non-lus se lit dans la langue de la rangée (#11575)', () => {
  test('une rangée rendue en anglais dit « 5 unread messages », quelle que soit la langue globale', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    act(() =>
      root.render(
        <ul>
          <LensRow
            conversation={conversationOf('c-en')}
            languages={['en']}
            viewerId="u-moi"
            flags={{ isPinned: false, isMuted: false, isArchived: false }}
            unreadCount={5}
            interfaceLanguage="en"
            onRowAction={() => {}}
          />
        </ul>,
      ),
    );
    expect(host.querySelector('[data-unread]')?.getAttribute('aria-label')).toBe('5 unread messages');
  });
});
