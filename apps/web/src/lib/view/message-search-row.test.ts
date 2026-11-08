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
  isBlurred: false,
  match: 'content',
  transcript: null,
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

  test('#16957 — un résultat flouté ne porte AUCUN caractère de son texte, seulement sa longueur pour le voile', () => {
    const model = messageSearchRowModel(hit({ isBlurred: true }), { locale: 'fr-FR' });
    expect(model).toMatchObject({ veiled: true, excerpt: '', veilLength: 'on se voit à la plage'.length, translated: false });
    expect(JSON.stringify(model)).not.toContain('plage');
  });

  test('#16958 — une transcription qui a répondu se peint avec l’icône de son média', () => {
    const model = messageSearchRowModel(
      hit({ content: '', servedLanguage: null, match: 'transcript', transcript: { attachmentId: 'a1', mediaKind: 'audio', text: '…la plage demain', servedLanguage: 'fr', durationMs: 4200 } }),
      { locale: 'fr-FR' },
    );
    expect(model).toMatchObject({ excerpt: '…la plage demain', mediaGlyph: 'microphone', translated: true, veiled: false });
  });

  test('chaque nature de média a son icône, et un texte n’en a aucune', () => {
    const glyphOf = (mediaKind: 'audio' | 'video' | 'image' | 'document') =>
      messageSearchRowModel(hit({ match: 'transcript', transcript: { attachmentId: 'a1', mediaKind, text: 'x', servedLanguage: null, durationMs: null } }), { locale: 'fr-FR' }).mediaGlyph;
    expect([glyphOf('audio'), glyphOf('video'), glyphOf('image'), glyphOf('document')]).toEqual(['microphone', 'videoCamera', 'image', 'file']);
    expect(messageSearchRowModel(hit(), { locale: 'fr-FR' }).mediaGlyph).toBe(null);
  });

  test('une transcription floutée est voilée comme un texte', () => {
    const model = messageSearchRowModel(
      hit({ isBlurred: true, match: 'transcript', transcript: { attachmentId: 'a1', mediaKind: 'audio', text: 'secret de plage', servedLanguage: null, durationMs: null } }),
      { locale: 'fr-FR' },
    );
    expect(model).toMatchObject({ veiled: true, excerpt: '', veilLength: 'secret de plage'.length, mediaGlyph: 'microphone' });
  });
});
