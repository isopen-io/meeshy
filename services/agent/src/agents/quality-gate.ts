import type { ConversationState, PendingAction, PendingMessage, AgentHistoryEntry } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';
import { getArchetype } from '@meeshy/shared/agent/archetypes';
import { contentHash } from '../utils/content-hash';

const STOP_WORDS = new Set([
  'alors', 'aussi', 'autre', 'avant', 'avoir', 'cette', 'comme', 'dans',
  'depuis', 'devrait', 'encore', 'entre', 'faire', 'leurs', 'mieux',
  'moins', 'notre', 'nous', 'parce', 'plus', 'point', 'pour', 'quand',
  'quel', 'quelle', 'sans', 'serait', 'sont', 'sous', 'suite', 'tous',
  'tout', 'toute', 'toutes', 'tres', 'votre', 'vous', 'vraiment',
  'about', 'after', 'because', 'before', 'being', 'between', 'could',
  'every', 'from', 'have', 'into', 'just', 'more', 'most', 'much',
  'other', 'over', 'should', 'some', 'still', 'such', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'very', 'what', 'when', 'where', 'which', 'while', 'will',
  'with', 'would', 'your',
]);

function extractSignificantWords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^\w\sàâäéèêëïîôùûüÿçæœ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .filter((w) => !STOP_WORDS.has(w));
}

function extractTopicSummary(content: string): string {
  const words = extractSignificantWords(content);
  if (words.length === 0) return content.slice(0, 50);
  return words.slice(0, 8).join(' ');
}

export const AI_REVEAL_PATTERNS = [
  /en tant qu['']ia/i,
  /je suis un(e)? (agent|bot|ia|intelligence artificielle|assistant ia)/i,
  /as an ai\b/i,
  /i am an ai\b/i,
  /i'm an ai\b/i,
  /comme ia je/i,
  /en tant qu['']assistant ia/i,
  /as a language model/i,
  /as an ai (assistant|model)/i,
  /i'm a (virtual assistant|chatbot)/i,
  /i'm designed to\b/i,
  /i'm trained to\b/i,
  /my programming (tells|says|requires)/i,
  /en tant que mod[eè]le/i,
  /como (una? )?inteligencia artificial/i,
  /als k[iü]nstliche intelligenz/i,
];

const GREETING_PATTERNS = [
  /^(bonjour|bonsoir|salut|hello|hey|hi|coucou|yo|wesh)\b/i,
  /^(bon(ne)?\s+(journee|soiree|matinee|nuit|aprem))\b/i,
  /^(good\s+(morning|afternoon|evening|night))\b/i,
  /^(comment\s+(ca|ça)\s+va|quoi\s+de\s+neuf|how('?s| is) it going)\b/i,
];

export function isGreeting(text: string): boolean {
  const trimmed = text.trim();
  return GREETING_PATTERNS.some((p) => p.test(trimmed));
}

export function hasRecentGreeting(history: AgentHistoryEntry[], windowMinutes: number): boolean {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  return history.some((h) => h.timestamp > cutoff && GREETING_PATTERNS.some((p) => p.test(h.topic)));
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function runDeterministicChecks(
  content: string,
  minWords: number,
  maxWords: number,
  contextMessages: { content: string }[],
): { ok: boolean; reason: string } {
  if (!content.trim()) {
    return { ok: false, reason: 'empty content' };
  }
  if (content.includes('@@')) {
    return { ok: false, reason: 'double @@ mention detected (malformed mention)' };
  }
  for (const pattern of AI_REVEAL_PATTERNS) {
    if (pattern.test(content)) {
      return { ok: false, reason: `AI identity revealed: matched ${pattern}` };
    }
  }
  const wordCount = countWords(content);
  if (wordCount < minWords) {
    return { ok: false, reason: `too short: ${wordCount} words < min ${minWords}` };
  }
  if (wordCount > maxWords) {
    return { ok: false, reason: `too long: ${wordCount} words > max ${maxWords}` };
  }

  // Check for similarity with the last 20 messages in context to avoid repetition/echoing
  const normalizedNew = content.toLowerCase().trim().replace(/[^\w\s]/g, '');
  for (const m of contextMessages.slice(-20)) {
    const normalizedOld = m.content.toLowerCase().trim().replace(/[^\w\s]/g, '');
    if (normalizedNew === normalizedOld || (normalizedNew.length > 20 && normalizedOld.includes(normalizedNew))) {
      return { ok: false, reason: 'content too similar to recent conversation context (repetition check)' };
    }
  }

  return { ok: true, reason: '' };
}

export function createQualityGateNode(llm: LlmProvider) {
  return async function qualityGate(state: ConversationState) {
    const actions = state.pendingActions;
    if (actions.length === 0) return { pendingActions: [] };

    const messages = actions.filter((a): a is PendingMessage => a.type === 'message');
    const reactions = actions.filter((a) => a.type === 'reaction');

    if (messages.length === 0) {
      return { pendingActions: reactions };
    }

    const globalMinWords = state.minWordsPerMessage ?? 3;
    const globalMaxWords = state.maxWordsPerMessage ?? 400;
    const qualityGateEnabled = state.qualityGateEnabled ?? true;
    const minScore = state.qualityGateMinScore ?? 0.5;

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

      const archetype = profile.archetypeId ? getArchetype(profile.archetypeId) : null;
      const effectiveMinWords = archetype?.minWords ?? globalMinWords;
      const effectiveMaxWords = archetype?.maxWords ?? globalMaxWords;

      const deterministicResult = runDeterministicChecks(
        msg.content,
        effectiveMinWords,
        effectiveMaxWords,
        state.messages,
      );
      if (!deterministicResult.ok) {
        console.warn(`[QualityGate] Deterministic check failed for user ${userId}: ${deterministicResult.reason}`);
        continue;
      }

      const contentKey = contentHash(msg.content);
      if (seenContents.has(contentKey)) {
        console.warn(`[QualityGate] Duplicate content detected, skipping`);
        continue;
      }

      if (pastContents.has(contentKey)) {
        console.warn(`[QualityGate] Content too similar to past agent message, skipping`);
        continue;
      }

      const significantWords = extractSignificantWords(msg.content);
      const recentTopicWords = (state.agentHistory ?? [])
        .slice(-20)
        .flatMap((h) => extractSignificantWords(h.topic));
      if (significantWords.length > 0 && recentTopicWords.length > 0) {
        const recentTopicSet = new Set(recentTopicWords);
        const overlap = significantWords.filter((w) => recentTopicSet.has(w));
        const overlapRatio = overlap.length / significantWords.length;
        if (overlapRatio > 0.5) {
          console.warn(`[QualityGate] Topic too similar to recent history (${Math.round(overlapRatio * 100)}% keyword overlap), skipping`);
          continue;
        }
      }

      if (isGreeting(msg.content) && hasRecentGreeting(state.agentHistory ?? [], 240)) {
        console.warn(`[QualityGate] Greeting blocked — recent greeting already in history (4h window)`);
        continue;
      }

      if (qualityGateEnabled) {
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
            maxTokens: 192,
          });

          let result: { coherent: boolean; score: number; correctLanguage?: boolean; reason: string };
          try {
            result = parseJsonLlm<typeof result>(response.content);
          } catch {
            console.warn(`[QualityGate] Failed to parse LLM response for ${userId}, allowing message through`);
            seenContents.add(contentKey);
            validatedMessages.push(msg);
            continue;
          }

          if (result.correctLanguage === false) {
            console.warn(`[QualityGate] Wrong language for user ${userId} (expected ${expectedLanguage}): ${result.reason}`);
            continue;
          }

          const score = Math.max(0, Math.min(1, result.score ?? 0));
          if (score < minScore) {
            console.warn(`[QualityGate] Low score (${score}) for user ${userId}: ${result.reason}`);
            continue;
          }
        } catch (error) {
          console.warn(`[QualityGate] LLM error for ${userId}, allowing message through:`, error instanceof Error ? error.message : 'unknown');
          seenContents.add(contentKey);
          validatedMessages.push(msg);
          continue;
        }
      }

      seenContents.add(contentKey);
      validatedMessages.push(msg);
    }

    console.log(`[QualityGate] Validated ${validatedMessages.length}/${messages.length} messages, ${reactions.length} reactions pass-through`);

    const newHistory: AgentHistoryEntry[] = validatedMessages
      .filter((a): a is PendingMessage => a.type === 'message')
      .map((a) => ({
        userId: a.asUserId,
        topic: extractTopicSummary(a.content),
        contentHash: contentHash(a.content),
        timestamp: Date.now(),
      }));

    return { pendingActions: [...validatedMessages, ...reactions], agentHistory: newHistory };
  };
}
