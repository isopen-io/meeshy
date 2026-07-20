import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NotificationTypeEnum,
  NotificationPriorityEnum,
  isMessageNotification,
  isMentionNotification,
  isReactionNotification,
  isCallNotification,
  isFriendRequestNotification,
  isMemberEventNotification,
  isLoginNewDeviceNotification,
  isSystemNotification,
  isNotificationExpired,
  isNotificationUnread,
  isDNDActive,
  isNotificationTypeEnabled,
  shouldSendNotification,
  getDefaultNotificationPreferences,
  type Notification,
  type NotificationPreference,
} from '../../types/notification.js';

function makeNotification(type: string, stateOverrides: Partial<Notification['state']> = {}): Notification {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: type as Notification['type'],
    priority: 'normal',
    content: 'test content',
    context: {},
    metadata: { action: 'view_message', messagePreview: 'hello' } as Notification['metadata'],
    state: {
      isRead: false,
      readAt: null,
      createdAt: new Date('2026-01-01T12:00:00Z'),
      ...stateOverrides,
    },
    delivery: { emailSent: false, pushSent: false },
  };
}

function makePrefs(overrides: Partial<NotificationPreference> = {}): NotificationPreference {
  return {
    id: 'pref-1',
    userId: 'user-1',
    pushEnabled: true,
    emailEnabled: true,
    soundEnabled: true,
    newMessageEnabled: true,
    missedCallEnabled: true,
    systemEnabled: true,
    conversationEnabled: true,
    replyEnabled: true,
    mentionEnabled: true,
    reactionEnabled: true,
    contactRequestEnabled: true,
    memberJoinedEnabled: true,
    dndEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('NotificationTypeEnum', () => {
  it('has correct string values for message events', () => {
    expect(NotificationTypeEnum.NEW_MESSAGE).toBe('new_message');
    expect(NotificationTypeEnum.MESSAGE_REPLY).toBe('message_reply');
    expect(NotificationTypeEnum.MESSAGE_REACTION).toBe('message_reaction');
  });

  it('has correct values for contact events', () => {
    expect(NotificationTypeEnum.CONTACT_REQUEST).toBe('contact_request');
    expect(NotificationTypeEnum.CONTACT_ACCEPTED).toBe('contact_accepted');
    expect(NotificationTypeEnum.FRIEND_REQUEST).toBe('friend_request');
  });

  it('has correct values for call events', () => {
    expect(NotificationTypeEnum.MISSED_CALL).toBe('missed_call');
    expect(NotificationTypeEnum.INCOMING_CALL).toBe('incoming_call');
    expect(NotificationTypeEnum.CALL_DECLINED).toBe('call_declined');
  });

  it('has correct values for member events', () => {
    expect(NotificationTypeEnum.MEMBER_JOINED).toBe('member_joined');
    expect(NotificationTypeEnum.MEMBER_LEFT).toBe('member_left');
    expect(NotificationTypeEnum.ADDED_TO_CONVERSATION).toBe('added_to_conversation');
    expect(NotificationTypeEnum.REMOVED_FROM_CONVERSATION).toBe('removed_from_conversation');
  });
});

describe('NotificationPriorityEnum', () => {
  it('has correct priority levels', () => {
    expect(NotificationPriorityEnum.LOW).toBe('low');
    expect(NotificationPriorityEnum.NORMAL).toBe('normal');
    expect(NotificationPriorityEnum.HIGH).toBe('high');
    expect(NotificationPriorityEnum.URGENT).toBe('urgent');
  });
});

describe('isMessageNotification', () => {
  it('returns true for new_message type', () => {
    expect(isMessageNotification(makeNotification('new_message'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isMessageNotification(makeNotification('mention'))).toBe(false);
    expect(isMessageNotification(makeNotification('missed_call'))).toBe(false);
    expect(isMessageNotification(makeNotification('system'))).toBe(false);
  });
});

describe('isMentionNotification', () => {
  it('returns true for user_mentioned type', () => {
    expect(isMentionNotification(makeNotification('user_mentioned'))).toBe(true);
  });

  it('returns true for mention type', () => {
    expect(isMentionNotification(makeNotification('mention'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isMentionNotification(makeNotification('new_message'))).toBe(false);
    expect(isMentionNotification(makeNotification('reaction'))).toBe(false);
  });
});

describe('isReactionNotification', () => {
  it('returns true for message_reaction type', () => {
    expect(isReactionNotification(makeNotification('message_reaction'))).toBe(true);
  });

  it('returns true for reaction type', () => {
    expect(isReactionNotification(makeNotification('reaction'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isReactionNotification(makeNotification('mention'))).toBe(false);
    expect(isReactionNotification(makeNotification('new_message'))).toBe(false);
  });
});

describe('isCallNotification', () => {
  it('returns true for missed_call', () => {
    expect(isCallNotification(makeNotification('missed_call'))).toBe(true);
  });

  it('returns true for call_declined', () => {
    expect(isCallNotification(makeNotification('call_declined'))).toBe(true);
  });

  it('returns true for incoming_call', () => {
    expect(isCallNotification(makeNotification('incoming_call'))).toBe(true);
  });

  it('returns false for non-call types', () => {
    expect(isCallNotification(makeNotification('new_message'))).toBe(false);
    expect(isCallNotification(makeNotification('system'))).toBe(false);
  });
});

describe('isFriendRequestNotification', () => {
  it('returns true for friend_request', () => {
    expect(isFriendRequestNotification(makeNotification('friend_request'))).toBe(true);
  });

  it('returns true for contact_request', () => {
    expect(isFriendRequestNotification(makeNotification('contact_request'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isFriendRequestNotification(makeNotification('contact_accepted'))).toBe(false);
    expect(isFriendRequestNotification(makeNotification('new_message'))).toBe(false);
  });
});

describe('isMemberEventNotification', () => {
  it('returns true for member_joined', () => {
    expect(isMemberEventNotification(makeNotification('member_joined'))).toBe(true);
  });

  it('returns true for member_left', () => {
    expect(isMemberEventNotification(makeNotification('member_left'))).toBe(true);
  });

  it('returns true for added_to_conversation', () => {
    expect(isMemberEventNotification(makeNotification('added_to_conversation'))).toBe(true);
  });

  it('returns true for removed_from_conversation', () => {
    expect(isMemberEventNotification(makeNotification('removed_from_conversation'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isMemberEventNotification(makeNotification('new_message'))).toBe(false);
    expect(isMemberEventNotification(makeNotification('mention'))).toBe(false);
  });
});

describe('isLoginNewDeviceNotification', () => {
  it('returns true for login_new_device type', () => {
    expect(isLoginNewDeviceNotification(makeNotification('login_new_device'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isLoginNewDeviceNotification(makeNotification('system'))).toBe(false);
    expect(isLoginNewDeviceNotification(makeNotification('new_message'))).toBe(false);
  });
});

describe('isSystemNotification', () => {
  it('returns true for system type', () => {
    expect(isSystemNotification(makeNotification('system'))).toBe(true);
  });

  it('returns true for security_alert type', () => {
    expect(isSystemNotification(makeNotification('security_alert'))).toBe(true);
  });

  it('returns true for maintenance type', () => {
    expect(isSystemNotification(makeNotification('maintenance'))).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isSystemNotification(makeNotification('new_message'))).toBe(false);
    expect(isSystemNotification(makeNotification('mention'))).toBe(false);
  });
});

describe('isNotificationExpired', () => {
  it('returns false when expiresAt is not set', () => {
    const n = makeNotification('new_message', { expiresAt: undefined });
    expect(isNotificationExpired(n)).toBe(false);
  });

  it('returns false when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 60_000);
    const n = makeNotification('new_message', { expiresAt: future });
    expect(isNotificationExpired(n)).toBe(false);
  });

  it('returns true when expiresAt is in the past', () => {
    const past = new Date(Date.now() - 60_000);
    const n = makeNotification('new_message', { expiresAt: past });
    expect(isNotificationExpired(n)).toBe(true);
  });
});

describe('isNotificationUnread', () => {
  it('returns true when not read and not expired', () => {
    const future = new Date(Date.now() + 60_000);
    const n = makeNotification('new_message', { isRead: false, expiresAt: future });
    expect(isNotificationUnread(n)).toBe(true);
  });

  it('returns false when already read', () => {
    const n = makeNotification('new_message', { isRead: true, readAt: new Date() });
    expect(isNotificationUnread(n)).toBe(false);
  });

  it('returns false when expired (even if not read)', () => {
    const past = new Date(Date.now() - 60_000);
    const n = makeNotification('new_message', { isRead: false, expiresAt: past });
    expect(isNotificationUnread(n)).toBe(false);
  });

  it('returns true when no expiresAt and not read', () => {
    const n = makeNotification('new_message', { isRead: false, expiresAt: undefined });
    expect(isNotificationUnread(n)).toBe(true);
  });
});

describe('isDNDActive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when dndEnabled is false', () => {
    const prefs = makePrefs({ dndEnabled: false });
    expect(isDNDActive(prefs)).toBe(false);
  });

  it('returns true when dndEnabled is true and no times set', () => {
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: undefined, dndEndTime: undefined });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns false when dndEnabled is true but only start time set (no end time)', () => {
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '22:00', dndEndTime: undefined });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns false when dndEnabled is true but only end time set (no start time)', () => {
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: undefined, dndEndTime: '08:00' });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns true for normal DND when current time is within range', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 15, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '14:00', dndEndTime: '16:00' });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns false for normal DND when current time is outside range', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '14:00', dndEndTime: '16:00' });
    expect(isDNDActive(prefs)).toBe(false);
  });

  it('returns false for normal DND when current time equals end time (exclusive)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 16, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '14:00', dndEndTime: '16:00' });
    expect(isDNDActive(prefs)).toBe(false);
  });

  it('returns true for overnight DND when current time is after start (e.g. 23:00)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 23, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns true for overnight DND when current time is before end (e.g. 07:00)', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 7, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' });
    expect(isDNDActive(prefs)).toBe(true);
  });

  it('returns false for overnight DND when current time is midday', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' });
    expect(isDNDActive(prefs)).toBe(false);
  });

  it('returns true for overnight DND at exactly start time', () => {
    vi.setSystemTime(new Date(2026, 0, 15, 22, 0, 0));
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' });
    expect(isDNDActive(prefs)).toBe(true);
  });
});

describe('isNotificationTypeEnabled', () => {
  const allEnabled = makePrefs();

  it('returns newMessageEnabled for new_message', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'new_message')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ newMessageEnabled: false }), 'new_message')).toBe(false);
  });

  it('returns missedCallEnabled for missed_call', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'missed_call')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ missedCallEnabled: false }), 'missed_call')).toBe(false);
  });

  it('returns systemEnabled for system', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'system')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ systemEnabled: false }), 'system')).toBe(false);
  });

  it('returns systemEnabled for security_alert', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'security_alert')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ systemEnabled: false }), 'security_alert')).toBe(false);
  });

  it('returns conversationEnabled for new_conversation', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'new_conversation')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ conversationEnabled: false }), 'new_conversation')).toBe(false);
  });

  it('returns replyEnabled for reply', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'reply')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ replyEnabled: false }), 'reply')).toBe(false);
  });

  it('returns mentionEnabled for mention', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'mention')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ mentionEnabled: false }), 'mention')).toBe(false);
  });

  it('returns mentionEnabled for user_mentioned', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'user_mentioned')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ mentionEnabled: false }), 'user_mentioned')).toBe(false);
  });

  it('returns reactionEnabled for reaction', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'reaction')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ reactionEnabled: false }), 'reaction')).toBe(false);
  });

  it('returns reactionEnabled for message_reaction', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'message_reaction')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ reactionEnabled: false }), 'message_reaction')).toBe(false);
  });

  it('returns contactRequestEnabled for contact_request', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'contact_request')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ contactRequestEnabled: false }), 'contact_request')).toBe(false);
  });

  it('returns contactRequestEnabled for friend_request', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'friend_request')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ contactRequestEnabled: false }), 'friend_request')).toBe(false);
  });

  it('returns contactRequestEnabled for contact_accepted', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'contact_accepted')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ contactRequestEnabled: false }), 'contact_accepted')).toBe(false);
  });

  it('returns memberJoinedEnabled for member_joined', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'member_joined')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ memberJoinedEnabled: false }), 'member_joined')).toBe(false);
  });

  it('returns memberJoinedEnabled for member_left', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'member_left')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ memberJoinedEnabled: false }), 'member_left')).toBe(false);
  });

  it('returns true for unknown notification types (default case)', () => {
    expect(isNotificationTypeEnabled(allEnabled, 'friend_new_story')).toBe(true);
    expect(isNotificationTypeEnabled(allEnabled, 'unknown_type')).toBe(true);
    expect(isNotificationTypeEnabled(makePrefs({ pushEnabled: false }), 'post_like')).toBe(true);
  });
});

describe('shouldSendNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when push is disabled and channel is push', () => {
    const prefs = makePrefs({ pushEnabled: false });
    expect(shouldSendNotification(prefs, 'new_message', 'push')).toBe(false);
  });

  it('returns false when email is disabled and channel is email', () => {
    const prefs = makePrefs({ emailEnabled: false });
    expect(shouldSendNotification(prefs, 'new_message', 'email')).toBe(false);
  });

  it('returns false when notification type is disabled', () => {
    const prefs = makePrefs({ newMessageEnabled: false });
    expect(shouldSendNotification(prefs, 'new_message', 'push')).toBe(false);
  });

  it('returns false when DND is active for non-security types', () => {
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '11:00', dndEndTime: '13:00' });
    expect(shouldSendNotification(prefs, 'new_message', 'push')).toBe(false);
  });

  it('bypasses DND for security_alert', () => {
    const prefs = makePrefs({ dndEnabled: true, dndStartTime: '11:00', dndEndTime: '13:00' });
    expect(shouldSendNotification(prefs, 'security_alert', 'push')).toBe(true);
  });

  it('returns true when all conditions are met', () => {
    const prefs = makePrefs();
    expect(shouldSendNotification(prefs, 'new_message', 'push')).toBe(true);
    expect(shouldSendNotification(prefs, 'new_message', 'email')).toBe(true);
  });

  it('push channel is allowed when push is enabled even if email disabled', () => {
    const prefs = makePrefs({ emailEnabled: false });
    expect(shouldSendNotification(prefs, 'new_message', 'push')).toBe(true);
  });

  it('email channel is allowed when email is enabled even if push disabled', () => {
    const prefs = makePrefs({ pushEnabled: false });
    expect(shouldSendNotification(prefs, 'new_message', 'email')).toBe(true);
  });
});

describe('getDefaultNotificationPreferences', () => {
  it('returns a DTO with the provided userId', () => {
    const dto = getDefaultNotificationPreferences('user-42');
    expect(dto.userId).toBe('user-42');
  });

  it('enables push, email, and sound by default', () => {
    const dto = getDefaultNotificationPreferences('u1');
    expect(dto.pushEnabled).toBe(true);
    expect(dto.emailEnabled).toBe(true);
    expect(dto.soundEnabled).toBe(true);
  });

  it('enables all notification type settings by default', () => {
    const dto = getDefaultNotificationPreferences('u1');
    expect(dto.newMessageEnabled).toBe(true);
    expect(dto.missedCallEnabled).toBe(true);
    expect(dto.systemEnabled).toBe(true);
    expect(dto.conversationEnabled).toBe(true);
    expect(dto.replyEnabled).toBe(true);
    expect(dto.mentionEnabled).toBe(true);
    expect(dto.reactionEnabled).toBe(true);
    expect(dto.contactRequestEnabled).toBe(true);
    expect(dto.memberJoinedEnabled).toBe(true);
  });

  it('disables DND by default', () => {
    const dto = getDefaultNotificationPreferences('u1');
    expect(dto.dndEnabled).toBe(false);
  });
});
