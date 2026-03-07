import type { ConversationState, ToneProfile } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

const OBSERVER_SYSTEM_PROMPT = `Tu es un analyste conversationnel. Analyse la conversation et retourne un JSON avec:
1. "summary": un resume concis de la conversation (max 200 mots)
2. "overallTone": le ton general (ex: "professionnel", "decontracte", "tendu")
3. "profiles": un objet avec chaque userId comme cle et un profil contenant:
   - "tone": le ton de cet utilisateur
   - "vocabularyLevel": "familier" | "courant" | "soutenu"
   - "typicalLength": "court" | "moyen" | "long"
   - "emojiUsage": "jamais" | "occasionnel" | "abondant"
   - "topicsOfExpertise": liste de sujets sur lesquels il intervient
   - "catchphrases": expressions recurrentes
   - "responseTriggers": types de messages qui le font reagir
   - "silenceTriggers": types de messages qu'il ignore
   - "commonEmojis": emojis frequemment utilises dans ses messages (liste de strings)
   - "reactionPatterns": emojis qu'il utilise typiquement en reaction (liste de strings)
   - "personaSummary": resume court de sa personnalite

Retourne UNIQUEMENT du JSON valide, aucun texte autour.`;

export function createObserverNode(llm: LlmProvider) {
  return async function observe(state: ConversationState) {
    if (state.messages.length === 0) return state;

    const conversationText = state.messages
      .map((m) => `[${m.senderName}]: ${m.content}`)
      .join('\n');

    const contextPrompt = state.summary
      ? `Resume precedent: ${state.summary}\n\nNouveaux messages:\n${conversationText}`
      : conversationText;

    try {
      const response = await llm.chat({
        systemPrompt: OBSERVER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: contextPrompt }],
        temperature: 0.3,
        maxTokens: 1024,
      });

      const parsed = parseJsonLlm<{ summary?: string; overallTone?: string; profiles?: Record<string, unknown> }>(response.content);

      const updatedProfiles: Record<string, ToneProfile> = { ...state.toneProfiles };

      if (parsed.profiles) {
        for (const [userId, profile] of Object.entries(parsed.profiles)) {
          const existing = updatedProfiles[userId];
          const p = profile as Record<string, unknown>;

          if (existing?.locked) continue;

          const messagesAnalyzed = (existing?.messagesAnalyzed ?? 0) +
            state.messages.filter((m) => m.senderId === userId).length;

          updatedProfiles[userId] = {
            userId,
            displayName: state.messages.find((m) => m.senderId === userId)?.senderName ?? userId,
            origin: existing?.origin ?? 'observed',
            archetypeId: existing?.archetypeId,
            personaSummary: (p.personaSummary as string) ?? existing?.personaSummary ?? '',
            tone: (p.tone as string) ?? existing?.tone ?? 'neutre',
            vocabularyLevel: (p.vocabularyLevel as string) ?? existing?.vocabularyLevel ?? 'courant',
            typicalLength: (p.typicalLength as string) ?? existing?.typicalLength ?? 'moyen',
            emojiUsage: (p.emojiUsage as string) ?? existing?.emojiUsage ?? 'occasionnel',
            topicsOfExpertise: (p.topicsOfExpertise as string[]) ?? existing?.topicsOfExpertise ?? [],
            topicsAvoided: (p.topicsAvoided as string[]) ?? existing?.topicsAvoided ?? [],
            relationshipMap: existing?.relationshipMap ?? {},
            catchphrases: (p.catchphrases as string[]) ?? existing?.catchphrases ?? [],
            responseTriggers: (p.responseTriggers as string[]) ?? existing?.responseTriggers ?? [],
            silenceTriggers: (p.silenceTriggers as string[]) ?? existing?.silenceTriggers ?? [],
            commonEmojis: (p.commonEmojis as string[]) ?? existing?.commonEmojis ?? [],
            reactionPatterns: (p.reactionPatterns as string[]) ?? existing?.reactionPatterns ?? [],
            messagesAnalyzed,
            confidence: Math.min(messagesAnalyzed / 50, 1.0),
            locked: messagesAnalyzed >= 50,
          };
        }
      }

      return {
        summary: parsed.summary ?? state.summary,
        toneProfiles: updatedProfiles,
      };
    } catch (error) {
      console.error('[Observer] Error analyzing conversation:', error);
      return {};
    }
  };
}
