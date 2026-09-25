import { act } from 'react';
import { afterEach, describe, expect, test } from 'bun:test';

import { VIEWER_ID } from '@/lib/api/fixtures-base';
import { friendRequestsQueryKey, type FriendRequestsData } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { MENTION_REMOTE_DEBOUNCE_MS } from '@/lib/view/use-mention-suggestions';
import { harness, mount, registerStudioBench } from '@/test-support/story-studio-bench';

/**
 * LE TEXTE DE LA SCÈNE MENTIONNE (#7846) — story, post et réel s'écrivent
 * dans le même studio (#7497), et la passerelle lit les `@pseudo` de ce
 * texte (`collectMentionableText`). La publication n'existe pas encore : les
 * contacts viennent du cache, la recherche passe par l'ANNUAIRE dès deux
 * lettres (`/directory/people`, dont la fixture rend Bruno pour `br`).
 */
registerStudioBench();

const CONTACTS_KEY = friendRequestsQueryKey('accepted');

afterEach(() => {
  appQueryClient.removeQueries({ queryKey: CONTACTS_KEY });
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
          receiver: { id: VIEWER_ID, username: 'auteur', displayName: 'Auteur', avatar: null },
        },
      ],
      nextCursor: null,
    },
  ],
  pageParams: [null],
};

function typeInScene(host: ParentNode, value: string): HTMLTextAreaElement {
  const field = host.querySelector<HTMLTextAreaElement>('#story-studio-text');
  if (field === null) throw new Error('aucune saisie de scène');
  act(() => {
    field.focus();
    field.value = value;
    field.setSelectionRange(value.length, value.length);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return field;
}

const names = (host: ParentNode): (string | undefined)[] =>
  Array.from(host.querySelectorAll<HTMLElement>('[role="option"]')).map((option) => option.dataset.mentionOption);

describe('le texte de la scène du studio', () => {
  test('taper @ propose les contacts du cache, sans réseau', async () => {
    appQueryClient.setQueryData(CONTACTS_KEY, contacts, { updatedAt: Date.now() });
    const host = mount(harness({}).deps, 'POST');
    typeInScene(host, 'Avec @');
    expect(names(host)).toEqual(['claire']);
  });

  test('deux lettres interrogent l’annuaire, et choisir insère le pseudo', async () => {
    appQueryClient.setQueryData(CONTACTS_KEY, contacts, { updatedAt: Date.now() });
    const host = mount(harness({}).deps, 'STORY');
    const field = typeInScene(host, 'Avec @br');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, MENTION_REMOTE_DEBOUNCE_MS + 80));
    });
    expect(names(host)).toContain('bruno.laurent');
    act(() => {
      host.querySelector<HTMLElement>('[data-mention-option="bruno.laurent"]')?.click();
    });
    expect(field.value).toBe('Avec @bruno.laurent ');
  });
});
