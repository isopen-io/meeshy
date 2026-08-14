import Foundation

// MARK: - Protocol

/// Accès au répertoire persisté côté serveur.
///
/// À la différence de `ContactMatchServiceProviding` (rapprochement éphémère,
/// rien n'est conservé), ce service SYNCHRONISE le carnet d'adresses : le
/// répertoire survit à la session et se recharge sans re-scanner l'appareil.
public protocol ContactDirectoryServiceProviding: Sendable {
    /// Envoie le carnet et renvoie le bilan de la synchronisation.
    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult
    /// Page du répertoire conservé.
    func list(offset: Int, limit: Int, filter: DirectoryFilter, query: String?) async throws
        -> OffsetPaginatedAPIResponse<[DirectoryContact]>
    /// Efface l'intégralité du répertoire conservé.
    func clear() async throws -> DirectoryClearResult
}

public extension ContactDirectoryServiceProviding {
    func list(offset: Int = 0, limit: Int = 100) async throws
        -> OffsetPaginatedAPIResponse<[DirectoryContact]> {
        try await list(offset: offset, limit: limit, filter: .all, query: nil)
    }
}

// MARK: - Service

public final class ContactDirectoryService: ContactDirectoryServiceProviding, @unchecked Sendable {
    public static let shared = ContactDirectoryService()
    private let api: APIClientProviding

    init(api: APIClientProviding = APIClient.shared) {
        self.api = api
    }

    public func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult {
        let response: APIResponse<DirectorySyncResult> = try await api.post(
            endpoint: "/users/me/contacts/sync", body: request
        )
        return response.data
    }

    public func list(
        offset: Int,
        limit: Int,
        filter: DirectoryFilter,
        query: String?
    ) async throws -> OffsetPaginatedAPIResponse<[DirectoryContact]> {
        var items = [
            URLQueryItem(name: "offset", value: String(offset)),
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "filter", value: filter.rawValue)
        ]
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "q", value: query))
        }
        return try await api.request(
            endpoint: "/users/me/contacts",
            method: "GET",
            body: nil,
            queryItems: items
        )
    }

    public func clear() async throws -> DirectoryClearResult {
        let response: APIResponse<DirectoryClearResult> = try await api.request(
            endpoint: "/users/me/contacts",
            method: "DELETE",
            body: nil,
            queryItems: nil
        )
        return response.data
    }
}
