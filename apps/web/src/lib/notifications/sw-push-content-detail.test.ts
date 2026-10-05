import { describe, expect, test } from 'bun:test';

import { COMPOSE_PARAM, inviteAppPath } from '@/lib/notifications/content-detail';
import { mount, push, windowClient } from '@/test-support/sw-push-harness';

/**
 * LA NOTIFICATION SYSTÈME WEB PORTE LE DÉTAIL DU CONTENU (#8860, jumeau de
 * #8856). Le CORPS est composé par la passerelle (`detailedBannerBody`) ; le
 * worker y ajoute ce qu'un texte ne porte pas : les actions (« Ouvrir la
 * carte », « Rejoindre », « Répondre », libellées par la passerelle dans la
 * langue du lecteur) et la vignette d'une vidéo. La charge est celle de
 * `createNotification` + `contentDetailPushFields` + `contentActionPushFields`.
 */

const message = (data: Record<string, unknown>, body = 'Bonjour') => ({
  notification: { title: 'Awa', body },
  data: {
    notificationId: 'n-1',
    type: 'new_message',
    conversationId: 'conv-1',
    replyActionLabel: 'Répondre',
    ...data,
  },
});

const location = {
  locationLat: '48.8584',
  locationLon: '2.2945',
  locationName: 'Tour Eiffel',
  contentActionLabel: 'Ouvrir la carte',
};

const click = (data: Record<string, unknown>, action = '') => ({
  action,
  notification: { data, close: () => undefined },
});

const shownAfter = async (payload: unknown) => {
  const worker = mount();
  await worker.dispatch('push', push(payload));
  return worker.shown[0]?.options ?? {};
};

describe('les actions que le contenu appelle', () => {
  test('une position : « Ouvrir la carte » puis « Répondre », le corps tel que servi', async () => {
    const options = await shownAfter(message(location, '📍 Tour Eiffel'));
    expect(options['body']).toBe('📍 Tour Eiffel');
    expect(options['actions']).toEqual([
      { action: 'open-map', title: 'Ouvrir la carte' },
      { action: 'reply', title: 'Répondre' },
    ]);
    expect(options['data']).toMatchObject({ mapUrl: 'https://maps.apple.com/?ll=48.85840,2.29450&q=Tour%20Eiffel' });
  });

  test('une invitation Meeshy : « Rejoindre » vers l’écran d’invitation', async () => {
    const options = await shownAfter(
      message({ inviteUrl: 'https://meeshy.me/chat/abc', inviteConversationTitle: 'Équipe', inviteMemberCount: '12', contentActionLabel: 'Rejoindre' }),
    );
    expect(options['actions']).toEqual([
      { action: 'join', title: 'Rejoindre' },
      { action: 'reply', title: 'Répondre' },
    ]);
    expect(options['data']).toMatchObject({ invitePath: inviteAppPath('https://meeshy.me/chat/abc') });
  });

  test('une invitation vers un autre hôte n’offre pas « Rejoindre »', async () => {
    const options = await shownAfter(message({ inviteUrl: 'https://evil.example/chat/abc', contentActionLabel: 'Rejoindre' }));
    expect(options['actions']).toEqual([{ action: 'reply', title: 'Répondre' }]);
  });

  test('un texte, un contact, un lien ou un sticker : « Répondre » seul', async () => {
    const options = await shownAfter(message({ contactName: 'Mamadou', linkUrl: 'https://example.com', linkDomain: 'example.com' }));
    expect(options['actions']).toEqual([{ action: 'reply', title: 'Répondre' }]);
  });

  test('sans libellé servi, aucune action : le worker n’invente pas de mot', async () => {
    const options = await shownAfter(message({ ...location, contentActionLabel: '', replyActionLabel: '' }));
    expect(options['actions']).toBeUndefined();
  });
});

describe('la vignette d’une vidéo', () => {
  test('une vignette https devient l’image de la notification', async () => {
    const options = await shownAfter(message({ thumbnailUrl: 'https://gate.meeshy.me/api/v1/attachments/file/t.jpg' }, '🎬 Vidéo'));
    expect(options['image']).toBe('https://gate.meeshy.me/api/v1/attachments/file/t.jpg');
  });

  test('une vignette qui n’est pas https n’est pas rendue', async () => {
    const options = await shownAfter(message({ thumbnailUrl: 'javascript:alert(1)' }));
    expect(options['image']).toBeUndefined();
  });
});

describe('un message PROTÉGÉ ne montre aucun détail (second verrou)', () => {
  test('sous `notificationLocKey`, ni image, ni carte, ni invitation — « Répondre » reste', async () => {
    const options = await shownAfter(
      message(
        {
          notificationLocKey: 'notification.viewOnce',
          ...location,
          inviteUrl: 'https://meeshy.me/chat/abc',
          thumbnailUrl: 'https://gate.meeshy.me/secret.jpg',
        },
        '👁️ 🎬',
      ),
    );
    expect(options['image']).toBeUndefined();
    expect(options['actions']).toEqual([{ action: 'reply', title: 'Répondre' }]);
    const rendu = JSON.stringify(options);
    expect({ secret: rendu.includes('secret.jpg'), carte: rendu.includes('maps.apple.com'), invitation: rendu.includes('/chat/abc') }).toEqual({
      secret: false,
      carte: false,
      invitation: false,
    });
  });
});

describe('toucher une action', () => {
  test('« Ouvrir la carte » ouvre Plans', async () => {
    const worker = mount({ clients: [windowClient('hidden')] });
    await worker.dispatch('notificationclick', click({ conversationId: 'conv-1', mapUrl: 'https://maps.apple.com/?ll=1.00000,2.00000' }, 'open-map'));
    expect(worker.opened).toEqual(['https://maps.apple.com/?ll=1.00000,2.00000']);
  });

  test('« Ouvrir la carte » refuse une adresse qui n’est pas celle de Plans', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ conversationId: 'conv-1', mapUrl: 'https://evil.example/' }, 'open-map'));
    expect(worker.opened).toEqual(['/c/conv-1']);
  });

  test('« Rejoindre » ouvre l’écran d’invitation — dans l’onglet ouvert s’il y en a un', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    await worker.dispatch('notificationclick', click({ conversationId: 'conv-1', invitePath: '/chat/abc' }, 'join'));
    expect(client.focused).toBe(true);
    expect(client.messages.length).toBe(1);
    expect(client.messages[0]).toMatchObject({ type: 'NOTIFICATION_CLICKED', url: '/chat/abc' });
  });

  test('« Répondre », aucun onglet : ouvre le fil avec le curseur dans le composeur', async () => {
    const worker = mount();
    await worker.dispatch('notificationclick', click({ type: 'new_message', conversationId: 'conv-1' }, 'reply'));
    expect(worker.opened).toEqual([`/c/conv-1?${COMPOSE_PARAM}=1`]);
  });

  test('« Répondre », onglet ouvert : il reçoit le fil ET l’intention d’écrire', async () => {
    const client = windowClient('hidden');
    const worker = mount({ clients: [client] });
    await worker.dispatch('notificationclick', click({ type: 'new_message', conversationId: 'conv-1' }, 'reply'));
    expect(client.messages.length).toBe(1);
    expect(client.messages[0]).toMatchObject({ type: 'NOTIFICATION_CLICKED', url: '/c/conv-1', compose: true });
  });
});
