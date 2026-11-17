import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationCard } from '@meeshy/shared/types/conversation-card';

import { conversationCardQueryKey } from '@/lib/api/conversation-card';
import { amina, anonymousGuest, message, threadMoment, VIEWER_ID } from '@/lib/api/fixtures-base';
import type { FeedPost } from '@/lib/api/feed-pages';
import { postQueryKey } from '@/lib/api/publication-detail';
import type { Message, Participant } from '@/lib/api/types';
import { resolveFeedCardModel } from '@/lib/feed/card-model';
import type { PlacedMessage } from '@/lib/grouping';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Bubble } from './bubble';
import { FeedPostCard } from './feed-post-card';
import { FocalRow } from './focal-row';

/**
 * **OÙ LA CARTE D'UN CONTENU APPARAÎT (#19334).**
 *
 * Sous le texte d'un message — dans la bulle comme dans la rangée plate, même
 * geste, même effet (dimension 6) —, et sous le texte d'une publication. UNE
 * carte par message : la carte de conversation passe avant. Mêmes exclusions
 * que la carte de conversation : un expéditeur sans compte, un message scellé
 * de bout en bout ne montrent rien.
 */

beforeAll(async () => {
  ensureHappyDomRegistered();
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const POST_ID = '66f0c0ffee0000000000c0de';
const OWN_ID = '66f0c0ffee0000000000beef';

const SHARED: FeedPost = {
  id: POST_ID,
  type: 'REEL',
  createdAt: '2026-11-17T09:00:00.000Z',
  content: 'La danse du soir',
  originalLanguage: 'fr',
  author: { id: 'u-kofi', username: 'kofi', displayName: 'Kofi Mensah', avatar: null },
  viewCount: 40,
  bookmarkCount: 1,
};

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

const withCache = (node: React.ReactElement): string => {
  const client = new QueryClient();
  client.setQueryData(postQueryKey(POST_ID), SHARED);
  client.setQueryData(conversationCardQueryKey({ kind: 'share-link', identifier: 'mshy_beta' }), CARD);
  return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
};

const from = (content: string, sender: Participant = amina, overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-carte-contenu',
    senderId: sender.id,
    sender,
    content,
    originalLanguage: 'fr',
    translations: [],
    createdAt: threadMoment(5),
    ...overrides,
  });

const placed = (msg: Message): PlacedMessage => ({ message: msg, head: true, tail: true, opensDay: null });

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
      <FocalRow mode="focal" place={placed(msg)} languages={['fr']} viewerId={VIEWER_ID} ephemeralDeadline={{ state: 'none' }} onJumpToMessage={() => {}} />,
    ),
} as const;

for (const [skin, render] of Object.entries(SKINS)) {
  describe(`${skin} — la carte d’un contenu sous le texte`, () => {
    test('un lien vers un réel devient sa carte, après le texte', () => {
      const html = render(from(`Regarde ça https://meeshy.me/reel/${POST_ID}`));
      expect(html).toContain('data-content-card="card"');
      expect(html).toContain('Kofi Mensah');
      expect(html.indexOf('data-rich-text')).toBeLessThan(html.indexOf('data-content-card'));
    });

    test('la carte de conversation passe avant : une seule carte par message', () => {
      const html = render(from(`https://meeshy.me/reel/${POST_ID} et https://meeshy.me/chat/mshy_beta`));
      expect(html).toContain('data-conversation-card');
      expect(html).not.toContain('data-content-card');
    });

    test('un expéditeur sans compte : son lien reste du texte, aucune carte', () => {
      expect(render(from(`https://meeshy.me/reel/${POST_ID}`, anonymousGuest))).not.toContain('data-content-card');
    });

    test('un message scellé de bout en bout : aucun lien ne sort, carte comprise', () => {
      const sealed = from(`https://meeshy.me/reel/${POST_ID}`, amina, { isEncrypted: true, encryptionMode: 'e2ee' });
      expect(render(sealed)).not.toContain('data-content-card');
    });

    test('un message sans lien Meeshy n’en porte aucune', () => {
      expect(render(from(`https://example.com/reel/${POST_ID}`))).not.toContain('data-content-card');
    });
  });
}

describe('la carte d’un contenu sous le texte d’une publication', () => {
  const post = (content: string): FeedPost => ({ id: OWN_ID, type: 'POST', createdAt: '2026-11-17T10:00:00.000Z', content, originalLanguage: 'fr', author: { id: 'u-amina', displayName: 'Amina' } });
  const card = (content: string) => withCache(<FeedPostCard model={resolveFeedCardModel(post(content), { preferredLanguages: ['fr'], now: new Date('2026-11-17T12:00:00.000Z') })} />);

  test('le premier lien de contenu du texte reçoit sa carte, sous le texte', () => {
    const html = card(`Mon réel préféré : https://meeshy.me/reel/${POST_ID}`);
    expect(html).toContain('data-content-card="card"');
    expect(html.indexOf('data-feed-text')).toBeLessThan(html.indexOf('data-content-card'));
  });

  test('jamais la carte de la publication elle-même', () => {
    expect(card(`Moi : https://meeshy.me/post/${OWN_ID}`)).not.toContain('data-content-card');
  });
});
