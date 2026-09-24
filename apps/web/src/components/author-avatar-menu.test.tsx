import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';

import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import type { AuthorStoryRing } from '@/lib/view/author-story-ring';
import { LONG_PRESS_MS, useLongPress } from '@/lib/view/long-press';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationDetailsContext } from './avatar-menu';
import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * **L'APPUI LONG SUR L'AVATAR D'UN AUTEUR OUVRE SON MENU, PAS CELUI DU
 * MESSAGE** (#7828). Le témoin monte la peau DANS une rangée qui porte le
 * `useLongPress` du message, comme `thread-modes.tsx` : c'est la remontée du
 * geste vers cette rangée que le défaut laissait passer.
 */

const MESSAGE = {
  id: 'm-menu',
  conversationId: 'c-menu',
  senderId: 'u-nour',
  content: 'Bonjour',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  maxViewOnceCount: 1,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 1,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-24T09:00:00.000Z'),
  updatedAt: new Date('2026-09-24T09:00:00.000Z'),
  timestamp: new Date('2026-09-24T09:00:00.000Z'),
  translations: [],
  sender: {
    id: 'p-nour',
    conversationId: 'c-menu',
    userId: 'u-nour',
    displayName: 'Nour Haddad',
    type: 'user',
    role: 'member',
    language: 'fr',
    isActive: true,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    isOnline: false,
    user: { id: 'u-nour', username: 'nour', displayName: 'Nour Haddad' },
  },
} as unknown as Message;

const place: PlacedMessage = { message: MESSAGE, head: true, tail: true, opensDay: null };

function Row({ journal, children }: { readonly journal: string[]; readonly children: ReactNode }) {
  const longPress = useLongPress({ onOpen: () => journal.push('menu-du-message') });
  return (
    <div data-row="m-menu" tabIndex={0} {...longPress}>
      {children}
    </div>
  );
}

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLDivElement;
let root: Root;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});
afterAll(async () => {
  await act(async () => {});
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
beforeEach(() => {
  window.history.replaceState(null, '', '/c/c-menu');
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('[role="menu"]').forEach((node) => node.remove());
});

const monte = (options: { readonly skin: 'bubble' | 'focal'; readonly ring?: AuthorStoryRing; readonly details?: () => void }) => {
  const journal: string[] = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const ring = options.ring === undefined ? {} : { senderStoryRing: options.ring };
  const skin =
    options.skin === 'bubble' ? (
      <Bubble place={place} languages={['fr']} isGrouped viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} {...ring} />
    ) : (
      <FocalRow mode="focal" place={place} languages={['fr']} viewerId="u-viewer" ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} {...ring} />
    );
  act(() => {
    root.render(
      <ConversationDetailsContext.Provider value={options.details ?? null}>
        <Row journal={journal}>{skin}</Row>
      </ConversationDetailsContext.Provider>,
    );
  });
  return journal;
};

const avatarLink = (): HTMLAnchorElement => {
  const link = container.querySelector<HTMLAnchorElement>('[data-avatar-menu-trigger] a.avatar-profile-link');
  if (link === null) throw new Error('avatar introuvable');
  return link;
};

const entries = (): string[] =>
  [...document.querySelectorAll<HTMLElement>('[data-avatar-menu-entry]')].map((node) => node.dataset.avatarMenuEntry ?? '');

const contextMenuOn = (target: Element) =>
  act(() => {
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  });

describe('AuthorAvatar — le menu de la PERSONNE, jamais celui du message (#7828)', () => {
  test('clic droit sur l’avatar d’une bulle ⇒ menu avatar, et le menu du message reste fermé', () => {
    const journal = monte({ skin: 'bubble' });
    contextMenuOn(avatarLink());
    expect(entries()).toEqual(['profile']);
    expect(document.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Actions pour Nour Haddad');
    expect(journal).toEqual([]);
  });

  test('clic droit sur le TEXTE du message ⇒ c’est toujours le menu du message', () => {
    const journal = monte({ skin: 'bubble' });
    const texte = [...container.querySelectorAll('p, span')].find((node) => node.textContent === 'Bonjour');
    if (texte === undefined) throw new Error('texte introuvable');
    contextMenuOn(texte);
    expect(journal).toEqual(['menu-du-message']);
    expect(entries()).toEqual([]);
  });

  test('Maj+F10 sur l’avatar au clavier ⇒ menu avatar, et le focus entre dans le menu', async () => {
    const journal = monte({ skin: 'bubble' });
    avatarLink().focus();
    act(() => {
      avatarLink().dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(entries()).toEqual(['profile']);
    expect(document.activeElement?.getAttribute('data-avatar-menu-entry')).toBe('profile');
    expect(journal).toEqual([]);
  });

  test('appui long au doigt ⇒ menu avatar ; le relâcher ne suit PAS le lien', async () => {
    const journal = monte({ skin: 'bubble' });
    const link = avatarLink();
    act(() => {
      link.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40));
    });
    expect(entries()).toEqual(['profile']);
    act(() => {
      link.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/c/c-menu');
    expect(journal).toEqual([]);
  });

  test('un simple toucher mène toujours au profil (sans anneau)', () => {
    monte({ skin: 'bubble' });
    act(() => {
      avatarLink().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(window.location.pathname).toBe('/u/nour');
  });

  test('« Voir le profil » ouvre le profil de l’auteur', () => {
    monte({ skin: 'bubble' });
    contextMenuOn(avatarLink());
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="profile"]')?.click();
    });
    expect(window.location.pathname).toBe('/u/nour');
    expect(entries()).toEqual([]);
  });

  test('un auteur avec une story VUE : « Voir la story » l’ouvre, le toucher suit l’anneau', () => {
    monte({ skin: 'bubble', ring: { entryStoryId: 's-nour', unseen: false } });
    contextMenuOn(avatarLink());
    expect(entries()).toEqual(['profile', 'story']);
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="story"]')?.click();
    });
    expect(window.location.pathname).toBe('/story/s-nour');
  });

  test('dans un fil qui sait ouvrir ses détails : « Détails de la conversation » les ouvre', () => {
    const ouvertures: string[] = [];
    monte({ skin: 'bubble', details: () => ouvertures.push('details') });
    contextMenuOn(avatarLink());
    expect(entries()).toEqual(['profile', 'details']);
    act(() => {
      document.querySelector<HTMLButtonElement>('[data-avatar-menu-entry="details"]')?.click();
    });
    expect(ouvertures).toEqual(['details']);
  });

  test('Échap referme le menu et rend le focus à l’avatar', async () => {
    monte({ skin: 'bubble' });
    contextMenuOn(avatarLink());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await act(async () => {});
    expect(entries()).toEqual([]);
    expect(document.activeElement).toBe(avatarLink());
  });

  test('la rangée plate (Focal) : même menu, jamais celui du message', () => {
    const journal = monte({ skin: 'focal' });
    const link = container.querySelector('[data-avatar-menu-trigger] a');
    if (link === null) throw new Error('avatar introuvable');
    contextMenuOn(link);
    expect(entries()).toEqual(['profile']);
    expect(journal).toEqual([]);
  });
});
