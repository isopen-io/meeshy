import type { ConversationState, InterventionPlan, InterventionDirective } from '../graph/state';
import type { LlmProvider } from '../llm/types';

const STRATEGIST_SYSTEM_PROMPT = `Tu es l'orchestrateur d'une communaute de messagerie. Analyse cette conversation et decide quelles interventions sont naturelles.

CONTEXTE:
- Messages recents: {messages}
- Utilisateurs inactifs disponibles: {inactiveUsers}
- Score d'activite conversation: {activityScore} (0 = morte, 1 = tres active)
- Participants actuels: {participants}

DECIDE:
1. La conversation a-t-elle besoin d'activite ? (oui/non + raison)
2. Si oui, combien d'interventions ? (entre {minResponses} et {maxResponses})
3. Pour chaque intervention, specifie :
   - type: "message" ou "reaction"
   - Si message: asUserId, topic (sujet a aborder), replyToMessageId optionnel, mentionUsernames (liste @username)
   - Si reaction: asUserId, targetMessageId, emoji
   - delaySeconds: delai relatif pour echelonner (messages: 30-180s, reactions: 5-30s)
4. Les interventions doivent etre NATURELLES et VARIEES
5. Ne fais PAS intervenir le meme utilisateur plus de 2 fois
6. Les reactions doivent utiliser des emojis courants et pertinents au message cible
7. Choisis les utilisateurs dont le profil colle au sujet de conversation

IMPORTANT:
- Analyse semantique pure. Fonctionne en TOUTES langues.
- Ne reponds PAS si l'activite est deja suffisante (score > 0.7)
- Varie les types d'interventions (mix messages + reactions)

REPONSE JSON STRICTE (aucun texte autour):
{
  "shouldIntervene": boolean,
  "reason": "string",
  "interventions": [
    {
      "type": "message",
      "asUserId": "string",
      "topic": "string",
      "replyToMessageId": "string | null",
      "mentionUsernames": ["string"],
      "delaySeconds": number
    },
    {
      "type": "reaction",
      "asUserId": "string",
      "targetMessageId": "string",
      "emoji": "string",
      "delaySeconds": number
    }
  ]
}`;

function buildStrategistPrompt(state: ConversationState, minResponses: number, maxResponses: number, maxReactions: number, reactionsEnabled: boolean): string {
  const windowSize = state.useFullHistory ? 250 : (state.contextWindowSize ?? 50);
  const recentMessages = state.messages.slice(-windowSize);

  const messagesText = recentMessages
    .map((m) => `[${m.senderName} (${m.senderId})]: ${m.content} (id: ${m.id})`)
    .join('\n');

  const inactiveUsersText = state.controlledUsers
    .map((u) => {
      const p = u.role;
      return `- ${u.displayName} (id: ${u.userId}): ${p.personaSummary ?? 'aucun profil'}. Ton: ${p.tone}. Sujets: ${p.topicsOfExpertise.join(', ')}. Emojis frequents: ${p.commonEmojis?.join(', ') ?? 'aucun'}. Reactions habituelles: ${p.reactionPatterns?.join(', ') ?? 'aucun'}.`;
    })
    .join('\n');

  const participantIds = new Set(recentMessages.map((m) => m.senderId));
  const participantsText = recentMessages
    .filter((m, i, arr) => arr.findIndex((a) => a.senderId === m.senderId) === i)
    .map((m) => `@${m.senderName} (${m.senderId})`)
    .join(', ');

  const effectiveMaxResponses = reactionsEnabled
    ? maxResponses
    : maxResponses;
  const effectiveMaxReactions = reactionsEnabled ? maxReactions : 0;

  return STRATEGIST_SYSTEM_PROMPT
    .replace('{messages}', messagesText)
    .replace('{inactiveUsers}', inactiveUsersText)
    .replace('{activityScore}', String(state.activityScore))
    .replace('{participants}', participantsText)
    .replace('{minResponses}', String(minResponses))
    .replace('{maxResponses}', String(effectiveMaxResponses + effectiveMaxReactions));
}

function validateInterventions(interventions: unknown[], controlledUserIds: Set<string>, messageIds: Set<string>, maxMessages: number, maxReactions: number): InterventionDirective[] {
  const validated: InterventionDirective[] = [];
  let messageCount = 0;
  let reactionCount = 0;
  const userActionCounts = new Map<string, number>();

  for (const raw of interventions) {
    const item = raw as Record<string, unknown>;
    const userId = String(item.asUserId ?? '');

    if (!controlledUserIds.has(userId)) continue;

    const currentCount = userActionCounts.get(userId) ?? 0;
    if (currentCount >= 2) continue;

    if (item.type === 'message' && messageCount < maxMessages) {
      validated.push({
        type: 'message',
        asUserId: userId,
        topic: String(item.topic ?? ''),
        replyToMessageId: item.replyToMessageId ? String(item.replyToMessageId) : undefined,
        mentionUsernames: Array.isArray(item.mentionUsernames) ? item.mentionUsernames.map(String) : [],
        delaySeconds: Math.max(30, Math.min(180, Number(item.delaySeconds) || 60)),
      });
      messageCount++;
      userActionCounts.set(userId, currentCount + 1);
    } else if (item.type === 'reaction' && reactionCount < maxReactions) {
      const targetId = String(item.targetMessageId ?? '');
      if (!messageIds.has(targetId)) continue;

      validated.push({
        type: 'reaction',
        asUserId: userId,
        targetMessageId: targetId,
        emoji: String(item.emoji ?? '👍'),
        delaySeconds: Math.max(5, Math.min(30, Number(item.delaySeconds) || 10)),
      });
      reactionCount++;
      userActionCounts.set(userId, currentCount + 1);
    }
  }

  return validated;
}

export function createStrategistNode(llm: LlmProvider) {
  return async function strategist(state: ConversationState) {
    if (state.controlledUsers.length === 0) {
      return {
        interventionPlan: { shouldIntervene: false, reason: 'No controlled users available', interventions: [] } satisfies InterventionPlan,
      };
    }

    if (state.activityScore > 0.7) {
      return {
        interventionPlan: { shouldIntervene: false, reason: 'Conversation already active enough', interventions: [] } satisfies InterventionPlan,
      };
    }

    const minResponses = 2;
    const maxResponses = 12;
    const maxReactions = 8;
    const reactionsEnabled = true;

    const prompt = buildStrategistPrompt(state, minResponses, maxResponses, maxReactions, reactionsEnabled);

    try {
      const response = await llm.chat({
        systemPrompt: prompt,
        messages: [
          {
            role: 'user',
            content: `Analyse cette conversation et propose un plan d'intervention naturel. Score d'activite: ${state.activityScore}. Utilisateurs inactifs disponibles: ${state.controlledUsers.length}.`,
          },
        ],
        temperature: 0.7,
        maxTokens: 1024,
      });

      const parsed = JSON.parse(response.content);

      if (!parsed.shouldIntervene) {
        return {
          interventionPlan: {
            shouldIntervene: false,
            reason: parsed.reason ?? 'LLM decided no intervention needed',
            interventions: [],
          } satisfies InterventionPlan,
        };
      }

      const controlledUserIds = new Set(state.controlledUsers.map((u) => u.userId));
      const messageIds = new Set(state.messages.map((m) => m.id));

      const validatedInterventions = validateInterventions(
        parsed.interventions ?? [],
        controlledUserIds,
        messageIds,
        maxResponses,
        reactionsEnabled ? maxReactions : 0,
      );

      return {
        interventionPlan: {
          shouldIntervene: validatedInterventions.length > 0,
          reason: parsed.reason ?? '',
          interventions: validatedInterventions,
        } satisfies InterventionPlan,
      };
    } catch (error) {
      console.error('[Strategist] Error:', error);
      return {
        interventionPlan: { shouldIntervene: false, reason: 'Strategist error', interventions: [] } satisfies InterventionPlan,
      };
    }
  };
}
