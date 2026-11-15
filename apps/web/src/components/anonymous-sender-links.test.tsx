import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { conversationCardQueryKey } from '@/lib/api/conversation-card';
import { amina, anonymousGuest, message, threadMoment, VIEWER_ID } from '@/lib/api/fixtures-base';
import type { Message, Participant } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FocalRow } from './focal-row';

/**
 * **UNE ADRESSE ÉCRITE PAR UN ANONYME S'AFFICHE TELLE QUELLE (#10286).**
 *
 * Directive porteur 2026-10-12 : un invité sans compte peut écrire n'importe
 * quelle adresse — elle n'est ni cliquable, ni raccourcie, ni en carte, et le
 * lien suivi que la passerelle aurait pu publier est ignoré. Les DEUX peaux du
 * fil, même effet (dimension 6). Les messages d'un membre inscrit ne changent
 * pas.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const CONTENT = 'Va sur https://exemple.com puis https://meeshy.me/chat/mshy_x et [ta banque](https://evil.example/login)';

const CARD: ConversationCard = {
  kind: 'share-link',
  conversationId: null,
  title: 'Conversation piégée',
  description: null,
  avatarUrl: null,
  bannerUrl: null,
  conversationType: 'group',
  stats: { memberCount: 3, onlineCount: null, messageCount: null, languages: [] },
  viewer: { isMember: false, canJoin: true, requiresAccount: false, canJoinAnonymously: true },
  link: { identifier: 'mshy_x', isActive: true, expiresAt: null },
  inviter: null,
  inviteMessage: null,
};

const from = (sender: Participant | undefined): Message =>
  message({
    id: 'm-adresse',
    senderId: sender?.id ?? 'p-inconnu',
    ...(sender === undefined ? {} : { sender }),
    content: CONTENT,
    originalLanguage: 'fr',
    translations: [],
    createdAt: threadMoment(5),
    trackingLinks: [{ token: 'Ab3dE6', url: 'https://exemple.com' }],
  });

const placed = (msg: Message): PlacedMessage => ({ message: msg, head: true, tail: true, opensDay: null });

const withCache = (node: React.ReactElement): string => {
  const client = new QueryClient();
  client.setQueryData(conversationCardQueryKey({ kind: 'share-link', identifier: 'mshy_x' }), CARD);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

const SKINS = {
  bulle: (msg: Message) =>
    withCache(
      <Bubble
        place={placed(msg)}
        languages={['fr']}
        isGrouped={false}
        viewerId={VIEWER_ID}
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
        onPickLanguage={() => {}}
      />,
    ),
  'rangée plate': (msg: Message) =>
    withCache(
      <FocalRow
        mode="focal"
        place={placed(msg)}
        languages={['fr']}
        viewerId={VIEWER_ID}
        ephemeralDeadline={{ state: 'none' }}
        onJumpToMessage={() => {}}
      />,
    ),
} as const;

const textNode = (html: string): Element => {
  const host = document.createElement('div');
  host.innerHTML = html;
  const node = host.querySelector('[data-rich-text]');
  if (node === null) throw new Error('aucun [data-rich-text] rendu');
  return node;
};

for (const [skin, render] of Object.entries(SKINS)) {
  describe(`${skin} — l’adresse d’un anonyme`, () => {
    test('aucun lien, aucun lien suivi, aucune carte', () => {
      const html = render(from(anonymousGuest));
      expect(textNode(html).querySelectorAll('a').length).toBe(0);
      expect(html).not.toContain('/l/');
      expect(html).not.toContain('data-conversation-card');
    });

    test('le texte reste celui qui a été écrit, adresse cachée derrière un libellé comprise', () => {
      expect(textNode(render(from(anonymousGuest))).textContent).toBe(CONTENT);
    });

    test('un expéditeur indéterminé est traité comme un anonyme (fail-closed)', () => {
      const html = render(from(undefined));
      expect(textNode(html).querySelectorAll('a').length).toBe(0);
      expect(html).not.toContain('data-conversation-card');
    });

    test('un membre inscrit garde ses liens et sa carte', () => {
      const html = render(from(amina));
      expect(textNode(html).querySelectorAll('a').length).toBeGreaterThan(0);
      expect(html).toContain('/l/Ab3dE6');
      expect(html).toContain('data-conversation-card');
    });
  });
}
