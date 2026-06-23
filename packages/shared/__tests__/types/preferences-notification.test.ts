import { describe, it, expect } from 'vitest';
import {
  NotificationPreferenceSchema,
  NOTIFICATION_PREFERENCE_DEFAULTS,
} from '../../types/preferences/notification.js';

describe('NotificationPreferenceSchema', () => {
  it('accepts a fully specified valid object', () => {
    const result = NotificationPreferenceSchema.safeParse({
      pushEnabled: true,
      emailEnabled: false,
      soundEnabled: true,
      vibrationEnabled: false,
      newMessageEnabled: true,
      missedCallEnabled: false,
      voicemailEnabled: true,
      systemEnabled: true,
      conversationEnabled: true,
      replyEnabled: true,
      mentionEnabled: true,
      reactionEnabled: false,
      contactRequestEnabled: true,
      groupInviteEnabled: true,
      memberJoinedEnabled: false,
      memberLeftEnabled: true,
      postLikeEnabled: true,
      postCommentEnabled: true,
      postRepostEnabled: false,
      storyReactionEnabled: true,
      commentReplyEnabled: true,
      commentLikeEnabled: false,
      dndEnabled: true,
      dndStartTime: '22:00',
      dndEndTime: '08:00',
      dndDays: ['mon', 'fri'],
      showPreview: true,
      showSenderName: false,
      groupNotifications: true,
      notificationBadgeEnabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults for an empty object', () => {
    const result = NotificationPreferenceSchema.safeParse({});
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pushEnabled).toBe(true);
    expect(result.data.emailEnabled).toBe(true);
    expect(result.data.soundEnabled).toBe(true);
    expect(result.data.vibrationEnabled).toBe(true);
    expect(result.data.newMessageEnabled).toBe(true);
    expect(result.data.dndEnabled).toBe(false);
    expect(result.data.dndStartTime).toBe('22:00');
    expect(result.data.dndEndTime).toBe('08:00');
    expect(result.data.dndDays).toEqual([]);
    expect(result.data.showPreview).toBe(true);
    expect(result.data.showSenderName).toBe(true);
    expect(result.data.groupNotifications).toBe(true);
    expect(result.data.notificationBadgeEnabled).toBe(true);
  });

  it('validates dndStartTime format — rejects invalid time', () => {
    const result = NotificationPreferenceSchema.safeParse({ dndStartTime: '25:00' });
    expect(result.success).toBe(false);
  });

  it('validates dndStartTime format — rejects non-time string', () => {
    const result = NotificationPreferenceSchema.safeParse({ dndStartTime: 'noon' });
    expect(result.success).toBe(false);
  });

  it('validates dndEndTime format — accepts boundary 23:59', () => {
    const result = NotificationPreferenceSchema.safeParse({ dndEndTime: '23:59' });
    expect(result.success).toBe(true);
  });

  it('validates dndEndTime format — rejects 24:00', () => {
    const result = NotificationPreferenceSchema.safeParse({ dndEndTime: '24:00' });
    expect(result.success).toBe(false);
  });

  it('validates dndDays enum values — rejects invalid day', () => {
    const result = NotificationPreferenceSchema.safeParse({ dndDays: ['monday'] });
    expect(result.success).toBe(false);
  });

  it('validates dndDays enum values — accepts all valid days', () => {
    const result = NotificationPreferenceSchema.safeParse({
      dndDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dndDays).toHaveLength(7);
  });

  it('rejects non-boolean values for boolean fields', () => {
    const result = NotificationPreferenceSchema.safeParse({ pushEnabled: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('NOTIFICATION_PREFERENCE_DEFAULTS', () => {
  it('has all notification channels enabled', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.pushEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.emailEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.soundEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.vibrationEnabled).toBe(true);
  });

  it('has all notification types enabled', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.newMessageEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.missedCallEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.voicemailEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.systemEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.conversationEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.mentionEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.reactionEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.contactRequestEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.memberJoinedEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.memberLeftEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.postLikeEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.postCommentEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.commentReplyEnabled).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.commentLikeEnabled).toBe(true);
  });

  it('has DND disabled with standard overnight schedule', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.dndEnabled).toBe(false);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.dndStartTime).toBe('22:00');
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.dndEndTime).toBe('08:00');
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.dndDays).toEqual([]);
  });

  it('has preview and grouping enabled', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.showPreview).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.showSenderName).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.groupNotifications).toBe(true);
    expect(NOTIFICATION_PREFERENCE_DEFAULTS.notificationBadgeEnabled).toBe(true);
  });

  it('is a valid NotificationPreferenceSchema value', () => {
    const result = NotificationPreferenceSchema.safeParse(NOTIFICATION_PREFERENCE_DEFAULTS);
    expect(result.success).toBe(true);
  });
});
