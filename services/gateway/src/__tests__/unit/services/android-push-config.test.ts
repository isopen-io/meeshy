/**
 * CE QUE PORTE UNE BANNIÈRE ANDROID (#8171) — le bloc `android.notification`
 * d'un message FCM, testé en fonction pure. Son branchement dans `sendViaFCM`
 * est gardé par les témoins Android de `PushNotificationService.test.ts`
 * (`should include android-specific config for android FCM tokens`, badge).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';

import { androidNotificationConfig } from '../../../services/android-push-config';

const banner = { title: 'Alice', body: 'Salut' };

describe('androidNotificationConfig — le son, le canal et le badge', () => {
  it('a plain banner rings the default sound on the shell channel', () => {
    expect(androidNotificationConfig(banner)).toEqual({ sound: 'default', channelId: 'meeshy_notifications' });
  });

  it('a chosen sound is kept, and a muted reader gets no sound at all', () => {
    expect(androidNotificationConfig({ ...banner, sound: 'notification.mp3' }).sound).toBe('notification.mp3');
    expect(androidNotificationConfig({ ...banner, muted: true })).not.toHaveProperty('sound');
  });

  it('the badge travels as notificationCount, zero included', () => {
    expect(androidNotificationConfig({ ...banner, badge: 7 }).notificationCount).toBe(7);
    expect(androidNotificationConfig({ ...banner, badge: 0 }).notificationCount).toBe(0);
    expect(androidNotificationConfig(banner)).not.toHaveProperty('notificationCount');
  });
});

describe('androidNotificationConfig — la bannière d’une conversation remplace la précédente, comme sur le web', () => {
  it('threadId becomes the tag, the analogue of the web tag and of aps thread-id', () => {
    expect(androidNotificationConfig({ ...banner, threadId: 'conv-42' }).tag).toBe('conv-42');
  });

  it('no threadId and no notificationId means no tag', () => {
    expect(androidNotificationConfig(banner)).not.toHaveProperty('tag');
    expect(androidNotificationConfig({ ...banner, threadId: '' })).not.toHaveProperty('tag');
  });
});

describe('androidNotificationConfig — une notification corrigée remplace SA bannière, comme sur le web (#8201)', () => {
  it('without threadId the notification identity is the tag, like the web fallback to notificationId', () => {
    expect(androidNotificationConfig({ ...banner, data: { notificationId: 'notif-7' } }).tag).toBe('notif-7');
  });

  it('the conversation still wins when both are present', () => {
    expect(androidNotificationConfig({ ...banner, threadId: 'conv-42', data: { notificationId: 'notif-7' } }).tag).toBe('conv-42');
  });

  it('an empty notificationId sets no tag', () => {
    expect(androidNotificationConfig({ ...banner, data: { notificationId: '' } })).not.toHaveProperty('tag');
  });
});
