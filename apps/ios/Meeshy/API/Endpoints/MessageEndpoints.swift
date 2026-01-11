//
//  MessageEndpoints.swift
//  Meeshy
//
//  Message API endpoints
//  UPDATED: Uses offset/limit pagination pattern
//

import Foundation

enum MessageEndpoints: APIEndpoint, Sendable {

    case fetchMessages(conversationId: String, offset: Int, limit: Int)
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
    case searchMessages(conversationId: String?, query: String, offset: Int, limit: Int)

    var path: String {
        switch self {
        case .fetchMessages(let conversationId, _, _),
             .fetchMessagesBefore(let conversationId, _, _),
             .fetchMessagesAfter(let conversationId, _, _, _):
            return "\(EnvironmentConfig.apiPath)/conversations/\(conversationId)/messages"
        case .sendMessage(let conversationId, _):
            return "\(EnvironmentConfig.apiPath)/conversations/\(conversationId)/messages"
        case .editMessage(let messageId, _):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)"
        case .deleteMessage(let messageId):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)"
        case .addReaction:
            return "\(EnvironmentConfig.apiPath)/reactions"
        case .removeReaction(let reactionId):
            return "\(EnvironmentConfig.apiPath)/reactions/\(reactionId)"
        case .getTranslation(let messageId, _):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)/translate"
        case .forwardMessage(let messageId, _):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)/forward"
        case .pinMessage(let messageId):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)/pin"
        case .unpinMessage(let messageId):
            return "\(EnvironmentConfig.apiPath)/messages/\(messageId)/pin"
        case .searchMessages:
            return "\(EnvironmentConfig.apiPath)/messages/search"
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
        case .fetchMessages(_, let offset, let limit):
            return ["offset": offset, "limit": limit]
        case .fetchMessagesBefore(_, let beforeId, let limit):
            return ["before": beforeId, "limit": limit]
        case .fetchMessagesAfter(_, let afterId, let limit, let includeMessage):
            var params: [String: Any] = ["after": afterId, "limit": limit]
            if includeMessage {
                params["include"] = "true"
            }
            return params
        case .searchMessages(let conversationId, let query, let offset, let limit):
            var params: [String: Any] = ["query": query, "offset": offset, "limit": limit]
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
