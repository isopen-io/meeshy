import type { ConversationState, InterventionPlan, InterventionDirective } from '../graph/state';
import type { LlmProvider } from '../llm/types';
import { parseJsonLlm } from '../utils/parse-json-llm';

const STRATEGIST_SYSTEM_PROMPT = `Tu es l'orchestrateur d'une communaute de messagerie. Analyse cette conversation et decide quelles interventions sont naturelles.

CONTEXTE:
- Messages recents: {messages}
- Utilisateurs inactifs disponibles: {inactiveUsers}
- Score d'activite conversation: {activityScore} (0 = morte, 1 = tres active)
- Participants actuels: {participants}

CONTEXTE DE LA CONVERSATION:
- Titre: {conversationTitle}
- Description: {conversationDescription}
{agentInstructions}

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
8. Pour chaque intervention "message", indique "needsWebSearch": true/false
   - true si le sujet requiert des informations actuelles ou factuelles
   - false pour conversation sociale, opinions, sujets generaux

HISTORIQUE DES INTERVENTIONS RECENTES (NE PAS REPETER):
{agentHistory}

REGLES ANTI-REPETITION:
- Ne propose JAMAIS un sujet deja aborde dans l'historique
- Varie les utilisateurs qui interviennent
- Si aucun sujet frais n'est disponible, retourne shouldIntervene: false
- Favorise les reactions aux messages recents plutot que de nouveaux messages generiques
- Maximum 1 intervention par utilisateur si la conversation est peu active

BUDGET QUOTIDIEN:
- Il reste {budgetRemaining} messages autorise(s) aujourd'hui pour cette conversation
- {todayUsersActive} utilisateurs ont deja parle aujourd'hui (max: {maxUsersToday})
- NE DEPASSE PAS le budget restant ({budgetRemaining} messages max)
- Favorise les utilisateurs qui n'ont PAS encore parle aujourd'hui

ROTATION UTILISATEURS:
- Poids 3x pour les utilisateurs qui n'ont pas parle aujourd'hui
- Les utilisateurs dont les messages ont recu des reactions parlent {reactionBoostFactor}x plus souvent
- Si un utilisateur est @mentionne dans un message recent: il DOIT intervenir (priorite absolue)
- Si un message recent est une reponse a un message d'un utilisateur inactif: il DOIT reagir

MODE BURST (si actif):
- Genere exactement {burstSize} interventions avec des delais courts (30-180s entre chaque)
- Les interventions doivent former un echange naturel (question/reponse, reactions)
- Utilise au moins 2 utilisateurs differents dans le burst

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
      "delaySeconds": number,
      "needsWebSearch": boolean
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

  const participantsText = recentMessages
    .filter((m, i, arr) => arr.findIndex((a) => a.senderId === m.senderId) === i)
    .map((m) => `@${m.senderUsername ?? m.senderName} (${m.senderId})`)
    .join(', ');

  const effectiveMaxReactions = reactionsEnabled ? maxReactions : 0;

  const historyText = (state.agentHistory ?? [])
    .slice(-20)
    .map((h) => `- ${h.userId}: "${h.topic}" (il y a ${Math.round((Date.now() - h.timestamp) / 60000)}min)`)
    .join('\n') || 'Aucune intervention recente.';

  const instructionsText = state.agentInstructions
    ? `INSTRUCTIONS SPECIFIQUES: ${state.agentInstructions}`
    : '';

  return STRATEGIST_SYSTEM_PROMPT
    .replace('{messages}', messagesText)
    .replace('{inactiveUsers}', inactiveUsersText)
    .replace('{activityScore}', String(state.activityScore))
    .replace('{participants}', participantsText)
    .replace('{conversationTitle}', state.conversationTitle || 'Sans titre')
    .replace('{conversationDescription}', state.conversationDescription || 'Aucune')
    .replace('{agentInstructions}', instructionsText)
    .replace('{minResponses}', String(minResponses))
    .replace('{maxResponses}', String(maxResponses + effectiveMaxReactions))
    .replace('{agentHistory}', historyText)
    .replace(/\{budgetRemaining\}/g, String(state.budgetRemaining))
    .replace('{todayUsersActive}', String(state.todayUsersActive))
    .replace('{maxUsersToday}', String(state.maxUsersToday))
    .replace('{reactionBoostFactor}', String(state.reactionBoostFactor))
    .replace(/\{burstSize\}/g, String(state.burstSize));
}

function validateInterventions(interventions: unknown[], controlledUserIds: Set<string>, messageIds: Set<string>, maxMessages: number, maxReactions: number): InterventionDirective[] {
  const validated: InterventionDirective[] = [];
  let messageCount = 0;
  let reactionCount = 0;
  const userActionCounts = new Map<string, number>();

  for (const raw of interventions) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) continue;
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
        needsWebSearch: Boolean(item.needsWebSearch),
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

    if (state.budgetRemaining <= 0) {
      return {
        interventionPlan: { shouldIntervene: false, reason: 'Daily budget exhausted', interventions: [] } satisfies InterventionPlan,
      };
    }

    const minResponses = state.minResponsesPerCycle;
    const maxResponses = state.maxResponsesPerCycle;
    const maxReactions = state.maxReactionsPerCycle;
    const reactionsEnabled = state.reactionsEnabled;

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

      const parsed = parseJsonLlm<{ shouldIntervene: boolean; reason?: string; interventions?: unknown[] }>(response.content);

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

      const effectiveMaxMessages = Math.min(maxResponses, state.budgetRemaining);

      const validatedInterventions = validateInterventions(
        parsed.interventions ?? [],
        controlledUserIds,
        messageIds,
        effectiveMaxMessages,
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
