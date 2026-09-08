import { describe, expect, test } from 'bun:test';

import { buildLivingSummary } from '@/lib/summary/assembly';

import {
  CATCHUP_CONVERSATION,
  CATCHUP_CONVERSATION_ID,
  CATCHUP_DIRECT_REPLY_WITNESS_ID,
  CATCHUP_HAS_OLDER_MESSAGES,
  CATCHUP_MEDIA_WITNESS_ID,
  CATCHUP_MENTION_WITNESS_ID,
  CATCHUP_MESSAGES,
  CATCHUP_VIEWER_MESSAGE_ID,
} from './fixtures-catchup';
import { CONVERSATIONS, PARTICIPANTS, VIEWER_ID, hasOlderMessagesOf, messagesOf } from './fixtures';

/**
 * LE CORPUS « RATTRAPAGE » — critère (b) de #5695 : un fil qui ATTEINT le
 * Résumé Vivant, avec les cinq preuves que le digest doit savoir compter.
 */

describe('fixtures-catchup — le corpus atteint le Résumé', () => {
  test('unreadCount >= 26 et au moins trois jours locaux distincts', () => {
    expect(CATCHUP_CONVERSATION.unreadCount ?? 0).toBeGreaterThanOrEqual(26);
    const days = new Set(
      CATCHUP_MESSAGES.map((m) => new Date(m.createdAt).toDateString()),
    );
    expect(days.size).toBeGreaterThanOrEqual(3);
  });

  test('porte des mentions, des questions, une réponse directe et un média', () => {
    const mentions = CATCHUP_MESSAGES.filter((m) => m.content.includes('@vous'));
    expect(mentions.length).toBeGreaterThanOrEqual(2);

    const questions = CATCHUP_MESSAGES.filter((m) => m.content.trim().endsWith('?'));
    const questionAuthors = new Set(questions.map((m) => m.senderId));
    expect(questionAuthors.size).toBeGreaterThanOrEqual(3);

    const reply = CATCHUP_MESSAGES.find((m) => m.id === CATCHUP_DIRECT_REPLY_WITNESS_ID);
    expect(reply?.replyToId).toBe(CATCHUP_VIEWER_MESSAGE_ID);

    const media = CATCHUP_MESSAGES.find((m) => m.id === CATCHUP_MEDIA_WITNESS_ID);
    expect(media?.attachments?.[0]?.mimeType).toBe('image/png');

    const mentionWitness = CATCHUP_MESSAGES.find((m) => m.id === CATCHUP_MENTION_WITNESS_ID);
    expect(mentionWitness?.content).toContain('@vous');
  });

  test('la fenêtre est déclarée PARTIELLE — jamais pour l’Équipe déploiement', () => {
    expect(hasOlderMessagesOf(CATCHUP_CONVERSATION_ID)).toBe(true);
    expect(hasOlderMessagesOf('c-deploiement')).toBe(false);
  });

  test('produit au moins deux épisodes et une rampe non vide, Amina en tête', () => {
    const model = buildLivingSummary({
      messages: CATCHUP_MESSAGES,
      viewer: { id: VIEWER_ID, handle: 'vous', displayName: 'Vous' },
      participants: PARTICIPANTS,
      windowCoversUnread: !CATCHUP_HAS_OLDER_MESSAGES,
      now: Date.now(),
      locale: 'fr',
    });
    expect(model.digest.episodes.length).toBeGreaterThanOrEqual(2);
    expect(model.faceRamp.length).toBeGreaterThan(0);
    expect(model.faceRamp.map((entry) => entry.id)).toEqual(['u-amina', 'u-kwame', 'u-fatou']);
  });

  test('messagesOf(c-rattrapage) rend les 30 messages, conversationId réécrit', () => {
    const messages = messagesOf(CATCHUP_CONVERSATION_ID);
    expect(messages).toHaveLength(30);
    expect(messages.every((m) => m.conversationId === CATCHUP_CONVERSATION_ID)).toBe(true);
  });

  test('CONVERSATIONS porte le corpus de rattrapage', () => {
    expect(CONVERSATIONS.some((c) => c.id === CATCHUP_CONVERSATION_ID)).toBe(true);
  });
});
