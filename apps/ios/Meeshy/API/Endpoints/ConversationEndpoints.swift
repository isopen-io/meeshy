//
//  ConversationEndpoints.swift
//  Meeshy
//
//  Conversation API endpoints
//

import Foundation

enum ConversationEndpoints: APIEndpoint, Sendable {

    case fetchConversations(page: Int, limit: Int)
    case createConversation(ConversationCreateRequest)
    case getConversation(id: String)
    case updateConversation(id: String, ConversationUpdateRequest)
    case deleteConversation(id: String)
    case fetchMembers(conversationId: String, page: Int, limit: Int)
    case addMembers(conversationId: String, ConversationMemberAddRequest)
    case removeMember(conversationId: String, userId: String)
    case updateMemberRole(conversationId: String, userId: String, role: ConversationMemberRole)
    case leaveConversation(conversationId: String)
    case pinConversation(conversationId: String)
    case unpinConversation(conversationId: String)
    case muteConversation(conversationId: String, duration: Int?)
    case unmuteConversation(conversationId: String)
    case archiveConversation(conversationId: String)
    case unarchiveConversation(conversationId: String)
    case markAsRead(conversationId: String)
    case searchConversations(query: String, page: Int, limit: Int)

    var path: String {
        switch self {
        case .fetchConversations:
            return "/api/conversations"
        case .createConversation:
            return "/api/conversations"
        case .getConversation(let id):
            return "/api/conversations/\(id)"
        case .updateConversation(let id, _):
            return "/api/conversations/\(id)"
        case .deleteConversation(let id):
            return "/api/conversations/\(id)"
        case .fetchMembers(let conversationId, _, _):
            return "/api/conversations/\(conversationId)/participants"
        case .addMembers(let conversationId, _):
            return "/api/conversations/\(conversationId)/participants"
        case .removeMember(let conversationId, let userId):
            return "/api/conversations/\(conversationId)/participants/\(userId)"
        case .updateMemberRole(let conversationId, let userId, _):
            return "/api/conversations/\(conversationId)/participants/\(userId)/role"
        case .leaveConversation(let conversationId):
            return "/api/conversations/\(conversationId)/leave"
        case .pinConversation(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .unpinConversation(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .muteConversation(let conversationId, _):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .unmuteConversation(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .archiveConversation(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .unarchiveConversation(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .markAsRead(let conversationId):
            // Use existing backend route (conversations.ts:1614)
            return "/api/conversations/\(conversationId)/read"
        case .searchConversations:
            return "/api/conversations/search"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchConversations, .getConversation, .fetchMembers, .searchConversations:
            return .get
        case .createConversation, .addMembers, .leaveConversation, .markAsRead:
            return .post
        case .updateConversation, .updateMemberRole, .pinConversation, .unpinConversation, .muteConversation, .unmuteConversation, .archiveConversation, .unarchiveConversation:
            return .put
        case .deleteConversation, .removeMember:
            return .delete
        }
    }

    var queryParameters: [String: Any]? {
        switch self {
        case .fetchConversations(let page, let limit):
            // Backend expects "offset" not "page"
            // Convert page-based pagination to offset-based: offset = (page - 1) * limit
            let offset = (page - 1) * limit
            return ["offset": offset, "limit": limit]
        case .fetchMembers(_, let page, let limit):
            let offset = (page - 1) * limit
            return ["offset": offset, "limit": limit]
        case .searchConversations(let query, let page, let limit):
            let offset = (page - 1) * limit
            return ["query": query, "offset": offset, "limit": limit]
        default:
            return nil
        }
    }

    var body: Encodable? {
        switch self {
        case .createConversation(let request):
            return request
        case .updateConversation(_, let request):
            return request
        case .addMembers(_, let request):
            return request
        case .updateMemberRole(_, _, let role):
            return ["role": role.rawValue]
        case .pinConversation:
            return ["isPinned": true]
        case .unpinConversation:
            return ["isPinned": false]
        case .muteConversation(_, let duration):
            // Note: duration not supported in current backend, just mute
            return ["isMuted": true]
        case .unmuteConversation:
            return ["isMuted": false]
        case .archiveConversation:
            return ["isArchived": true]
        case .unarchiveConversation:
            return ["isArchived": false]
        default:
            return nil
        }
    }
}

// MARK: - User Preferences Endpoints

/// User-specific conversation preferences API endpoints
/// Base path: /api/user-preferences/conversations
enum UserPreferencesEndpoints: APIEndpoint, Sendable {

    /// GET /api/user-preferences/conversations - Get all user preferences
    case fetchAllPreferences

    /// GET /api/user-preferences/conversations/:conversationId - Get preferences for a conversation
    case fetchPreferences(conversationId: String)

    /// PUT /api/user-preferences/conversations/:conversationId - Create/Update preferences
    case updatePreferences(conversationId: String, UserPreferencesUpdateRequest)

    /// DELETE /api/user-preferences/conversations/:conversationId - Delete preferences
    case deletePreferences(conversationId: String)

    /// POST /api/user-preferences/reorder - Reorder conversations
    case reorderConversations(UserPreferencesReorderRequest)

    var path: String {
        switch self {
        case .fetchAllPreferences:
            return "/api/user-preferences/conversations"
        case .fetchPreferences(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .updatePreferences(let conversationId, _):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .deletePreferences(let conversationId):
            return "/api/user-preferences/conversations/\(conversationId)"
        case .reorderConversations:
            return "/api/user-preferences/reorder"
        }
    }

    var method: HTTPMethod {
        switch self {
        case .fetchAllPreferences, .fetchPreferences:
            return .get
        case .updatePreferences:
            return .put
        case .deletePreferences:
            return .delete
        case .reorderConversations:
            return .post
        }
    }

    var queryParameters: [String: Any]? {
        return nil
    }

    var body: Encodable? {
        switch self {
        case .updatePreferences(_, let request):
            return request
        case .reorderConversations(let request):
            return request
        default:
            return nil
        }
    }
}

// MARK: - User Preferences Request/Response Models

/// Request model for updating user preferences for a conversation
struct UserPreferencesUpdateRequest: Codable, Sendable {
    var isPinned: Bool?
    var isMuted: Bool?
    var isArchived: Bool?
    var categoryId: String?
    var orderInCategory: Int?
    var tags: [String]?
    var customName: String?
    var reaction: String?

    init(
        isPinned: Bool? = nil,
        isMuted: Bool? = nil,
        isArchived: Bool? = nil,
        categoryId: String? = nil,
        orderInCategory: Int? = nil,
        tags: [String]? = nil,
        customName: String? = nil,
        reaction: String? = nil
    ) {
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.isArchived = isArchived
        self.categoryId = categoryId
        self.orderInCategory = orderInCategory
        self.tags = tags
        self.customName = customName
        self.reaction = reaction
    }
}

/// Request model for reordering conversations
struct UserPreferencesReorderRequest: Codable, Sendable {
    let conversationIds: [String]
    let categoryId: String?

    init(conversationIds: [String], categoryId: String? = nil) {
        self.conversationIds = conversationIds
        self.categoryId = categoryId
    }
}

/// Response model for conversation user preferences
struct ConversationPreferencesResponse: Codable, Sendable {
    let conversationId: String
    let isPinned: Bool
    let isMuted: Bool
    let isArchived: Bool
    let categoryId: String?
    let orderInCategory: Int?
    let tags: [String]?
    let customName: String?
    let reaction: String?
}

/// Response model for all conversation user preferences
struct ConversationPreferencesListResponse: Codable, Sendable {
    let preferences: [ConversationPreferencesResponse]
}
