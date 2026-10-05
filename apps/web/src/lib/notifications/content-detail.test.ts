import { describe, expect, test } from 'bun:test';

import { bannerActions, bannerAudio, decodeContentDetail, inviteAppPath } from './content-detail';
import { decodeNotification } from './record';

/**
 * LE DÉTAIL D'UN CONTENU DANS LA BANNIÈRE WEB (#8860, jumeau de #8856) —
 * `context.contentDetail` (#8857) lu FAIL-CLOSED depuis le socket, et les
 * gestes qu'il appelle : « Ouvrir la carte », « Rejoindre », « Répondre ».
 */

const served = (context: Record<string, unknown>, type = 'new_message') => ({
  id: 'n1',
  type,
  title: 'Awa',
  content: '📍 Tour Eiffel',
  actor: { id: 'u-awa', username: 'awa', displayName: 'Awa', avatar: null },
  context: { conversationId: 'c1', ...context },
  metadata: {},
  state: { isRead: false, createdAt: '2026-10-01T08:00:00.000Z' },
});

const place = { latitude: 48.8584, longitude: 2.2945, name: 'Tour Eiffel', address: 'Champ de Mars' };

describe('decodeContentDetail — ce que la passerelle a servi, et rien d’autre', () => {
  test('une position, un contact, une invitation, un lien, un sticker, une vignette, une réponse à une story', () => {
    expect(
      decodeContentDetail({
        location: place,
        contact: { name: 'Mamadou' },
        invite: { url: 'https://meeshy.me/chat/abc', conversationTitle: 'Équipe', memberCount: 12 },
        link: { url: 'https://example.com/a', domain: 'example.com' },
        sticker: { emoji: '🥳' },
        videoThumbnailUrl: '2026/09/t.jpg',
        storyReply: { authorId: 'u-me' },
      }),
    ).toEqual({
      location: place,
      contact: { name: 'Mamadou' },
      invite: { url: 'https://meeshy.me/chat/abc', conversationTitle: 'Équipe', memberCount: 12 },
      link: { url: 'https://example.com/a', domain: 'example.com' },
      sticker: { emoji: '🥳' },
      videoThumbnailUrl: '2026/09/t.jpg',
      storyReply: { authorId: 'u-me' },
    });
  });

  test('une coordonnée hors bornes, une URL absente ou un champ illisible est retiré', () => {
    expect(
      decodeContentDetail({
        location: { latitude: 120, longitude: 2 },
        invite: { conversationTitle: 'x' },
        link: { url: 42 },
        videoThumbnailUrl: '',
      }),
    ).toBeNull();
    expect(decodeContentDetail('nope')).toBeNull();
  });
});

describe('la notification décodée porte son détail — sauf un message protégé', () => {
  test('le détail et le vocal servis voyagent jusqu’à la bannière', () => {
    const record = decodeNotification(
      served({
        contentDetail: { location: place },
        firstAttachmentUrl: '2026/09/v.m4a',
        firstAttachmentMimeType: 'audio/mp4',
        firstAttachmentDurationMs: 12_000,
      }),
    );
    expect(record?.context.contentDetail).toEqual({ location: place });
    expect(record === null ? null : bannerAudio(record)).toEqual({ url: '2026/09/v.m4a', durationMs: 12_000 });
  });

  test('`notificationLocKey` DÉCLARE un contenu protégé : ni détail ni média, même s’ils avaient glissé', () => {
    const record = decodeNotification(
      served({
        notificationLocKey: 'notification.viewOnce',
        contentDetail: { location: place },
        firstAttachmentUrl: '2026/09/v.m4a',
        firstAttachmentMimeType: 'audio/mp4',
      }),
    );
    expect(record?.context.contentDetail).toBeUndefined();
    expect(record === null ? 'absent' : bannerAudio(record)).toBeNull();
  });

  test('une pièce jointe qui n’est pas un son n’est pas un vocal', () => {
    const record = decodeNotification(served({ firstAttachmentUrl: '2026/09/p.png', firstAttachmentMimeType: 'image/png' }));
    expect(record === null ? 'absent' : bannerAudio(record)).toBeNull();
  });
});

describe('inviteAppPath — une invitation Meeshy s’ouvre DANS l’application', () => {
  test('https://meeshy.me/chat, /join et meeshy:// mènent au même écran', () => {
    expect(inviteAppPath('https://meeshy.me/chat/abc_1')).toBe('/chat/abc_1');
    expect(inviteAppPath('https://staging.meeshy.me/join/abc')).toBe('/chat/abc');
    expect(inviteAppPath('meeshy://chat/abc')).toBe('/chat/abc');
  });

  test('un autre hôte, une autre forme ou une clé suspecte ne mène nulle part', () => {
    expect(inviteAppPath('https://evil.example/chat/abc')).toBeNull();
    expect(inviteAppPath('https://meeshy.me/u/abc')).toBeNull();
    expect(inviteAppPath('https://meeshy.me/chat/a%2F..')).toBeNull();
    expect(inviteAppPath('pas une url')).toBeNull();
  });
});

describe('bannerActions — les gestes que le contenu appelle', () => {
  const actionsOf = (context: Record<string, unknown>, type = 'new_message', platform?: string) => {
    const record = decodeNotification(served(context, type));
    return record === null ? [] : bannerActions(record, { platform });
  };

  test('une position : « Ouvrir la carte » vers Plans, puis « Répondre »', () => {
    expect(actionsOf({ contentDetail: { location: place } })).toEqual([
      { kind: 'open-map', href: 'https://maps.apple.com/?ll=48.85840,2.29450&q=Tour%20Eiffel' },
      { kind: 'reply', path: '/c/c1' },
    ]);
  });

  test('sous la coque Android, la carte s’ouvre par `geo:` dans l’app de cartes', () => {
    expect(actionsOf({ contentDetail: { location: place } }, 'new_message', 'android')[0]).toEqual({
      kind: 'open-map',
      href: 'geo:48.85840,2.29450?q=48.85840,2.29450(Tour%20Eiffel)',
    });
  });

  test('une invitation : « Rejoindre » ouvre l’écran d’invitation, puis « Répondre »', () => {
    expect(actionsOf({ contentDetail: { invite: { url: 'https://meeshy.me/chat/abc', conversationTitle: null, memberCount: null } } })).toEqual([
      { kind: 'join', path: '/chat/abc' },
      { kind: 'reply', path: '/c/c1' },
    ]);
  });

  test('un texte simple : « Répondre » seul ; une réaction ou un post : rien', () => {
    expect(actionsOf({})).toEqual([{ kind: 'reply', path: '/c/c1' }]);
    expect(actionsOf({}, 'message_reaction')).toEqual([]);
    expect(actionsOf({ conversationId: undefined, postId: 'p1' }, 'post_like')).toEqual([]);
  });
});
