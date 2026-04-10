import Foundation

// MARK: - Protocol

public protocol ConversationServiceProviding: Sendable {
    func list(offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APIConversation]>
    func getById(_ conversationId: String) async throws -> APIConversation
    func create(type: String, title: String?, participantIds: [String]) async throws -> CreateConversationResponse
    func delete(conversationId: String) async throws
    func markRead(conversationId: String) async throws
    func markAsReceived(conversationId: String) async throws
    func markUnread(conversationId: String) async throws
    func getParticipants(conversationId: String, limit: Int, cursor: String?) async throws -> PaginatedAPIResponse<[APIParticipant]>
    func deleteForMe(conversationId: String) async throws
    func listSharedWith(userId: String, limit: Int) async throws -> [APIConversation]
    func findDirectWith(userId: String) async throws -> APIConversation?
    func removeParticipant(conversationId: String, participantId: String) async throws
    func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws
    func update(
        conversationId: String,
        title: String?,
        description: String?,
        avatar: String?,
        banner: String?,
        defaultWriteRole: String?,
        isAnnouncementChannel: Bool?,
        slowModeSeconds: Int?,
        autoTranslateEnabled: Bool?
    ) async throws -> APIConversation
    func leave(conversationId: String) async throws
    func banParticipant(conversationId: String, userId: String) async throws
    func unbanParticipant(conversationId: String, userId: String) async throws
}

public final class ConversationService: ConversationServiceProviding, @unchecked Sendable {
    public static let shared = ConversationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(offset: Int = 0, limit: Int = 30) async throws -> OffsetPaginatedAPIResponse<[APIConversation]> {
        try await api.offsetPaginatedRequest(endpoint: "/conversations", offset: offset, limit: limit)
    }

    public func getById(_ conversationId: String) async throws -> APIConversation {
        let response: APIResponse<APIConversation> = try await api.request(
            endpoint: "/conversations/\(conversationId)"
        )
        return response.data
    }

    public func create(type: String, title: String? = nil, participantIds: [String]) async throws -> CreateConversationResponse {
        let body = CreateConversationRequest(type: type, title: title, participantIds: participantIds)
        let response: APIResponse<CreateConversationResponse> = try await api.post(endpoint: "/conversations", body: body)
        return response.data
    }

    public func delete(conversationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(endpoint: "/conversations/\(conversationId)")
    }

    public func markRead(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-as-read", method: "POST")
    }

    public func markAsReceived(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-as-received", method: "POST")
    }

    public func markUnread(conversationId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(endpoint: "/conversations/\(conversationId)/mark-unread", method: "POST")
    }

    public func getParticipants(conversationId: String, limit: Int = 100, cursor: String? = nil) async throws -> PaginatedAPIResponse<[APIParticipant]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await api.request(
            endpoint: "/conversations/\(conversationId)/participants",
            queryItems: queryItems
        )
    }

    public func deleteForMe(conversationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/conversations/\(conversationId)/delete-for-me"
        )
    }

    public func removeParticipant(conversationId: String, participantId: String) async throws {
        let _: APIResponse<[String: String]> = try await api.request(
            endpoint: "/conversations/\(conversationId)/participants/\(participantId)",
            method: "DELETE"
        )
    }

    public func updateParticipantRole(conversationId: String, participantId: String, role: String) async throws {
        struct RoleBody: Encodable { let role: String }
        let _: APIResponse<[String: String]> = try await api.patch(
            endpoint: "/conversations/\(conversationId)/participants/\(participantId)/role",
            body: RoleBody(role: role)
        )
    }

    public func update(
        conversationId: String,
        title: String? = nil,
        description: String? = nil,
        avatar: String? = nil,
        banner: String? = nil,
        defaultWriteRole: String? = nil,
        isAnnouncementChannel: Bool? = nil,
        slowModeSeconds: Int? = nil,
        autoTranslateEnabled: Bool? = nil
    ) async throws -> APIConversation {
        struct UpdateConversationRequest: Encodable {
            let title: String?
            let description: String?
            let avatar: String?
            let banner: String?
            let defaultWriteRole: String?
            let isAnnouncementChannel: Bool?
            let slowModeSeconds: Int?
            let autoTranslateEnabled: Bool?

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                if let title { try container.encode(title, forKey: .title) }
                if let description { try container.encode(description, forKey: .description) }
                if let avatar { try container.encode(avatar, forKey: .avatar) }
                if let banner { try container.encode(banner, forKey: .banner) }
                if let defaultWriteRole { try container.encode(defaultWriteRole, forKey: .defaultWriteRole) }
                if let isAnnouncementChannel { try container.encode(isAnnouncementChannel, forKey: .isAnnouncementChannel) }
                if let slowModeSeconds { try container.encode(slowModeSeconds, forKey: .slowModeSeconds) }
                if let autoTranslateEnabled { try container.encode(autoTranslateEnabled, forKey: .autoTranslateEnabled) }
            }

            enum CodingKeys: String, CodingKey {
                case title, description, avatar, banner
                case defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled
            }
        }
        let body = UpdateConversationRequest(
            title: title,
            description: description,
            avatar: avatar,
            banner: banner,
            defaultWriteRole: defaultWriteRole,
            isAnnouncementChannel: isAnnouncementChannel,
            slowModeSeconds: slowModeSeconds,
            autoTranslateEnabled: autoTranslateEnabled
        )
        let response: APIResponse<UpdateConversationResponse> = try await api.put(
            endpoint: "/conversations/\(conversationId)", body: body)
        return response.data.toAPIConversation()
    }

    public func leave(conversationId: String) async throws {
        let _: APIResponse<LeaveConversationResponse> = try await api.request(
            endpoint: "/conversations/\(conversationId)/leave",
            method: "POST"
        )
    }

    public func banParticipant(conversationId: String, userId: String) async throws {
        let _: APIResponse<BanParticipantResponse> = try await api.request(
            endpoint: "/conversations/\(conversationId)/participants/\(userId)/ban",
            method: "PATCH"
        )
    }

    public func unbanParticipant(conversationId: String, userId: String) async throws {
        let _: APIResponse<UnbanParticipantResponse> = try await api.request(
            endpoint: "/conversations/\(conversationId)/participants/\(userId)/unban",
            method: "PATCH"
        )
    }

    /// Récupère les conversations en commun avec un utilisateur spécifique
    public func listSharedWith(userId: String, limit: Int = 50) async throws -> [APIConversation] {
        let response: APIResponse<[APIConversation]> = try await api.request(
            endpoint: "/conversations",
            queryItems: [
                URLQueryItem(name: "withUserId", value: userId),
                URLQueryItem(name: "limit", value: "\(limit)")
            ]
        )
        return response.data
    }

    /// Finds the most recent existing direct conversation with a given user, or nil if none exists.
    public func findDirectWith(userId: String) async throws -> APIConversation? {
        let response: APIResponse<[APIConversation]> = try await api.request(
            endpoint: "/conversations",
            queryItems: [
                URLQueryItem(name: "type", value: "direct"),
                URLQueryItem(name: "withUserId", value: userId),
                URLQueryItem(name: "limit", value: "1")
            ]
        )
        return response.data.first
    }
}

// MARK: - Response Types

struct LeaveConversationResponse: Decodable {
    let conversationId: String
    let leftAt: String
}

struct BanParticipantResponse: Decodable {
    let userId: String
    let bannedAt: String
}

struct UnbanParticipantResponse: Decodable {
    let userId: String
}
