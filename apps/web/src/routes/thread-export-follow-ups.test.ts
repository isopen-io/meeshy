import { describe, expect, test } from 'bun:test';

import { INITIAL_MESSAGE_CARD_FORMAT } from '@/lib/export/message-card-format';
import type { MessageCardSubject } from '@/lib/export/message-card-subject';

import { messageCardInputOf } from './thread-export-sheet';

const subject: MessageCardSubject = {
  quoted: null,
  reply: { author: 'Awa', text: 'Joli coin', handle: 'awa' },
  sentAt: new Date('2026-09-29T09:00:00.000Z'),
  quotedAt: null,
  media: [],
  followUps: [{ author: 'Kwame', text: 'C’est où ?', handle: 'kwame' }],
};

const inputOf = (overrides: Partial<typeof INITIAL_MESSAGE_CARD_FORMAT> = {}, from: MessageCardSubject = subject) =>
  messageCardInputOf({
    subject: from,
    format: { ...INITIAL_MESSAGE_CARD_FORMAT, ...overrides },
    handle: 'awa',
    conversationTitle: null,
    anonymousLabel: 'Anonyme',
    formatDate: () => '',
  });

describe('messageCardInputOf — les réponses jointes à un commentaire (#8734)', () => {
  test('elles voyagent jusqu’à la carte, sous leur nom', () => {
    expect(inputOf().followUps).toEqual([{ author: 'Kwame', text: 'C’est où ?', time: null }]);
  });

  test('elles suivent le pseudo préféré, et l’anonymat des « autres » (celui de la citation)', () => {
    expect(inputOf({ usePseudonyms: true }).followUps?.[0]?.author).toBe('@kwame');
    expect(inputOf({ anonymizeQuoted: true }).followUps?.[0]?.author).toBe('Anonyme');
  });

  test('sans réponses jointes, la carte n’en porte aucune', () => {
    const { followUps: _none, ...alone } = subject;
    expect(inputOf({}, alone).followUps).toBeUndefined();
  });
});
