/**
 * CE QUE PORTE UN PUSH WEB (#7308) — la composition du bloc `webpush`, testée
 * en fonction pure. Le branchement dans `sendViaFCM` (chokepoint de
 * préférences → jeton `platform:'web'`) est gardé par deux témoins
 * d'intégration dans `PushNotificationService.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { webPushConfig } from '../../../services/web-push-config';

const RFC8030_TOPIC = /^[A-Za-z0-9_-]{1,32}$/;

const banner = { title: 'Alice', body: 'Salut' };

describe('webPushConfig — la bannière et son lien', () => {
  it('a conversation gives the legacy link, and the banner its static icon', () => {
    const webpush = webPushConfig({ title: 'Message', body: 'Hello', data: { conversationId: 'conv-999' } });

    expect(webpush.fcmOptions?.link).toBe('/conversations/conv-999');
    expect(webpush.notification?.icon).toBe('/android-chrome-192x192.png');
  });

  it('no link and no conversation: no fcmOptions', () => {
    expect(webPushConfig({ title: 'Alert', body: 'System notification' }).fcmOptions).toBeUndefined();
  });

  it('an explicit link wins over the conversation', () => {
    const webpush = webPushConfig({
      title: 'Post',
      body: 'New post',
      link: '/posts/123',
      data: { conversationId: 'conv-ignore' },
    });

    expect(webpush.fcmOptions?.link).toBe('/posts/123');
  });
});

describe('webPushConfig — le son coupé, l’empilement et le remplacement choisis par le lecteur', () => {
  it('muted silences the banner without hiding it', () => {
    const notification = webPushConfig({ ...banner, muted: true }).notification;

    expect(notification).toMatchObject({ title: 'Alice', body: 'Salut', silent: true });
  });

  // Le `tag` vient de `threadId`, PAS de la carte `data` : un identifiant
  // DIFFÉRENT dans `data` est ce qui distingue les deux sources.
  it('threadId becomes the tag — the web analogue of aps thread-id', () => {
    const webpush = webPushConfig({ ...banner, threadId: 'conv-42', data: { conversationId: 'conv-999' } });

    expect(webpush.notification?.tag).toBe('conv-42');
  });

  // Une bannière qui REMPLACE sa précédente de même `tag` ne s'annonce pas
  // sans `renotify` (Notifications API, « show steps »). Le SDK Firebase de
  // l'ancien worker affiche ce bloc TEL QUEL : sans ce drapeau, chaque message
  // après le premier d'une conversation y arriverait sans annonce.
  it('a banner that replaces its conversation predecessor still alerts — renotify rides with the tag', () => {
    const notification = webPushConfig({ ...banner, threadId: 'conv-42' }).notification;

    expect(notification).toMatchObject({ tag: 'conv-42', renotify: true });
    expect(notification).not.toHaveProperty('silent');
  });

  // `muted` retire le SON, pas la bannière : la remplaçante reste annoncée,
  // sans son ni vibration. La paire ne lève aucun TypeError — seuls
  // `silent`+`vibrate` et `renotify` sans `tag` en lèvent.
  it('muted keeps the replacing banner VISIBLE — silent takes the sound, renotify still announces it', () => {
    const notification = webPushConfig({ ...banner, muted: true, threadId: 'conv-42' }).notification;

    expect(notification).toMatchObject({ tag: 'conv-42', renotify: true, silent: true });
    expect(notification).not.toHaveProperty('vibrate');
  });

  it('collapseId becomes the Topic header — the web pendant of apns-collapse-id', () => {
    const webpush = webPushConfig({ ...banner, collapseId: 'conv-68d1f4a9c2b7e30411aa93de' });

    expect(webpush.headers?.Topic).toBe('conv-68d1f4a9c2b7e30411aa93de');
  });

  // RFC 8030 § 5.4 : au plus 32 caractères de l'alphabet base64url, sans quoi
  // le service de push DOIT répondre 400 — le message est PERDU, pas seulement
  // non regroupé. Aucun producteur actuel ne dépasse ; `collapseId` reste une
  // chaîne libre, et la borne se tient ici plutôt qu'en prose.
  it('a collapseId outside the RFC 8030 grammar still yields a conformant Topic, stable per collapseId', () => {
    const topic = (collapseId: string) => webPushConfig({ ...banner, collapseId }).headers?.Topic;

    const long = topic('conversation:68d1f4a9c2b7e30411aa93de:thread');
    const again = topic('conversation:68d1f4a9c2b7e30411aa93de:thread');
    const other = topic('conversation:68d1f4a9c2b7e30411aa93df:thread');

    expect(long).toMatch(RFC8030_TOPIC);
    expect(other).toMatch(RFC8030_TOPIC);
    expect(again).toBe(long);
    expect(other).not.toBe(long);
  });

  it('the three settings travel together, and displace nothing already served', () => {
    const webpush = webPushConfig({
      ...banner,
      muted: true,
      threadId: 'conv-42',
      collapseId: 'conv-42',
      data: { conversationId: 'conv-42' },
    });

    expect(webpush.notification).toMatchObject({ silent: true, tag: 'conv-42', renotify: true });
    expect(webpush.headers?.Topic).toBe('conv-42');
    expect(webpush.notification?.icon).toBe('/android-chrome-192x192.png');
    expect(webpush.fcmOptions?.link).toBe('/conversations/conv-42');
  });

  // Contre-témoin : ces champs n'apparaissent pas sans qu'on les demande — et
  // `renotify` jamais sans `tag`, qui ferait lever un TypeError à
  // `showNotification` chez tout consommateur qui affiche le bloc tel quel.
  it('no preference asked: sound, no tag, no renotify, no Topic', () => {
    const webpush = webPushConfig({ ...banner, data: { conversationId: 'conv-1' } });

    expect(webpush.notification).not.toHaveProperty('silent');
    expect(webpush.notification).not.toHaveProperty('tag');
    expect(webpush.notification).not.toHaveProperty('renotify');
    expect(webpush.headers).toBeUndefined();
  });
});
