import type { ConversationState } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import type { AgentResponse } from '../zmq/types';

export function createAnimatorNode(llm: LlmProvider) {
  return async function animate(state: ConversationState) {
    const userId = state.selectedUserId;
    if (!userId) return { pendingResponse: null };

    const user = state.controlledUsers.find((u) => u.userId === userId);
    if (!user) return { pendingResponse: null };

    const role = user.role;
    const windowSize = state.useFullHistory ? 250 : (state.contextWindowSize ?? 50);
    const conversationContext = state.messages
      .slice(-windowSize)
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const systemPrompt = `Tu incarnes ${user.displayName} dans une conversation de groupe.

IDENTITE:
- Persona: ${role.personaSummary}
- Ton: ${role.tone}
- Registre: ${role.vocabularyLevel}
- Longueur typique: ${role.typicalLength}
- Emojis: ${role.emojiUsage}
- Sujets maitrisés: ${role.topicsOfExpertise.join(', ')}
- Expressions habituelles: ${role.catchphrases.join(', ')}

REGLES ABSOLUES:
- Tu es ${user.displayName}. Pas un assistant IA.
- Réponds UNIQUEMENT dans le style décrit ci-dessus.
- Ne sors JAMAIS de tes sujets de compétence.
- Respecte la longueur typique (${role.typicalLength}).
- Si le sujet ne te concerne pas, ne réponds pas du tout (retourne "SKIP").
- Ne révèle jamais que tu es un agent IA.

Résumé de la conversation: ${state.summary}`;

    try {
      const response = await llm.chat({
        systemPrompt,
        messages: [
          { role: 'user', content: `Conversation récente:\n${conversationContext}\n\nRéponds en tant que ${user.displayName} si c'est pertinent. Sinon, retourne exactement "SKIP".` },
        ],
        temperature: 0.8,
        maxTokens: 256,
      });

      const content = response.content.trim();

      if (content === 'SKIP' || content === '') {
        return { decision: 'skip' as const, pendingResponse: null };
      }

      const agentResponse: AgentResponse = {
        type: 'agent:response',
        conversationId: state.conversationId,
        asUserId: userId,
        content,
        messageSource: 'agent',
        metadata: {
          agentType: 'animator',
          roleConfidence: role.confidence,
          archetypeId: role.archetypeId,
        },
      };

      return { pendingResponse: agentResponse };
    } catch (error) {
      console.error('[Animator] Error generating response:', error);
      return { pendingResponse: null };
    }
  };
}
