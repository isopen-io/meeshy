//
//  MessageEndpoints.swift
//  Meeshy
//
//  Message API endpoints
//

import Foundation

enum MessageEndpoints: APIEndpoint, Sendable {

    case fetchMessages(conversationId: String, page: Int, limit: Int)
    case fetchMessagesBefore(conversationId: String, beforeId: String, limit: Int)
    case fetchMessagesAfter(conversationId: String, afterId: String, limit: Int, includeMessage: Bool)
    case sendMessage(conversationId: String, MessageSendRequest)
    case editMessage(messageId: String, MessageEditRequest)
    case deleteMessage(messageId: String)
    case addReaction(ReactionAddRequest)      // POST /api/reactions { messageId, emoji }
    case removeReaction(reactionId: String)   // DELETE /api/reactions/:reactionId
    case getTranslation(messageId: String, MessageTranslationRequest)
    case forwardMessage(messageId: String, conversationIds: [String])
    case pinMessage(messageId: String)
    case unpinMessage(messageId: String)
    case searchMessages(conversationId: String?, query: String, page: Int, limit: Int)

    var path: String {
        switch self {
        case .fetchMessages(let conversationId, _, _),
             .fetchMessagesBefore(let conversationId, _, _),
             .fetchMessagesAfter(let conversationId, _, _, _):
            return "/api/conversations/\(conversationId)/messages"
        case .sendMessage(let conversationId, _):
            return "/api/conversations/\(conversationId)/messages"
        case .editMessage(let messageId, _):
            return "/api/messages/\(messageId)"
        case .deleteMessage(let messageId):
            return "/api/messages/\(messageId)"
        case .addReaction:
            return "/api/reactions"
        case .removeReaction(let reactionId):
            return "/api/reactions/\(reactionId)"
        case .getTranslation(let messageId, _):
            return "/api/messages/\(messageId)/translate"
        case .forwardMessage(let messageId, _):
            return "/api/messages/\(messageId)/forward"
        case .pinMessage(let messageId):
            return "/api/messages/\(messageId)/pin"
        case .unpinMessage(let messageId):
            return "/api/messages/\(messageId)/pin"
        case .searchMessages:
            return "/api/messages/search"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchMessages, .fetchMessagesBefore, .fetchMessagesAfter, .searchMessages:
            return .get
        case .sendMessage, .addReaction, .getTranslation, .forwardMessage, .pinMessage:
            return .post
        case .editMessage:
            return .put
        case .deleteMessage, .removeReaction, .unpinMessage:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .fetchMessages(_, let page, let limit):
            // Backend uses 'offset' not 'page' - convert page to offset
            let offset = (page - 1) * limit
            return ["offset": offset, "limit": limit]
        case .fetchMessagesBefore(_, let beforeId, let limit):
            return ["before": beforeId, "limit": limit]
        case .fetchMessagesAfter(_, let afterId, let limit, let includeMessage):
            var params: [String: Any] = ["after": afterId, "limit": limit]
            if includeMessage {
                params["include"] = "true"
            }
            return params
        case .searchMessages(let conversationId, let query, let page, let limit):
            var params: [String: Any] = ["query": query, "page": page, "limit": limit]
            if let conversationId = conversationId {
                params["conversationId"] = conversationId
            }
            return params
        default:
            return nil
        }
    }

    var body: Encodable? {
        switch self {
        case .sendMessage(_, let request):
            return request
        case .editMessage(_, let request):
            return request
        case .addReaction(let request):
            return request
        case .getTranslation(_, let request):
            return request
        case .forwardMessage(_, let conversationIds):
            return ["conversationIds": conversationIds]
        default:
            return nil
        }
    }
}

// MARK: - Reaction Request Models

/// Request to add a reaction
struct ReactionAddRequest: Encodable, Sendable {
    let messageId: String
    let emoji: String
}
