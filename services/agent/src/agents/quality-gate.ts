import type { ConversationState, PendingAction, PendingMessage, AgentHistoryEntry } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

const AI_REVEAL_PATTERNS = [
  /en tant qu['']ia/i,
  /je suis un(e)? (agent|bot|ia|intelligence artificielle|assistant ia)/i,
  /as an ai/i,
  /i am an ai/i,
  /i'm an ai/i,
  /comme ia je/i,
  /en tant qu['']assistant ia/i,
];

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function runDeterministicChecks(
  content: string,
  minWords: number,
  maxWords: number,
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

    const minWords = state.minWordsPerMessage ?? 3;
    const maxWords = state.maxWordsPerMessage ?? 400;
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

      const deterministicResult = runDeterministicChecks(msg.content, minWords, maxWords);
      if (!deterministicResult.ok) {
        console.warn(`[QualityGate] Deterministic check failed for user ${userId}: ${deterministicResult.reason}`);
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
            maxTokens: 128,
          });

          const result = parseJsonLlm<{ coherent: boolean; score: number; correctLanguage?: boolean; reason: string }>(response.content);

          if (result.correctLanguage === false) {
            console.warn(`[QualityGate] Wrong language for user ${userId} (expected ${expectedLanguage}): ${result.reason}`);
            continue;
          }

          if (result.score < minScore) {
            console.warn(`[QualityGate] Low score (${result.score}) for user ${userId}: ${result.reason}`);
            continue;
          }
        } catch (error) {
          console.error(`[QualityGate] Error validating message for ${userId}:`, error);
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
        topic: a.content.slice(0, 50),
        contentHash: a.content.toLowerCase().trim().slice(0, 100),
        timestamp: Date.now(),
      }));

    return { pendingActions: [...validatedMessages, ...reactions], agentHistory: newHistory };
  };
}
