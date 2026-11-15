import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { PostComment } from '@/lib/api/publication-comments';

import { replyTargetOf, withReplyMention } from './comment-reply-target';

const comment = (patch: Partial<PostComment> = {}): PostComment => ({
  id: 'c1',
  content: 'Bonjour à tous',
  createdAt: '2026-09-28T10:00:00.000Z',
  author: { id: 'u1', displayName: 'Noa Berger', username: 'noa' },
  ...patch,
});

const vue = { authorName: 'Noa Berger', displayedText: 'Bonjour à tous' };

describe('la cible d’une réponse (#8583) — miroir de beginReply / submitComment', () => {
  test('répondre à une RACINE : la réponse s’y rattache, aucune mention', () => {
    expect(replyTargetOf(comment(), vue)).toEqual({
      commentId: 'c1',
      rootId: 'c1',
      authorName: 'Noa Berger',
      excerpt: 'Bonjour à tous',
      mention: null,
    });
  });

  test('répondre à une RÉPONSE reste au niveau 2 et prévient son auteur par une @mention', () => {
    const cible = replyTargetOf(comment({ id: 'r1', parentId: 'c1' }), vue);
    expect(cible.rootId).toBe('c1');
    expect(cible.commentId).toBe('r1');
    expect(cible.mention).toBe('@noa ');
  });

  test('un commentaire FLOUTÉ ne prête pas son texte au bandeau', () => {
    const cible = replyTargetOf(comment({ effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED | MESSAGE_EFFECT_FLAGS.GLOW }), vue);
    expect(cible.excerpt).toBeNull();
  });

  test('l’extrait cite le texte AFFICHÉ (le Prisme), pas l’original', () => {
    const cible = replyTargetOf(comment({ content: 'Hello everyone' }), { authorName: 'Noa', displayedText: 'Bonjour à tous' });
    expect(cible.excerpt).toBe('Bonjour à tous');
  });
});

describe('withReplyMention — la mention se remplace, elle ne s’accumule pas', () => {
  test('pose la mention devant le brouillon', () => {
    expect(withReplyMention('merci', null, '@noa ')).toBe('@noa merci');
  });

  test('changer de cible retire la mention précédente', () => {
    expect(withReplyMention('@noa merci', '@noa ', '@ines ')).toBe('@ines merci');
  });

  test('une cible racine retire la mention sans en poser', () => {
    expect(withReplyMention('@noa merci', '@noa ', null)).toBe('merci');
  });

  test('une mention déjà tapée n’est jamais doublée, et @bob n’est pas @bobby', () => {
    expect(withReplyMention('@noa salut', null, '@noa ')).toBe('@noa salut');
    expect(withReplyMention('@bobby salut', '@bob ', null)).toBe('@bobby salut');
  });
});
