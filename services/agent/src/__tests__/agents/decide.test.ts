import { createDecideNode } from '../../agents/decide';

describe('Decision Node', () => {
  it('skips when no controlled users', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'timeout' },
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    expect(result.decision).toBe('skip');
  });

  it('selects animate when controlled users exist with matching trigger', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: {
          topicsOfExpertise: ['tech'],
          responseTriggers: ['question'],
          silenceTriggers: [],
          confidence: 0.8,
        },
      }],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Question technique ?', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'user_message', triggeredByUserId: 'user1' },
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    expect(result.decision).toBe('animate');
    expect(result.selectedUserId).toBe('bot1');
  });

  it('skips when no trigger context', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: { topicsOfExpertise: [], responseTriggers: [], silenceTriggers: [], confidence: 0.5 },
      }],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: null,
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    expect(result.decision).toBe('skip');
  });

  it('skips when last message is from a controlled user', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: { topicsOfExpertise: [], responseTriggers: [], silenceTriggers: [], confidence: 0.5 },
      }],
      messages: [{ id: 'm1', senderId: 'bot1', senderName: 'Bot', content: 'Hello', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'user_message' },
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    expect(result.decision).toBe('skip');
  });

  it('skips when silence triggers match', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: { topicsOfExpertise: ['tech'], responseTriggers: ['question'], silenceTriggers: ['conflit'], confidence: 0.8 },
      }],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Il y a un conflit ici', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'user_message', triggeredByUserId: 'user1' },
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    expect(result.decision).toBe('skip');
  });

  it('boosts score for reply_to trigger type', async () => {
    const decide = createDecideNode();
    const result = await decide({
      controlledUsers: [{
        userId: 'bot1',
        displayName: 'Bot',
        source: 'manual',
        role: { topicsOfExpertise: [], responseTriggers: [], silenceTriggers: [], confidence: 0.8, relationshipMap: {} },
      }],
      messages: [{ id: 'm1', senderId: 'user1', senderName: 'Alice', content: 'Hello', timestamp: Date.now() }],
      toneProfiles: {},
      triggerContext: { type: 'reply_to', triggeredByMessageId: 'm0' },
      contextWindowSize: 50,
      agentType: 'personal',
      useFullHistory: false,
    } as any);
    // reply_to gives +0.3, confidence 0.8*0.2=0.16, total = 0.46 > 0.3
    expect(result.decision).toBe('animate');
  });
});
