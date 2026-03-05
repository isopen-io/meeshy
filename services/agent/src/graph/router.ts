import type { ConversationState } from './state';

export function routeDecision(state: ConversationState): 'impersonate' | 'animate' | 'skip' {
  return state.decision;
}

export function routeQualityGate(state: ConversationState): 'send' | 'regenerate' {
  if (!state.pendingResponse) return 'regenerate';
  const confidence = state.pendingResponse.metadata.roleConfidence;
  if (confidence < 0.5) return 'regenerate';
  return 'send';
}
