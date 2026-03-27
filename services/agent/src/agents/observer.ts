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

IMPORTANT: Retourne les valeurs de champ TOUJOURS en francais (familier/courant/soutenu, court/moyen/long, jamais/occasionnel/abondant), quelle que soit la langue de la conversation.
Retourne UNIQUEMENT du JSON valide, aucun texte autour.`;

function mergeStringArrays(incoming: unknown, existing: string[] | undefined): string[] {
  const incomingArr = Array.isArray(incoming) ? incoming.filter((s): s is string => typeof s === 'string') : [];
  const existingArr = existing ?? [];
  if (incomingArr.length === 0) return existingArr;
  return [...new Set([...existingArr, ...incomingArr])];
}

function safeString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

const CONFIDENCE_DECAY = 0.005;
const MAX_LOCK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createObserverNode(llm: LlmProvider) {
  return async function observe(state: ConversationState) {
    if (state.messages.length === 0) return {};

    const participantIds = new Set(state.messages.map((m) => m.senderId));

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

      let parsed: { summary?: string; overallTone?: string; profiles?: Record<string, unknown> };
      try {
        parsed = parseJsonLlm<typeof parsed>(response.content);
      } catch {
        console.warn('[Observer] Failed to parse LLM response, preserving existing state');
        return { summary: state.summary };
      }

      const updatedProfiles: Record<string, ToneProfile> = { ...state.toneProfiles };

      if (parsed.profiles) {
        for (const [userId, profile] of Object.entries(parsed.profiles)) {
          if (!participantIds.has(userId)) continue;

          const existing = updatedProfiles[userId];
          const p = profile as Record<string, unknown>;

          const controlledUser = state.controlledUsers.find((u) => u.userId === userId);
          const preservedOrigin = controlledUser?.role.origin ?? existing?.origin ?? 'observed';

          if (existing?.locked) {
            if (existing.confidence > 0) {
              updatedProfiles[userId] = {
                ...existing,
                confidence: Math.max(0.5, existing.confidence - CONFIDENCE_DECAY),
                locked: existing.confidence - CONFIDENCE_DECAY > 0.5,
              };
            }
            continue;
          }

          const lastAnalyzedId = (existing as any)?._lastAnalyzedMessageId as string | undefined;
          const newMessages = lastAnalyzedId
            ? state.messages.filter((m) => m.senderId === userId && m.id > lastAnalyzedId)
            : state.messages.filter((m) => m.senderId === userId);
          const newCount = newMessages.length;
          const messagesAnalyzed = (existing?.messagesAnalyzed ?? 0) + newCount;
          const latestMessageId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : lastAnalyzedId;

          updatedProfiles[userId] = {
            userId,
            displayName: state.messages.find((m) => m.senderId === userId)?.senderName ?? existing?.displayName ?? userId,
            origin: preservedOrigin,
            archetypeId: existing?.archetypeId,
            personaSummary: safeString(p.personaSummary, existing?.personaSummary ?? ''),
            tone: safeString(p.tone, existing?.tone ?? 'neutre'),
            vocabularyLevel: safeString(p.vocabularyLevel, existing?.vocabularyLevel ?? 'courant'),
            typicalLength: safeString(p.typicalLength, existing?.typicalLength ?? 'moyen'),
            emojiUsage: safeString(p.emojiUsage, existing?.emojiUsage ?? 'occasionnel'),
            topicsOfExpertise: mergeStringArrays(p.topicsOfExpertise, existing?.topicsOfExpertise).slice(-10),
            topicsAvoided: mergeStringArrays(p.topicsAvoided, existing?.topicsAvoided).slice(-10),
            relationshipMap: existing?.relationshipMap ?? {},
            catchphrases: mergeStringArrays(p.catchphrases, existing?.catchphrases),
            responseTriggers: mergeStringArrays(p.responseTriggers, existing?.responseTriggers),
            silenceTriggers: mergeStringArrays(p.silenceTriggers, existing?.silenceTriggers),
            commonEmojis: mergeStringArrays(p.commonEmojis, existing?.commonEmojis),
            reactionPatterns: mergeStringArrays(p.reactionPatterns, existing?.reactionPatterns),
            messagesAnalyzed,
            confidence: Math.min(messagesAnalyzed / 50, 1.0),
            locked: messagesAnalyzed >= 50,
            _lastAnalyzedMessageId: latestMessageId,
          } as ToneProfile & { _lastAnalyzedMessageId?: string };
        }
      }

      return {
        summary: parsed.summary ?? state.summary,
        toneProfiles: updatedProfiles,
      };
    } catch (error) {
      console.error('[Observer] Error analyzing conversation:', error);
      return { summary: state.summary };
    }
  };
}
