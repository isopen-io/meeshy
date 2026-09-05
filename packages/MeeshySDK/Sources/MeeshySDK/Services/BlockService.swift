import Foundation
import Combine

public struct BlockedUser: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let blockedAt: Date?

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        blockedAt: Date? = nil
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.blockedAt = blockedAt
    }

    public var name: String {
        displayName ?? username
    }
}

// MARK: - Protocol

public protocol BlockServiceProviding: Sendable {
    var blockedUserIds: Set<String> { get }
    func blockUser(userId: String) async throws
    func unblockUser(userId: String) async throws
    func listBlockedUsers() async throws -> [BlockedUser]
    func isBlocked(userId: String) -> Bool
    @MainActor func setBlockedOptimistic(userId: String, blocked: Bool)
    func refreshCache() async
}

public final class BlockService: ObservableObject, BlockServiceProviding, @unchecked Sendable {
    public static let shared = BlockService()
    private let api: APIClientProviding

    @Published public private(set) var blockedUserIds: Set<String> = []

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    // MARK: - Block

    /// Bloquer — `PUT`, parce que c'est une APPARTENANCE À UN ENSEMBLE (#4164).
    ///
    /// `POST /users/{id}/block` modélisait une ACTION et rendait `409` au
    /// second appel. Or l'état visé est atteint dans les deux cas, et ce 409
    /// obligeait l'appelant à traiter comme une erreur ce qui est un succès —
    /// à commencer par la file hors ligne, qui rejoue des mutations
    /// enregistrées avant une mise à jour.
    public func blockUser(userId: String) async throws {
        let _: APIResponse<BlockActionResponse> = try await api.request(
            DirectoryEndpoint.blocksByUserId(userId: userId),
            method: "PUT",
            body: try JSONEncoder().encode([String: String]()),
            queryItems: nil
        )
        await MainActor.run { _ = blockedUserIds.insert(userId) }
    }

    // MARK: - Unblock

    public func unblockUser(userId: String) async throws {
        let _: APIResponse<BlockActionResponse> = try await api.request(
            DirectoryEndpoint.blocksByUserId(userId: userId),
            method: "DELETE",
            body: nil,
            queryItems: nil
        )
        await MainActor.run { _ = blockedUserIds.remove(userId) }
    }

    // MARK: - List

    /// La liste, désormais BORNÉE côté serveur (100 par page).
    ///
    /// Elle ne l'était par rien : ni page, ni curseur, ni plafond. Ce site sert
    /// à hydrater la blocklist locale, dont la taille est celle d'un usage
    /// humain ; il lit donc la première page et s'en tient là. Le jour où un
    /// compte dépasse le plafond, c'est le curseur de la route qui répondra —
    /// pas une liste sans fin.
    public func listBlockedUsers() async throws -> [BlockedUser] {
        let response: APIResponse<[BlockedUser]> = try await api.request(
            DirectoryEndpoint.blocks
        )
        let users = response.data
        await MainActor.run { blockedUserIds = Set(users.map(\.id)) }
        return users
    }

    // MARK: - Local Cache

    public func isBlocked(userId: String) -> Bool {
        blockedUserIds.contains(userId)
    }

    /// R6-4 — mutation PUREMENT LOCALE de la blocklist canonique, sans réseau.
    /// Le chemin outbox (`OfflineQueue.enqueue(.blockUser/.unblockUser)`) l'appelle
    /// pour flipper `blockedUserIds` de manière optimiste (les swipe labels lisent
    /// `isBlocked`) ; le dispatcher possède le POST/DELETE réel. La réciproque
    /// (`blocked: false` sur un block, ou l'inverse) sert au rollback sur
    /// `.exhausted`. Ne JAMAIS l'utiliser pour un block réseau — c'est
    /// `blockUser(userId:)` qui fait le round-trip.
    @MainActor
    public func setBlockedOptimistic(userId: String, blocked: Bool) {
        if blocked {
            blockedUserIds.insert(userId)
        } else {
            blockedUserIds.remove(userId)
        }
    }

    public func refreshCache() async {
        _ = try? await listBlockedUsers()
    }

    // MARK: - Session quiesce (P1 — logout)

    /// Purge la blocklist en mémoire pour que la session suivante (autre user
    /// sur le même device) ne voie pas la blocklist du user précédent avant
    /// le prochain refresh réseau. Câblée depuis `AuthManager.logout()`.
    public func reset() async {
        await MainActor.run { blockedUserIds.removeAll() }
    }
}

public struct BlockActionResponse: Decodable {
    public let message: String?
}
