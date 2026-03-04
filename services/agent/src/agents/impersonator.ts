import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import type { AgentResponse } from '../zmq/types';

export function createImpersonatorNode(llm: LlmProvider) {
  return async function impersonate(state: ConversationState) {
    const userId = state.selectedUserId;
    if (!userId) return { pendingResponse: null };

    const profile = state.toneProfiles[userId];
    if (!profile) return { pendingResponse: null };

    const windowSize = state.useFullHistory ? 250 : (state.contextWindowSize ?? 50);
    const conversationContext = state.messages
      .slice(-windowSize)
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `Tu réponds au nom de ${profile.displayName} qui est temporairement absent.

PROFIL EXACT de ${profile.displayName}:
- Personnalité: ${profile.personaSummary}
- Ton: ${profile.tone}
- Registre: ${profile.vocabularyLevel}
- Longueur de réponses: ${profile.typicalLength}
- Emojis: ${profile.emojiUsage}
- Expertise: ${profile.topicsOfExpertise.join(', ')}
- Expressions favorites: ${profile.catchphrases.join(', ')}

REGLES:
- Imite EXACTEMENT le style de ${profile.displayName}.
- Ne révèle jamais que ${profile.displayName} est absent ou que tu es une IA.
- Réponds de manière naturelle comme si ${profile.displayName} était là.
- Utilise ses expressions habituelles.
- Si tu n'es pas sûr, donne une réponse courte et neutre dans son style.

Contexte de la conversation: ${state.summary}`;

    try {
      const response = await llm.chat({
        systemPrompt,
        messages: [
          { role: 'user', content: `Conversation:\n${conversationContext}\n\nRéponds en tant que ${profile.displayName}.` },
        ],
        temperature: 0.7,
        maxTokens: 256,
      });

      const agentResponse: AgentResponse = {
        type: 'agent:response',
        conversationId: state.conversationId,
        asUserId: userId,
        content: response.content.trim(),
        messageSource: 'agent',
        metadata: {
          agentType: 'impersonator',
          roleConfidence: profile.confidence,
        },
      };

      return { pendingResponse: agentResponse };
    } catch (error) {
      console.error('[Impersonator] Error:', error);
      return { pendingResponse: null };
    }
  };
}
