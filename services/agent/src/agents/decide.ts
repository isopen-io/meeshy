import type { ConversationState, ControlledUser } from '../graph/state';

export function createDecideNode() {
  return async function decide(state: ConversationState) {
    if (!state.controlledUsers || state.controlledUsers.length === 0) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    if (!state.triggerContext) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const lastMessage = state.messages[state.messages.length - 1];
    if (!lastMessage) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const controlledIds = new Set(state.controlledUsers.map((u) => u.userId));
    if (controlledIds.has(lastMessage.senderId)) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const scored = state.controlledUsers
      .map((user) => ({
        user,
        score: scoreRelevance(user, lastMessage, state),
      }))
      .filter((s) => s.score > 0.3)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return { decision: 'skip' as const, selectedUserId: null };
    }

    const selected = scored[0];
    return {
      decision: 'animate' as const,
      selectedUserId: selected.user.userId,
    };
  };
}

function scoreRelevance(
  user: ControlledUser,
  lastMessage: { senderId: string; content: string },
  state: ConversationState,
): number {
  const role = user.role;
  let score = 0;

  for (const trigger of role.silenceTriggers) {
    if (lastMessage.content.toLowerCase().includes(trigger.toLowerCase())) {
      return 0;
    }
  }

  for (const trigger of role.responseTriggers) {
    if (lastMessage.content.toLowerCase().includes(trigger.toLowerCase())) {
      score += 0.3;
    }
  }

  for (const topic of role.topicsOfExpertise) {
    if (lastMessage.content.toLowerCase().includes(topic.toLowerCase())) {
      score += 0.2;
    }
  }

  if (role.relationshipMap?.[lastMessage.senderId]) {
    score += 0.2;
  }

  score += role.confidence * 0.2;

  if (state.triggerContext?.type === 'reply_to') {
    score += 0.3;
  }

  return Math.min(score, 1.0);
}
