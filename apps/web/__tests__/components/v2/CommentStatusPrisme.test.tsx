/**
 * Cycle 123 — la RÈGLE #1 du Prisme sur les commentaires et les statuts.
 *
 * Le câblage rang-conscient de ces deux surfaces a atterri par l'itération 257
 * (`prisme-rank-comment-status.test.tsx`), qui en porte les témoins de RANG —
 * « la traduction d'un rang inférieur est servie quand le rang 1 manque ». Ils
 * ne sont pas redoublés ici.
 *
 * Ce qu'ils ne couvrent pas, et que ce fichier garde : **l'absence de repli**.
 * Quand AUCUNE langue du prisme n'est servie, la règle #1 exige l'ORIGINAL —
 * jamais une traduction quelconque (« servir une troisième langue serait pire
 * que l'original »). C'est la moitié du contrat qu'une descente trop zélée
 * casse en premier : il suffit qu'un résolveur retombe sur `translations[0]`
 * pour que les témoins de rang restent verts pendant que le lecteur reçoit de
 * l'espagnol qu'il n'a jamais demandé.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { CommentItem } from '@/components/v2/CommentItem';
import { StatusBar } from '@/components/v2/StatusBar';
import type { StatusItem } from '@/components/v2/StatusBar';
import type { PostComment } from '@meeshy/shared/types/post';

function comment(overrides: Partial<PostComment> = {}): PostComment {
  return {
    id: 'comment-1',
    postId: 'post-1',
    authorId: 'author-1',
    author: { id: 'author-1', username: 'bob', displayName: 'Bob', avatar: null },
    content: 'Hello',
    originalLanguage: 'en',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    likeCount: 0,
    replyCount: 0,
    isEdited: false,
    ...overrides,
  } as PostComment;
}

function status(overrides: Partial<StatusItem> = {}): StatusItem {
  return {
    id: 'status-1',
    author: { name: 'Bob' },
    moodEmoji: '🙂',
    content: 'Hello',
    originalLanguage: 'en',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    isOwn: false,
    ...overrides,
  };
}

describe('Prisme règle #1 — aucune langue servie ⇒ l’ORIGINAL, jamais un repli', () => {
  it('CommentItem sert l’original plutôt qu’une traduction hors prisme', () => {
    render(
      <CommentItem
        comment={comment({ translations: { es: { text: 'Hola' } } as never })}
        preferredLanguages={['de', 'fr']}
      />,
    );

    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.queryByText('Hola')).toBeNull();
  });

  it('StatusBar sert l’original plutôt qu’une traduction hors prisme', () => {
    render(
      <StatusBar
        statuses={[
          status({
            translations: [{ languageCode: 'es', languageName: 'Español', content: 'Hola' }],
          }),
        ]}
        onStatusPress={jest.fn()}
        onAddStatus={jest.fn()}
        preferredLanguages={['de', 'fr']}
      />,
    );

    fireEvent.click(screen.getByText('Bob'));

    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
