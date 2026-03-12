import { useConversationStore } from '../conversation-store';

describe('ConversationStore - Dead code removal', () => {
  it('should NOT have addOptimisticMessage method', () => {
    const state = useConversationStore.getState();
    expect(state).not.toHaveProperty('addOptimisticMessage');
  });

  it('should NOT have replaceOptimisticMessage method', () => {
    const state = useConversationStore.getState();
    expect(state).not.toHaveProperty('replaceOptimisticMessage');
  });

  it('should NOT have markMessageFailed method', () => {
    const state = useConversationStore.getState();
    expect(state).not.toHaveProperty('markMessageFailed');
  });

  it('should NOT have removeOptimisticMessage method', () => {
    const state = useConversationStore.getState();
    expect(state).not.toHaveProperty('removeOptimisticMessage');
  });

  it('should still have core message methods', () => {
    const state = useConversationStore.getState();
    expect(state).toHaveProperty('addMessage');
    expect(state).toHaveProperty('updateMessage');
    expect(state).toHaveProperty('deleteMessage');
    expect(state).toHaveProperty('clearMessages');
    expect(state).toHaveProperty('loadMessages');
  });

  it('should still have conversation methods', () => {
    const state = useConversationStore.getState();
    expect(state).toHaveProperty('loadConversations');
    expect(state).toHaveProperty('selectConversation');
    expect(state).toHaveProperty('addConversation');
    expect(state).toHaveProperty('updateConversation');
    expect(state).toHaveProperty('removeConversation');
  });
});
