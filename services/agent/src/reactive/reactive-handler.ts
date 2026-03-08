import type { LlmProvider } from '../llm/types';
import type { PendingMessage, MessageEntry, ControlledUser, AgentHistoryEntry } from '../graph/state';
import type { DeliveryQueue } from '../delivery/delivery-queue';
import { calculateResponseDelay } from './timing-calculator';
import type { InterpellationType } from './interpellation-detector';

type InterpellationInput = {
  conversationId: string;
  triggerMessage: MessageEntry;
  mentionedUserIds: string[];
  replyToUserId: string | undefined;
  targetUserIds: string[];
  interpellationType: InterpellationType;
};

type TriageResponse = {
  shouldRespond: boolean;
  reason?: string;
  responses?: Array<{
    asUserId: string;
    urgency: 'low' | 'medium' | 'high';
    isGreeting: boolean;
    needsElaboration: boolean;
    suggestedTopic: string;
  }>;
};

type GenerationResponse = {
  messages: Array<{
    asUserId: string;
    content: string;
    replyToId?: string;
    wordCount: number;
    isGreeting: boolean;
  }>;
};

type Persistence = {
  getControlledUsers(conversationId: string): Promise<ControlledUser[]>;
};

type StateManager = {
  getMessages(conversationId: string): Promise<MessageEntry[]>;
  getAgentHistory(conversationId: string): Promise<AgentHistoryEntry[]>;
  setAgentHistory(conversationId: string, history: AgentHistoryEntry[]): Promise<void>;
};

export class ReactiveHandler {
  constructor(
    private readonly llm: LlmProvider,
    private readonly persistence: Persistence,
    private readonly stateManager: StateManager,
    private readonly deliveryQueue: DeliveryQueue,
  ) {}

  async handleInterpellation(input: InterpellationInput): Promise<void> {
    try {
      const controlledUsers = await this.persistence.getControlledUsers(input.conversationId);
      if (controlledUsers.length === 0) return;

      const targetUsers = controlledUsers.filter((u) => input.targetUserIds.includes(u.userId));
      if (targetUsers.length === 0) return;

      const messages = await this.stateManager.getMessages(input.conversationId);
      const recentMessages = messages.slice(-30);

      const triageResult = await this.callTriage(input, targetUsers, recentMessages, input.interpellationType);
      if (!triageResult.shouldRespond) return;

      const genResult = await this.callGeneration(input, targetUsers, recentMessages, triageResult);
      if (!genResult.messages || genResult.messages.length === 0) return;

      const actions: PendingMessage[] = genResult.messages.map((msg) => {
        const targetUser = targetUsers.find((u) => u.userId === msg.asUserId) ?? targetUsers[0];
        const lastAgentMessage = [...recentMessages].reverse().find((m) => m.senderId === msg.asUserId);
        const lastMessageAgoMs = lastAgentMessage
          ? Date.now() - lastAgentMessage.timestamp
          : 24 * 60 * 60 * 1000;

        const delayMs = calculateResponseDelay({
          interpellationType: input.interpellationType,
          wordCount: msg.wordCount || msg.content.split(/\s+/).length,
          lastUserMessageAgoMs: lastMessageAgoMs,
          unreadMessageCount: Math.min(recentMessages.length, 10),
        });

        return {
          type: 'message' as const,
          asUserId: msg.asUserId,
          content: msg.content,
          originalLanguage: targetUser.systemLanguage,
          replyToId: msg.replyToId,
          mentionedUsernames: [],
          delaySeconds: Math.round(delayMs / 1000),
          messageSource: 'agent' as const,
        };
      });

      for (const action of actions) {
        const scheduled = this.deliveryQueue.getScheduledForUser(input.conversationId, action.asUserId);
        if (scheduled.length > 0) {
          const reactiveDelay = action.delaySeconds;
          this.deliveryQueue.rescheduleForUser(
            input.conversationId,
            action.asUserId,
            reactiveDelay + 15,
          );
        }
      }

      this.deliveryQueue.enqueue(input.conversationId, actions);

      const agentHistory = await this.stateManager.getAgentHistory(input.conversationId);
      const newEntries: AgentHistoryEntry[] = actions.map((a) => ({
        userId: a.asUserId,
        topic: triageResult.responses?.[0]?.suggestedTopic ?? 'reactive',
        contentHash: this.hashContent(a.content),
        timestamp: Date.now(),
      }));
      await this.stateManager.setAgentHistory(input.conversationId, [...agentHistory, ...newEntries]);

    } catch (error) {
      console.error(`[ReactiveHandler] Error handling interpellation for conv=${input.conversationId}:`, error);
    }
  }

  private async callTriage(
    input: InterpellationInput,
    targetUsers: ControlledUser[],
    recentMessages: MessageEntry[],
    interpellationType: string,
  ): Promise<TriageResponse> {
    const userList = targetUsers.map((u) => `- ${u.displayName} (${u.userId}): ${u.role.personaSummary}`).join('\n');
    const msgContext = recentMessages.slice(-10).map((m) => `[${m.senderName}]: ${m.content}`).join('\n');

    const response = await this.llm.chat({
      messages: [{
        role: 'user',
        content: `Tu es un systeme de triage pour un agent conversationnel.

INTERPELLATION detectee: ${interpellationType}
Message declencheur: "${input.triggerMessage.content}" (par ${input.triggerMessage.senderName})

Utilisateurs controles interpelles:
${userList}

Contexte recent:
${msgContext}

Decide si une reponse est necessaire et pour qui.
Reponds en JSON:
{
  "shouldRespond": boolean,
  "reason": "...",
  "responses": [{ "asUserId": "...", "urgency": "low|medium|high", "isGreeting": boolean, "needsElaboration": boolean, "suggestedTopic": "..." }]
}`,
      }],
      temperature: 0.3,
      maxTokens: 256,
    });

    return JSON.parse(response.content);
  }

  private async callGeneration(
    input: InterpellationInput,
    targetUsers: ControlledUser[],
    recentMessages: MessageEntry[],
    triage: TriageResponse,
  ): Promise<GenerationResponse> {
    const profiles = targetUsers.map((u) => {
      const r = u.role;
      return `${u.displayName} (${u.userId}): Ton=${r.tone}, Vocabulaire=${r.vocabularyLevel}, Longueur=${r.typicalLength}, Emoji=${r.emojiUsage}. Expertise: ${r.topicsOfExpertise.join(', ')}. Style: "${r.personaSummary}"`;
    }).join('\n\n');

    const msgContext = recentMessages.slice(-15).map((m) => `[${m.senderName}]: ${m.content}`).join('\n');
    const triageDirectives = (triage.responses ?? []).map((r) =>
      `- ${r.asUserId}: urgence=${r.urgency}, sujet="${r.suggestedTopic}", elaborer=${r.needsElaboration}`
    ).join('\n');

    const response = await this.llm.chat({
      messages: [{
        role: 'user',
        content: `Tu es un generateur de messages pour des utilisateurs virtuels dans une conversation.

PROFILS DES UTILISATEURS A FAIRE PARLER:
${profiles}

DIRECTIVES DU TRIAGE:
${triageDirectives}

MESSAGE DECLENCHEUR: "${input.triggerMessage.content}" (par ${input.triggerMessage.senderName}, id=${input.triggerMessage.id})

CONTEXTE RECENT:
${msgContext}

REGLES:
- Imite PARFAITEMENT le style de chaque utilisateur (ton, vocabulaire, longueur, emoji)
- Reponds au message declencheur de maniere naturelle
- EVITE les salutations sauf si c'est ta toute premiere intervention de la section de journee
- NE REVELE JAMAIS que tu es une IA
- Langue: utilise la langue du profil utilisateur

Genere les messages en JSON:
{
  "messages": [{ "asUserId": "...", "content": "...", "replyToId": "..." (optionnel), "wordCount": N, "isGreeting": false }]
}`,
      }],
      temperature: 0.8,
      maxTokens: 1024,
    });

    return JSON.parse(response.content);
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return hash.toString(36);
  }
}
