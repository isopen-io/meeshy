/**
 * buildPushHeader pure helper tests
 *
 * Verifies that the gateway constructs the APN/FCM push title and subtitle
 * in a way that:
 *  - keeps the title focused on the sender (so iOS Communication Notifications
 *    `INSendMessageIntent` rewriting doesn't clobber the conversation name),
 *  - exposes the conversation name as a separate `subtitle` field for
 *    group/global chats, which iOS renders natively between title and body.
 *
 * Regression guard for the bug where the gateway concatenated
 * "<sender> | <conv>" into the title — iOS systematically dropped the second
 * half once Communication Intent donation kicked in.
 *
 * @jest-environment node
 */

import { buildPushHeader } from '../../../../services/notifications/NotificationService';

describe('buildPushHeader', () => {
  it('builds {title=sender, subtitle=conv} for a global conversation message', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'meeshy', displayName: 'meeshy sama' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result).toEqual({ title: 'meeshy sama', subtitle: 'Meeshy Global' });
  });

  it('builds {title=sender, subtitle=conv} for a group conversation message', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice Martin' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
    });
    expect(result).toEqual({ title: 'Alice Martin', subtitle: 'Équipe Dev' });
  });

  it('omits subtitle for direct messages (1-on-1)', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice Martin' },
      context: { conversationType: 'direct', conversationTitle: 'Alice & Bob' },
    });
    expect(result).toEqual({ title: 'Alice Martin', subtitle: undefined });
  });

  it('omits subtitle when conversationType is missing', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('omits subtitle for non-message notification types (reactions, mentions...)', () => {
    const reactionResult = buildPushHeader({
      type: 'message_reaction',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: 'Équipe Dev' },
    });
    expect(reactionResult.subtitle).toBeUndefined();

    const mentionResult = buildPushHeader({
      type: 'user_mentioned',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(mentionResult.subtitle).toBeUndefined();
  });

  it('honours an explicit customTitle override (e.g. security alerts)', () => {
    const result = buildPushHeader({
      type: 'login_new_device',
      customTitle: 'New login detected',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: {},
    });
    expect(result.title).toBe('New login detected');
  });

  it('falls back to actor.username when displayName is empty', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: '' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).toBe('alice');
    expect(result.subtitle).toBe('Meeshy Global');
  });

  it('falls back to "Meeshy" when no actor is provided', () => {
    const result = buildPushHeader({
      type: 'new_message',
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).toBe('Meeshy');
  });

  it('omits subtitle when conversationTitle is empty even for groups', () => {
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'alice', displayName: 'Alice' },
      context: { conversationType: 'group', conversationTitle: '' },
    });
    expect(result.subtitle).toBeUndefined();
  });

  it('never concatenates sender and conversation into the title (regression)', () => {
    // The previous bug used "<sender> | <conv>" which iOS Communication
    // Notifications systematically clobbered. The title must remain a pure
    // sender name so it survives intent donation; subtitle carries the group.
    const result = buildPushHeader({
      type: 'new_message',
      actor: { id: 'u1', username: 'meeshy', displayName: 'meeshy sama' },
      context: { conversationType: 'global', conversationTitle: 'Meeshy Global' },
    });
    expect(result.title).not.toContain('|');
    expect(result.title).not.toContain('Meeshy Global');
  });
});
