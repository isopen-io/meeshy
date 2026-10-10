/**
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { contentActionPushFields } from '../contentActionPushFields';

const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: null };
const invite = { url: 'https://meeshy.me/chat/abc', conversationTitle: 'Équipe', memberCount: 12 };

const language = (lang: string) => {
  const asked: string[] = [];
  return { asked, resolve: async () => { asked.push(lang); return lang; } };
};

describe('contentActionPushFields — les libellés des actions que le service worker web ne sait pas traduire (#8860)', () => {
  it('une position offre « Ouvrir la carte » et « Répondre », dans la langue du destinataire', async () => {
    await expect(
      contentActionPushFields({
        type: 'new_message',
        conversationId: 'conv-1',
        detail: { location: place },
        detailTravels: true,
        language: language('fr').resolve,
      }),
    ).resolves.toEqual({ contentActionLabel: 'Ouvrir la carte', replyActionLabel: 'Répondre' });
  });

  it('une invitation offre « Join » à un lecteur anglophone', async () => {
    await expect(
      contentActionPushFields({
        type: 'message_reply',
        conversationId: 'conv-1',
        detail: { invite },
        detailTravels: true,
        language: language('en').resolve,
      }),
    ).resolves.toEqual({ contentActionLabel: 'Join', replyActionLabel: 'Reply' });
  });

  it('un message protégé ou masqué garde « Répondre » mais n’annonce aucune action de CONTENU', async () => {
    await expect(
      contentActionPushFields({
        type: 'new_message',
        conversationId: 'conv-1',
        detail: { location: place },
        detailTravels: false,
        language: language('de').resolve,
      }),
    ).resolves.toEqual({ replyActionLabel: 'Antworten' });
  });

  it('un lien, un contact ou un sticker n’appellent que « Répondre »', async () => {
    await expect(
      contentActionPushFields({
        type: 'user_mentioned',
        conversationId: 'conv-1',
        detail: { link: { url: 'https://example.com', domain: 'example.com' } },
        detailTravels: true,
        language: language('it').resolve,
      }),
    ).resolves.toEqual({ replyActionLabel: 'Rispondi' });
  });

  it('hors message de conversation, aucune clé et aucune langue résolue', async () => {
    const lang = language('fr');
    await expect(
      contentActionPushFields({ type: 'friend_request', conversationId: undefined, detail: undefined, detailTravels: true, language: lang.resolve }),
    ).resolves.toEqual({});
    await expect(
      contentActionPushFields({ type: 'new_message', conversationId: undefined, detail: { location: place }, detailTravels: true, language: lang.resolve }),
    ).resolves.toEqual({});
    expect(lang.asked).toEqual([]);
  });
});
