import { describe, expect, test } from 'bun:test';

import { scriptedGateway } from '@/test-support/scripted-transport';

import { shareConversationLink } from './conversation-share-link';

const created = {
  ok: true as const,
  data: {
    linkId: 'mshy_abc',
    conversationId: 'c1',
    shareLink: { id: 'l1', linkId: 'mshy_abc', name: null, description: null, expiresAt: null, isActive: true },
  },
};

describe('shareConversationLink — créer un lien puis le partager, en un geste (#7829)', () => {
  test('le lien se crée avec les messages anonymes permis, puis part par la feuille système', async () => {
    const { deps, calls } = scriptedGateway({ 'POST /api/v1/links': created });
    const partages: string[] = [];
    const outcome = await shareConversationLink({
      deps,
      conversationId: 'c1',
      origin: 'https://meeshy.me',
      portail: { share: async (donnees) => void partages.push(donnees.url) },
    });
    expect(outcome).toEqual({ kind: 'shared' });
    expect(partages).toEqual(['https://meeshy.me/chat/mshy_abc']);
    const body = calls()[0]?.body as { readonly conversationId: string; readonly allowAnonymousMessages: boolean };
    expect(body.conversationId).toBe('c1');
    expect(body.allowAnonymousMessages).toBe(true);
  });

  test('sans feuille de partage, le lien est copié', async () => {
    const { deps } = scriptedGateway({ 'POST /api/v1/links': created });
    const copies: string[] = [];
    const outcome = await shareConversationLink({
      deps,
      conversationId: 'c1',
      origin: 'https://meeshy.me',
      portail: { copier: async (texte) => void copies.push(texte) },
    });
    expect(outcome).toEqual({ kind: 'copied' });
    expect(copies).toEqual(['https://meeshy.me/chat/mshy_abc']);
  });

  test('ni partage ni presse-papier : l’adresse est rendue pour être montrée', async () => {
    const { deps } = scriptedGateway({ 'POST /api/v1/links': created });
    const outcome = await shareConversationLink({ deps, conversationId: 'c1', origin: 'https://meeshy.me', portail: {} });
    expect(outcome).toEqual({ kind: 'unavailable', url: 'https://meeshy.me/chat/mshy_abc' });
  });

  test('un refus de la passerelle ne partage rien', async () => {
    const { deps } = scriptedGateway({ 'POST /api/v1/links': { ok: false, status: 403, error: 'refusé' } });
    const partages: string[] = [];
    const outcome = await shareConversationLink({
      deps,
      conversationId: 'c1',
      origin: 'https://meeshy.me',
      portail: { share: async (donnees) => void partages.push(donnees.url) },
    });
    expect(outcome).toEqual({ kind: 'failed' });
    expect(partages).toEqual([]);
  });
});
