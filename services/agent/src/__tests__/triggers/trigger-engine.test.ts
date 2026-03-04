import { TriggerEngine } from '../../triggers/trigger-engine';

describe('TriggerEngine', () => {
  it('fires user_message trigger when sender matches', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-boss', replyToId: undefined });
    expect(fired).toContain('user_message');
  });

  it('does not fire when sender does not match', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-other', replyToId: undefined });
    expect(fired).toHaveLength(0);
  });

  it('fires reply_to trigger', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: false,
      triggerFromUserIds: [],
      triggerOnReplyTo: true,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm2', senderId: 'user1', replyToId: 'm1' });
    expect(fired).toContain('reply_to');
  });

  it('respects cooldown', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 9999,
    }, async (ctx) => { fired.push(ctx.type); });

    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-boss', replyToId: undefined });
    await engine.onMessage('conv1', { messageId: 'm2', senderId: 'user-boss', replyToId: undefined });
    expect(fired).toHaveLength(1);
  });

  it('ignores unregistered conversations', async () => {
    const engine = new TriggerEngine();
    await engine.onMessage('unknown', { messageId: 'm1', senderId: 'user1', replyToId: undefined });
    // Should not throw
  });

  it('unregisters conversations', async () => {
    const engine = new TriggerEngine();
    const fired: string[] = [];

    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: false,
      timeoutSeconds: 300,
      triggerOnUserMessage: true,
      triggerFromUserIds: ['user-boss'],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async (ctx) => { fired.push(ctx.type); });

    engine.unregisterConversation('conv1');
    await engine.onMessage('conv1', { messageId: 'm1', senderId: 'user-boss', replyToId: undefined });
    expect(fired).toHaveLength(0);
  });

  it('clearAll clears all conversations', () => {
    const engine = new TriggerEngine();
    engine.registerConversation({
      conversationId: 'conv1',
      triggerOnTimeout: true,
      timeoutSeconds: 300,
      triggerOnUserMessage: false,
      triggerFromUserIds: [],
      triggerOnReplyTo: false,
      cooldownSeconds: 60,
    }, async () => {});

    engine.clearAll();
    // Should not throw, internals should be cleared
  });
});
