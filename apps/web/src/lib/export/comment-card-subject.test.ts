import { describe, expect, test } from 'bun:test';

import type { PostComment } from '@/lib/api/publication-comments';

import { commentCardSubjectOf } from './comment-card-subject';

const comment = (overrides: Partial<PostComment> = {}): PostComment => ({
  id: 'c-1',
  content: 'Where is it?',
  createdAt: '2026-09-28T11:01:00.000Z',
  author: { id: 'u-awa', username: 'awa', displayName: 'Awa' },
  ...overrides,
});

describe('commentCardSubjectOf — un commentaire s’image comme un message (#8693)', () => {
  test('le texte SERVI (le Prisme), l’auteur et son pseudo', () => {
    const subject = commentCardSubjectOf({ comment: comment(), servedText: 'C’est où ?', parent: null });
    expect(subject?.reply).toEqual({ author: 'Awa', text: 'C’est où ?', handle: 'awa' });
    expect(subject?.quoted).toBeNull();
    expect(subject?.sentAt).toEqual(new Date('2026-09-28T11:01:00.000Z'));
  });

  test('une réponse cite le commentaire auquel elle répond, dans le texte que le lecteur y lit', () => {
    const parent = comment({ id: 'c-0', content: 'Nice spot', author: { id: 'u-kwame', displayName: 'Kwame' } });
    const subject = commentCardSubjectOf({ comment: comment({ parentId: 'c-0' }), servedText: 'C’est où ?', parent: { comment: parent, servedText: 'Joli coin' } });
    expect(subject?.quoted).toEqual({ author: 'Kwame', text: 'Joli coin', handle: null });
    expect(subject?.quotedAt).toEqual(new Date('2026-09-28T11:01:00.000Z'));
  });

  test('ses médias viennent avec lui', () => {
    const subject = commentCardSubjectOf({
      comment: comment({ media: [{ id: 'm-1', fileUrl: '/p.jpg', mimeType: 'image/jpeg', width: 800, height: 600 }] }),
      servedText: 'Regarde',
      parent: null,
    });
    expect(subject?.media.map((item) => item.card.kind)).toEqual(['image']);
  });

  test('un commentaire EN VOL, masqué par ses effets ou vide ne s’image pas', () => {
    expect(commentCardSubjectOf({ comment: comment({ pending: true }), servedText: 'x', parent: null })).toBeNull();
    expect(commentCardSubjectOf({ comment: comment({ effectFlags: 2 }), servedText: 'x', parent: null })).toBeNull();
    expect(commentCardSubjectOf({ comment: comment({ content: ' ' }), servedText: ' ', parent: null })).toBeNull();
  });
});
