import { isServerAtRestMode } from '../../services/messaging/serverAtRest';

/**
 * CE QUE L'AGENT IA APPREND D'UN MESSAGE ENVOYÉ (`agent:new-message`), site
 * unique des deux tuyaux socket (`handleMessageSend`,
 * `handleMessageSendWithAttachments`).
 *
 * #12822 — un message d'une conversation `server`/`hybrid` ne part JAMAIS vers
 * l'agent. La passerelle le sert en clair (`servedClearAtRest`), mais
 * `services/agent` en ferait trois copies hors de son contrôle : une fenêtre
 * de 250 messages dans Redis (AOF), l'appel au fournisseur LLM, et les résumés
 * écrits dans MongoDB. Le chiffrement au repos ne tient que si le clair ne se
 * pose sur aucun autre disque ; l'agent est donc absent de ces conversations
 * tant que le porteur n'a pas tranché autrement.
 */
export type AgentNotifiedMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string | null;
  readonly senderDisplayName?: string;
  readonly senderUsername?: string;
  readonly content: string | null;
  readonly originalLanguage: string | null;
  readonly encryptionMode?: string | null;
  readonly replyToId?: string | null;
  readonly mentionedUserIds?: readonly string[];
  readonly createdAt: Date;
};

export type AgentEventSink = {
  sendEvent(event: Record<string, unknown>): Promise<void>;
};

export const agentMayReadMessage = (message: Pick<AgentNotifiedMessage, 'encryptionMode'>): boolean =>
  !isServerAtRestMode(message.encryptionMode);

export function notifyAgentOfMessage(params: {
  readonly agent: AgentEventSink | null;
  readonly message: AgentNotifiedMessage;
  readonly onError: (error: unknown) => void;
}): void {
  const { agent, message } = params;
  if (!agent || !message.senderId || !message.content || !agentMayReadMessage(message)) return;
  agent.sendEvent({
    type: 'agent:new-message',
    conversationId: message.conversationId,
    messageId: message.id,
    senderId: message.senderId,
    senderDisplayName: message.senderDisplayName,
    senderUsername: message.senderUsername,
    content: message.content,
    originalLanguage: message.originalLanguage ?? 'fr',
    replyToId: message.replyToId ?? undefined,
    mentionedUserIds: [...(message.mentionedUserIds ?? [])],
    timestamp: message.createdAt.getTime(),
  }).catch(params.onError);
}
