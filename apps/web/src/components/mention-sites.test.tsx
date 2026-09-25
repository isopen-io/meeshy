import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { ReactNode } from 'react';

import { VIEWER_ID } from '@/lib/api/fixtures-base';
import { resetFixtureCommentsForTests } from '@/lib/api/fixtures-comments';
import { friendRequestsQueryKey, type FriendRequestsData } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import StatusComposeScreen from '@/routes/status-compose';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { CommentThread } from './comment-thread';

/**
 * CHAQUE CHAMP QUI MENTIONNE EST BRANCHÉ (#7846) — un témoin par SITE, vu du
 * lecteur : focaliser le champ, taper `@`, voir ses contacts (du cache, sans
 * réseau) puis les participants du contexte. Le composeur du fil a le sien
 * (`mention-contacts-first.test.tsx`), le texte de la scène du studio aussi
 * (`routes/story-compose-mentions.test.tsx`).
 *
 * | site                         | contexte des participants | recherche distante            |
 * |------------------------------|---------------------------|-------------------------------|
 * | commentaire d'une publication | ses commentateurs         | `contextType=post`            |
 * | modification d'un commentaire | ses commentateurs         | `contextType=post`            |
 * | note d'une humeur            | aucun                     | l'annuaire (`/directory/people`) |
 */
const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const CONTACTS_KEY = friendRequestsQueryKey('accepted');

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.clear();
  resetFixtureCommentsForTests();
});

const claire = { id: 'u-claire', username: 'claire', displayName: 'Claire Dubois', avatar: null };
const contacts: FriendRequestsData = {
  pages: [
    {
      requests: [
        {
          id: 'fr-claire',
          senderId: claire.id,
          receiverId: VIEWER_ID,
          status: 'accepted',
          message: null,
          createdAt: '2026-09-01T00:00:00.000Z',
          sender: claire,
          receiver: { id: VIEWER_ID, username: 'vous', displayName: 'Vous', avatar: null },
        },
      ],
      nextCursor: null,
    },
  ],
  pageParams: [null],
};

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  appQueryClient.setQueryData(CONTACTS_KEY, contacts, { updatedAt: Date.now() });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<QueryClientProvider client={appQueryClient}>{node}</QueryClientProvider>);
  });
  return container;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function typeInto(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  act(() => {
    field.focus();
    field.value = value;
    field.setSelectionRange(value.length, value.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const names = (el: ParentNode): (string | undefined)[] =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="option"]')).map((option) => option.dataset.mentionOption);

function required<T extends Element>(el: ParentNode, selector: string): T {
  const found = el.querySelector<T>(selector);
  if (found === null) throw new Error(`absent : ${selector}`);
  return found;
}

describe('le fil de commentaires d’une publication', () => {
  test('taper @ dans le composeur propose le contact, puis ceux qui commentent', async () => {
    const el = await mount(<CommentThread postId="post-text-rank2" />);
    await settle();
    typeInto(required<HTMLTextAreaElement>(el, '[data-comment-field]'), 'bravo @');
    const shown = names(el);
    expect(shown[0]).toBe('claire');
    expect(shown).toContain('tariq.belkacem');
    expect(shown).toContain('ines.lefevre');
    expect(shown).not.toContain('vous');
  });

  test('choisir une personne l’insère dans le commentaire', async () => {
    const el = await mount(<CommentThread postId="post-text-rank2" />);
    await settle();
    const field = required<HTMLTextAreaElement>(el, '[data-comment-field]');
    typeInto(field, 'merci @cl');
    act(() => {
      required<HTMLElement>(el, '[data-mention-option="claire"]').click();
    });
    expect(field.value).toBe('merci @claire ');
  });

  test('le champ de MODIFICATION d’un commentaire mentionne par le même mécanisme', async () => {
    const el = await mount(<CommentThread postId="post-text-rank2" />);
    await settle();
    act(() => {
      required<HTMLButtonElement>(el, '[data-comment-gesture="edit"]').click();
    });
    typeInto(required<HTMLTextAreaElement>(el, '[data-comment-edit-field]'), 'Je l’ai testé avec @');
    expect(names(el)[0]).toBe('claire');
  });
});

describe('la note d’une humeur', () => {
  test('taper @ propose le contact du cache', async () => {
    const el = await mount(<StatusComposeScreen />);
    typeInto(required<HTMLInputElement>(el, '[data-mood-note]'), 'avec @');
    expect(names(el)).toEqual(['claire']);
  });
});
