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
    expect(subject?.media[0]?.author).toEqual({ name: 'Awa', handle: 'awa', quoted: false });
  });

  test('« avec les réponses » (#8734) : elles suivent, dans le texte servi, sans les masquées, les vides ni celles en vol', () => {
    const reply = (id: string, overrides: Partial<PostComment> = {}) => ({
      comment: comment({ id, parentId: 'c-1', author: { id: `u-${id}`, displayName: id.toUpperCase(), username: id }, ...overrides }),
      servedText: `texte ${id}`,
    });
    const subject = commentCardSubjectOf({
      comment: comment(),
      servedText: 'C’est où ?',
      parent: null,
      replies: [reply('r1'), reply('r2', { effectFlags: 2 }), reply('r3', { pending: true }), { ...reply('r4'), servedText: ' ' }, reply('r5')],
    });
    expect(subject?.followUps).toEqual([
      { author: 'R1', text: 'texte r1', handle: 'r1' },
      { author: 'R5', text: 'texte r5', handle: 'r5' },
    ]);
    expect(commentCardSubjectOf({ comment: comment(), servedText: 'x', parent: null })?.followUps).toEqual([]);
  });

  test('un commentaire EN VOL, masqué par ses effets ou vide ne s’image pas', () => {
    expect(commentCardSubjectOf({ comment: comment({ pending: true }), servedText: 'x', parent: null })).toBeNull();
    expect(commentCardSubjectOf({ comment: comment({ effectFlags: 2 }), servedText: 'x', parent: null })).toBeNull();
    expect(commentCardSubjectOf({ comment: comment({ content: ' ' }), servedText: ' ', parent: null })).toBeNull();
  });
});

describe('le vocal d’un commentaire de story part dans la piste du texte servi (#9687)', () => {
  const voice = comment({
    content: '',
    originalLanguage: 'es',
    media: [
      {
        id: 'a-1',
        fileUrl: '/voz.m4a',
        mimeType: 'audio/mp4',
        transcription: { text: 'Hola', language: 'es' },
        translations: { en: { type: 'audio', transcription: 'Hello', url: '/voice-en.m4a', durationMs: 4000 } },
      } as never,
    ],
  });

  test('prisme [fr, en] sans piste française : la piste anglaise, au rang 2', () => {
    expect(commentCardSubjectOf({ comment: voice, servedText: '', parent: null, readerLanguages: ['fr', 'en'] })?.media[0]?.url).toBe('/voice-en.m4a');
  });

  test('sans prisme (la rangée montre l’original) : le vocal original', () => {
    expect(commentCardSubjectOf({ comment: voice, servedText: '', parent: null, readerLanguages: null })?.media[0]?.url).toBe('/voz.m4a');
  });
});

