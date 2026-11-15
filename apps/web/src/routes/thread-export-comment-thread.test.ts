import { describe, expect, test } from 'bun:test';

import { INITIAL_MESSAGE_CARD_FORMAT } from '@/lib/export/message-card-format';
import type { MessageCardSubject } from '@/lib/export/message-card-subject';

import { messageCardInputOf } from './thread-export-sheet';

/**
 * **LE FIL D'UN COMMENTAIRE SUR LA CARTE, COMME iOS** (#13922) — un bloc titré
 * « Fil de commentaires », chaque commentaire une ligne « Auteur : texte » à son
 * niveau (`MessageCardPart.thread`, `PostCommentCardComposition.subject`). Les
 * noms restent des noms jusqu'ici : l'anonymat et le pseudo s'y appliquent
 * ligne à ligne — la réponse visée suit celui de la réponse, les autres celui
 * de la citation.
 */
const subject: MessageCardSubject = {
  quoted: { author: 'Awa', text: 'Le coucher de soleil', handle: 'awa' },
  reply: {
    author: 'Fil de commentaires',
    text: 'Bob : Magnifique\n+2 réponses\nCleo : Sur la corniche',
    handle: null,
    thread: [
      { author: 'Bob', handle: 'bob', text: 'Magnifique', level: 0, isReply: false },
      { author: null, handle: null, text: '+2 réponses', level: 1, isReply: false },
      { author: 'Cleo', handle: 'cleo', text: 'Sur la corniche', level: 1, isReply: true },
    ],
  },
  sentAt: new Date('2026-10-08T10:03:00.000Z'),
  quotedAt: new Date('2026-10-08T10:00:00.000Z'),
  media: [],
};

const inputOf = (overrides: Partial<typeof INITIAL_MESSAGE_CARD_FORMAT> = {}) =>
  messageCardInputOf({
    subject,
    format: { ...INITIAL_MESSAGE_CARD_FORMAT, ...overrides },
    handle: 'moi',
    conversationTitle: null,
    anonymousLabel: 'Anonyme',
    formatDate: () => '',
  });

describe('messageCardInputOf — le fil d’un commentaire', () => {
  test('un bloc titré, une ligne « Auteur : texte » par commentaire, chacune à son niveau', () => {
    const { reply } = inputOf();
    expect(reply.author).toBe('Fil de commentaires');
    expect(reply.thread).toEqual([
      { text: 'Bob : Magnifique', level: 0 },
      { text: '+2 réponses', level: 1 },
      { text: 'Cleo : Sur la corniche', level: 1 },
    ]);
    expect(reply.text).toBe('Bob : Magnifique\n+2 réponses\nCleo : Sur la corniche');
  });

  test('le pseudo préféré nomme chaque ligne', () => {
    expect(inputOf({ usePseudonyms: true }).reply.thread?.map((line) => line.text)).toEqual(['@bob : Magnifique', '+2 réponses', '@cleo : Sur la corniche']);
  });

  test('l’anonymat s’applique ligne à ligne : les autres avec la citation, la réponse visée avec la réponse', () => {
    expect(inputOf({ anonymizeQuoted: true }).reply.thread?.map((line) => line.text)).toEqual(['Anonyme : Magnifique', '+2 réponses', 'Cleo : Sur la corniche']);
    expect(inputOf({ anonymizeReply: true }).reply.thread?.map((line) => line.text)).toEqual(['Bob : Magnifique', '+2 réponses', 'Anonyme : Sur la corniche']);
    expect(inputOf({ anonymizeReply: true }).reply.text).not.toContain('Cleo');
  });
});
