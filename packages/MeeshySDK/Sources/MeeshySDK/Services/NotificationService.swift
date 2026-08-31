import Foundation

public final class NotificationService: @unchecked Sendable {
    public static let shared = NotificationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func list(offset: Int = 0, limit: Int = 20, unreadOnly: Bool = false) async throws -> NotificationListResponse {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if unreadOnly {
            queryItems.append(URLQueryItem(name: "unreadOnly", value: "true"))
        }
        return try await api.request(NotificationsEndpoint.root, queryItems: queryItems)
    }

    public func unreadCount() async throws -> Int {
        let response: UnreadCountResponse = try await api.request(NotificationsEndpoint.unreadCount)
        return response.count
    }

    public func markAsRead(notificationId: String) async throws {
        let _: APIResponse<APINotification> = try await api.request(
            NotificationsEndpoint.byIdRead(id: notificationId),
            method: "POST"
        )
    }

    public func markAllAsRead() async throws -> Int {
        let response: MarkReadResponse = try await api.request(
            NotificationsEndpoint.readAll,
            method: "POST"
        )
        return response.count ?? 0
    }

    /// Marque toutes les notifications d'une conversation comme lues.
    /// Appelé à l'ouverture d'une conversation : le contenu étant consommé,
    /// ses notifications ne doivent plus apparaître comme non lues.
    /// Retourne le nombre de notifications marquées.
    @discardableResult
    public func markConversationRead(conversationId: String) async throws -> Int {
        let response: MarkReadResponse = try await api.request(
            NotificationsEndpoint.conversationByConversationIdRead(conversationId: conversationId),
            method: "POST"
        )
        return response.count ?? 0
    }

    /// Marque comme lues toutes les notifications liées à un post — story,
    /// statut ou post de feed. Appelé à l'ouverture du contenu : le contenu
    /// étant consommé, ses notifications (« X a publié une story », mais aussi
    /// les commentaires et réactions dessus) ne doivent plus apparaître comme
    /// non lues. Retourne le nombre de notifications marquées.
    @discardableResult
    public func markPostRead(postId: String) async throws -> Int {
        let response: MarkReadResponse = try await api.request(
            NotificationsEndpoint.postByPostIdRead(postId: postId),
            method: "POST"
        )
        return response.count ?? 0
    }

    /// Marque comme lues toutes les notifications dont le type est dans `types`.
    /// Appelé quand un écran consomme une catégorie entière (ex : l'écran des
    /// demandes d'ajout consomme `friend_request` / `contact_request` /
    /// `friend_accepted`). Retourne le nombre de notifications marquées.
    @discardableResult
    public func markRead(types: [String]) async throws -> Int {
        struct Body: Encodable { let types: [String] }
        let bodyData = try JSONEncoder().encode(Body(types: types))
        let response: MarkReadResponse = try await api.request(
            NotificationsEndpoint.readByTypes,
            method: "POST",
            body: bodyData
        )
        return response.count ?? 0
    }

    public func delete(notificationId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(NotificationsEndpoint.byId(id: notificationId))
    }
}
