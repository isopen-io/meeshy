import type { ConversationState, PendingAction, PendingMessage, AgentHistoryEntry } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

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

    const pastContents = new Set(
      (state.agentHistory ?? []).map((h) => h.contentHash),
    );

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

      if (pastContents.has(contentKey)) {
        console.warn(`[QualityGate] Content too similar to past agent message, skipping`);
        continue;
      }

      const expectedLanguage = msg.originalLanguage || state.controlledUsers.find((u) => u.userId === userId)?.systemLanguage || 'fr';

      const checkPrompt = `Verifie cette reponse pour coherence avec le profil.

Profil attendu:
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur: ${profile.typicalLength}
- Langue attendue: ${expectedLanguage}

Reponse a verifier: "${msg.content}"

Retourne un JSON: { "coherent": boolean, "score": 0-1, "correctLanguage": boolean, "reason": "..." }`;

      try {
        const response = await llm.chat({
          messages: [{ role: 'user', content: checkPrompt }],
          temperature: 0.1,
          maxTokens: 128,
        });

        const result = parseJsonLlm<{ coherent: boolean; score: number; correctLanguage?: boolean; reason: string }>(response.content);

        if (result.correctLanguage === false) {
          console.warn(`[QualityGate] Wrong language for user ${userId} (expected ${expectedLanguage}): ${result.reason}`);
          continue;
        }

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

    const newHistory: AgentHistoryEntry[] = validatedMessages
      .filter((a): a is PendingMessage => a.type === 'message')
      .map((a) => ({
        userId: a.asUserId,
        topic: a.content.slice(0, 50),
        contentHash: a.content.toLowerCase().trim().slice(0, 100),
        timestamp: Date.now(),
      }));

    return { pendingActions: [...validatedMessages, ...reactions], agentHistory: newHistory };
  };
}
