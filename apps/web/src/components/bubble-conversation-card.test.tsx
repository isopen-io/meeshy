import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { conversationCardQueryKey } from '@/lib/api/conversation-card';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * **LES DEUX PEAUX DU FIL POSENT LA CARTE SOUS LE TEXTE (#8099).**
 *
 * Un lien Meeshy de conversation dans un message devient une carte, dans la
 * bulle comme dans la rangée plate — même geste, même effet (dimension 6).
 * Un message sans lien n'en porte aucune.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const message = (content: string): Message => ({
  id: 'm-carte',
  conversationId: 'c-fil',
  senderId: 'u-autre',
  content,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 1,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  createdAt: new Date('2026-09-26T09:00:00.000Z'),
  timestamp: new Date('2026-09-26T09:00:00.000Z'),
  translations: [],
});

const CARD: ConversationCard = {
  kind: 'share-link',
  conversationId: null,
  title: 'Les bêta-testeurs',
  description: null,
  avatarUrl: null,
  bannerUrl: null,
  conversationType: 'group',
  stats: { memberCount: 3, onlineCount: null, messageCount: null, languages: [] },
  viewer: { isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: true },
  link: { identifier: 'mshy_beta', isActive: true, expiresAt: null },
  inviter: null,
  inviteMessage: null,
};

const placed = (content: string): PlacedMessage => ({ message: message(content), head: true, tail: true, opensDay: null });

const withCache = (node: React.ReactElement): string => {
  const client = new QueryClient();
  client.setQueryData(conversationCardQueryKey({ kind: 'share-link', identifier: 'mshy_beta' }), CARD);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

const bubble = (content: string) =>
  withCache(
    <Bubble
      place={placed(content)}
      languages={['fr']}
      isGrouped
      viewerId="u-viewer"
      ephemeralDeadline={{ state: 'none' }}
      onJumpToMessage={() => {}}
      onPickLanguage={() => {}}
    />,
  );

describe('la carte de conversation dans le fil', () => {
  test('bulle : un lien de partage Meeshy devient une carte', () => {
    const html = bubble('Rejoins-nous https://meeshy.me/chat/mshy_beta');
    expect(html).toContain('data-conversation-card="guest"');
    expect(html).toContain('Les bêta-testeurs');
  });

  test('bulle : un message sans lien de conversation n’en porte aucune', () => {
    expect(bubble('Bonjour https://example.com/chat/mshy_beta')).not.toContain('data-conversation-card');
  });

  test('rangée plate : la même carte, sous le même texte', () => {
    const html = withCache(
      <FocalRow
        mode="focal"
        place={placed('https://meeshy.me/chat/mshy_beta')}
        languages={['fr']}
        viewerId="u-viewer"
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
      />,
    );
    expect(html).toContain('data-conversation-card="guest"');
  });
});
