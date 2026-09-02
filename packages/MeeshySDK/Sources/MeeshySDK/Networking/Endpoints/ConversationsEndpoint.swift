// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum ConversationsEndpoint: MeeshyEndpoint, Sendable {
    case byConversationIdActiveCall(conversationId: String)
    case byConversationIdAttachments(conversationId: String)
    case byConversationIdEncryption(conversationId: String)
    case byConversationIdEncryptionStatus(conversationId: String)
    case byConversationIdLinks(conversationId: String)
    case byConversationIdMarkAsRead(conversationId: String)
    case byConversationIdMarkAsReceived(conversationId: String)
    case byConversationIdMessagesByMessageIdDeliveryReceipt(conversationId: String, messageId: String)
    case byConversationIdReadStatuses(conversationId: String)
    case byConversationIdReceipts(conversationId: String)
    case byId(id: String)
    case byIdAnalysis(id: String)
    case byIdDeleteForMe(id: String)
    case byIdInvite(id: String)
    case byIdLeave(id: String)
    case byIdMarkRead(id: String)
    case byIdMarkUnread(id: String)
    case byIdMessages(id: String)
    case byIdMessagesByMessageId(id: String, messageId: String)
    case byIdMessagesByMessageIdConsume(id: String, messageId: String)
    case byIdMessagesByMessageIdPin(id: String, messageId: String)
    case byIdMessagesSearch(id: String)
    case byIdNewLink(id: String)
    case byIdParticipants(id: String)
    case byIdParticipantsByParticipantIdProfile(id: String, participantId: String)
    case byIdParticipantsByParticipantIdRights(id: String, participantId: String)
    case byIdParticipantsByParticipantKey(id: String, participantKey: String)
    case byIdParticipantsByUserId(id: String, userId: String)
    case byIdParticipantsByUserIdBan(id: String, userId: String)
    case byIdParticipantsByUserIdRole(id: String, userId: String)
    case byIdParticipantsByUserIdUnban(id: String, userId: String)
    case byIdPinnedMessages(id: String)
    case byIdReactions(id: String)
    case byIdStats(id: String)
    case byIdStatus(id: String)
    case byIdThreadsByMessageId(id: String, messageId: String)
    case checkIdentifierByIdentifier(identifier: String)
    case joinByLinkId(linkId: String)
    case root
    case search

    public var path: String {
        switch self {
        case .byConversationIdActiveCall(let conversationId): return "/api/v1/conversations/\(conversationId)/active-call"
        case .byConversationIdAttachments(let conversationId): return "/api/v1/conversations/\(conversationId)/attachments"
        case .byConversationIdEncryption(let conversationId): return "/api/v1/conversations/\(conversationId)/encryption"
        case .byConversationIdEncryptionStatus(let conversationId): return "/api/v1/conversations/\(conversationId)/encryption-status"
        case .byConversationIdLinks(let conversationId): return "/api/v1/conversations/\(conversationId)/links"
        case .byConversationIdMarkAsRead(let conversationId): return "/api/v1/conversations/\(conversationId)/mark-as-read"
        case .byConversationIdMarkAsReceived(let conversationId): return "/api/v1/conversations/\(conversationId)/mark-as-received"
        case .byConversationIdMessagesByMessageIdDeliveryReceipt(let conversationId, let messageId): return "/api/v1/conversations/\(conversationId)/messages/\(messageId)/delivery-receipt"
        case .byConversationIdReadStatuses(let conversationId): return "/api/v1/conversations/\(conversationId)/read-statuses"
        case .byConversationIdReceipts(let conversationId): return "/api/v1/conversations/\(conversationId)/receipts"
        case .byId(let id): return "/api/v1/conversations/\(id)"
        case .byIdAnalysis(let id): return "/api/v1/conversations/\(id)/analysis"
        case .byIdDeleteForMe(let id): return "/api/v1/conversations/\(id)/delete-for-me"
        case .byIdInvite(let id): return "/api/v1/conversations/\(id)/invite"
        case .byIdLeave(let id): return "/api/v1/conversations/\(id)/leave"
        case .byIdMarkRead(let id): return "/api/v1/conversations/\(id)/mark-read"
        case .byIdMarkUnread(let id): return "/api/v1/conversations/\(id)/mark-unread"
        case .byIdMessages(let id): return "/api/v1/conversations/\(id)/messages"
        case .byIdMessagesByMessageId(let id, let messageId): return "/api/v1/conversations/\(id)/messages/\(messageId)"
        case .byIdMessagesByMessageIdConsume(let id, let messageId): return "/api/v1/conversations/\(id)/messages/\(messageId)/consume"
        case .byIdMessagesByMessageIdPin(let id, let messageId): return "/api/v1/conversations/\(id)/messages/\(messageId)/pin"
        case .byIdMessagesSearch(let id): return "/api/v1/conversations/\(id)/messages/search"
        case .byIdNewLink(let id): return "/api/v1/conversations/\(id)/new-link"
        case .byIdParticipants(let id): return "/api/v1/conversations/\(id)/participants"
        case .byIdParticipantsByParticipantIdProfile(let id, let participantId): return "/api/v1/conversations/\(id)/participants/\(participantId)/profile"
        case .byIdParticipantsByParticipantIdRights(let id, let participantId): return "/api/v1/conversations/\(id)/participants/\(participantId)/rights"
        case .byIdParticipantsByParticipantKey(let id, let participantKey): return "/api/v1/conversations/\(id)/participants/\(participantKey)"
        case .byIdParticipantsByUserId(let id, let userId): return "/api/v1/conversations/\(id)/participants/\(userId)"
        case .byIdParticipantsByUserIdBan(let id, let userId): return "/api/v1/conversations/\(id)/participants/\(userId)/ban"
        case .byIdParticipantsByUserIdRole(let id, let userId): return "/api/v1/conversations/\(id)/participants/\(userId)/role"
        case .byIdParticipantsByUserIdUnban(let id, let userId): return "/api/v1/conversations/\(id)/participants/\(userId)/unban"
        case .byIdPinnedMessages(let id): return "/api/v1/conversations/\(id)/pinned-messages"
        case .byIdReactions(let id): return "/api/v1/conversations/\(id)/reactions"
        case .byIdStats(let id): return "/api/v1/conversations/\(id)/stats"
        case .byIdStatus(let id): return "/api/v1/conversations/\(id)/status"
        case .byIdThreadsByMessageId(let id, let messageId): return "/api/v1/conversations/\(id)/threads/\(messageId)"
        case .checkIdentifierByIdentifier(let identifier): return "/api/v1/conversations/check-identifier/\(identifier)"
        case .joinByLinkId(let linkId): return "/api/v1/conversations/join/\(linkId)"
        case .root: return "/api/v1/conversations"
        case .search: return "/api/v1/conversations/search"
        }
    }
}
