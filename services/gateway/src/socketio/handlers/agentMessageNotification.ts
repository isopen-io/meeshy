import { messageRowSealedFromServer } from '../../services/messaging/e2eePlaintextAdmission';
import { revealAtRest, type AtRestKeyring, type AtRestReadableRow } from '../../services/messaging/serverAtRest';

/**
 * CE QUE L'AGENT IA APPREND D'UN MESSAGE ENVOYÉ (`agent:new-message`), site
 * unique des deux tuyaux socket (`handleMessageSend`,
 * `handleMessageSendWithAttachments`).
 *
 * Décision porteur du 2026-11-01 (directive #9224 : « sans E2EE, toutes les
 * features serveur ») — l'agent revient dans les conversations `server` /
 * `hybrid`, que #12822 l'en avait retiré. Il y reçoit le texte DÉCHIFFRÉ par
 * la passerelle (`agentReadableMessage`, sur `revealAtRest`) : une ligne au
 * repos porte `content: ''`, et la chaîne vide ne part jamais.
 *
 * Il reste ABSENT de tout message que le serveur ne lit pas — `e2ee`, ou
 * chiffré sans régime connu (`messageRowSealedFromServer`, la loi partagée de
 * la traduction) : le placeholder d'un relais e2ee ne part pas non plus.
 *
 * Hors du modèle de menace du repos, et assumé par la décision : le texte
 * transmis se pose chez `services/agent` (fenêtre Redis, fournisseur LLM,
 * résumés MongoDB), que le chiffrement au repos de la passerelle ne couvre pas.
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
  readonly isEncrypted?: boolean | null;
  readonly replyToId?: string | null;
  readonly mentionedUserIds?: readonly string[];
  readonly createdAt: Date;
};

export type AgentEventSink = {
  sendEvent(event: Record<string, unknown>): Promise<void>;
};

export const agentMayReadMessage = (message: Pick<AgentNotifiedMessage, 'encryptionMode' | 'isEncrypted'>): boolean =>
  !messageRowSealedFromServer({ isEncrypted: message.isEncrypted ?? null, encryptionMode: message.encryptionMode ?? null });

/**
 * Le message tel que l'agent le lit : ouvert par la passerelle s'il est encore
 * scellé au repos, tel quel sinon (une ligne qu'aucune clé n'ouvre ressort
 * scellée, `content` vide, et ne part donc pas).
 */
export const agentReadableMessage = <T extends AtRestReadableRow>(message: T, keyring: AtRestKeyring): Promise<T> =>
  revealAtRest(message, keyring);

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
