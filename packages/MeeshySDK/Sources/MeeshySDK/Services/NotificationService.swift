import Foundation

/// LE SEAM DU SERVICE DE NOTIFICATIONS (#4901) — créé pour l'injection dans
/// `NotificationListViewModel` (le témoin de boucle du curseur se joue au
/// niveau VM, contre un mock qui CAPTURE les arguments). Antérieur à la règle
/// « protocole avant implémentation », rattrapé ici. Les défauts d'arguments
/// vivent sur le TYPE CONCRET (un protocole Swift n'en porte pas) : un
/// appelant par protocole passe tout, et c'est ce qui rend ses appels
/// vérifiables.
public protocol NotificationServiceProviding: Sendable {
    func list(
        offset: Int?,
        cursor: String?,
        limit: Int,
        unreadOnly: Bool
    ) async throws -> NotificationListResponse
    func unreadCount() async throws -> Int
    func markAsRead(notificationId: String) async throws
}

public final class NotificationService: NotificationServiceProviding, @unchecked Sendable {
    public static let shared = NotificationService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    /// LA LISTE, PAR CURSEUR D'ABORD (#4901). `offset` était NON OPTIONNEL :
    /// la signature obligeait l'appelant à envoyer un rang — la forme qui
    /// repaye un `count()` à chaque première page et SAUTE des lignes dès
    /// qu'une notification arrive entre deux pages. Sans rang ni curseur, la
    /// passerelle sert la première page KEYSET (`nextCursor` dans
    /// `NotificationPagination`, déjà déclaré) ; `cursor` reprend la suite.
    /// `offset` reste formulable — le repli de compatibilité, jamais le défaut
    /// — et le curseur GAGNE quand les deux sont donnés : un appelant qui
    /// tient un curseur tient déjà mieux qu'un rang.
    public func list(
        offset: Int? = nil,
        cursor: String? = nil,
        limit: Int = 20,
        unreadOnly: Bool = false
    ) async throws -> NotificationListResponse {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        } else if let offset {
            queryItems.append(URLQueryItem(name: "offset", value: "\(offset)"))
        }
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
