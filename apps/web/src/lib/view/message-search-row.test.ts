import { describe, expect, test } from 'bun:test';

import type { MessageSearchHit } from '@/lib/api/global-search';

import { messageSearchRowModel } from './message-search-row';

/**
 * #14619 — UNE LIGNE DE LA SECTION « MESSAGES » : le texte SERVI par la
 * passerelle (déjà dans le Prisme du lecteur), l'auteur, la conversation et
 * l'accent de la conversation ; l'ouverture vise le fil SUR le message.
 */
const hit = (over: Partial<MessageSearchHit> = {}): MessageSearchHit => ({
  id: 'm1',
  conversationId: 'c1',
  createdAt: '2026-11-01T10:00:00.000Z',
  messageType: 'text',
  content: 'on se voit à la plage',
  servedLanguage: 'fr',
  originalContent: 'see you at the beach',
  originalLanguage: 'en',
  sender: { id: 'p1', userId: 'u1', displayName: 'Ada', username: 'ada', avatar: null },
  conversation: { id: 'c1', identifier: 'conv-c1', type: 'group', title: 'Plage', avatar: null },
  ...over,
});

describe('messageSearchRowModel', () => {
  test('peint le texte servi, nomme l’auteur et la conversation, et dit qu’il est traduit', () => {
    const model = messageSearchRowModel(hit(), { locale: 'fr-FR' });
    expect(model).toMatchObject({ messageId: 'm1', conversationId: 'c1', author: 'Ada', excerpt: 'on se voit à la plage', conversationName: 'Plage', translated: true });
    expect(model.accent).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('sans traduction servie, l’original ; sans expéditeur, aucun auteur inventé', () => {
    const model = messageSearchRowModel(hit({ servedLanguage: null, content: 'see you', sender: null }), { locale: 'fr-FR' });
    expect(model).toMatchObject({ excerpt: 'see you', translated: false, author: null });
  });

  test('une conversation sans titre se nomme par son identifiant', () => {
    const model = messageSearchRowModel(hit({ conversation: { id: 'c1', identifier: 'conv-c1', type: 'direct', title: '', avatar: null } }), { locale: 'fr-FR' });
    expect(model.conversationName).toBe('conv-c1');
  });
});
