import type { ConversationState, PendingAction, PendingMessage } from '../graph/state';
import type { LlmProvider } from '../llm/types';

export function createQualityGateNode(llm: LlmProvider) {
  return async function qualityGate(state: ConversationState) {
    const actions = state.pendingActions;
    if (actions.length === 0) return { pendingActions: [] };

    const messages = actions.filter((a): a is PendingMessage => a.type === 'message');
    const reactions = actions.filter((a) => a.type === 'reaction');

    if (messages.length === 0) {
      return { pendingActions: reactions };
    }

    const validatedMessages: PendingAction[] = [];
    const seenContents = new Set<string>();

    for (const msg of messages) {
      const userId = msg.asUserId;
      const profile = state.controlledUsers.find((u) => u.userId === userId)?.role;

      if (!profile) {
        console.warn(`[QualityGate] No profile found for user ${userId}, skipping`);
        continue;
      }

      const contentKey = msg.content.toLowerCase().trim().slice(0, 100);
      if (seenContents.has(contentKey)) {
        console.warn(`[QualityGate] Duplicate content detected, skipping`);
        continue;
      }

      const checkPrompt = `Verifie cette reponse pour coherence avec le profil.

Profil attendu:
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur: ${profile.typicalLength}

Reponse a verifier: "${msg.content}"

Retourne un JSON: { "coherent": boolean, "score": 0-1, "reason": "..." }`;

      try {
        const response = await llm.chat({
          messages: [{ role: 'user', content: checkPrompt }],
          temperature: 0.1,
          maxTokens: 128,
        });

        const result = JSON.parse(response.content);

        if (result.score < 0.5) {
          console.warn(`[QualityGate] Low score (${result.score}) for user ${userId}: ${result.reason}`);
          continue;
        }

        seenContents.add(contentKey);
        validatedMessages.push(msg);
      } catch (error) {
        console.error(`[QualityGate] Error validating message for ${userId}:`, error);
        continue;
      }
    }

    console.log(`[QualityGate] Validated ${validatedMessages.length}/${messages.length} messages, ${reactions.length} reactions pass-through`);

    return { pendingActions: [...validatedMessages, ...reactions] };
  };
}
