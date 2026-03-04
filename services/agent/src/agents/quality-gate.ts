import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';

export function createQualityGateNode(llm: LlmProvider) {
  return async function qualityGate(state: ConversationState) {
    if (!state.pendingResponse) {
      return { pendingResponse: null };
    }

    const userId = state.selectedUserId;
    const profile = userId ? state.toneProfiles[userId] : null;

    if (!profile) return state;

    const checkPrompt = `Vérifie cette réponse pour cohérence avec le profil.

Profil attendu:
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur: ${profile.typicalLength}

Réponse à vérifier: "${state.pendingResponse.content}"

Retourne un JSON: { "coherent": boolean, "score": 0-1, "reason": "..." }`;

    try {
      const response = await llm.chat({
        messages: [{ role: 'user', content: checkPrompt }],
        temperature: 0.1,
        maxTokens: 128,
      });

      const result = JSON.parse(response.content);

      if (result.score < 0.5) {
        console.warn(`[QualityGate] Low score (${result.score}): ${result.reason}`);
        return { pendingResponse: null };
      }

      return {
        pendingResponse: {
          ...state.pendingResponse,
          metadata: {
            ...state.pendingResponse.metadata,
            roleConfidence: result.score,
          },
        },
      };
    } catch (error) {
      console.error('[QualityGate] Error:', error);
      return state;
    }
  };
}
