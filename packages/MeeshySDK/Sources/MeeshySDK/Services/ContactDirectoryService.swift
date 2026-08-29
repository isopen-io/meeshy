import Foundation

// MARK: - Protocol

/// Accès au répertoire persisté côté serveur.
///
/// À la différence de `ContactMatchServiceProviding` (rapprochement éphémère,
/// rien n'est conservé), ce service SYNCHRONISE le carnet d'adresses : le
/// répertoire survit à la session et se recharge sans re-scanner l'appareil.
public protocol ContactDirectoryServiceProviding: Sendable {
    /// Envoie le carnet et renvoie le bilan de la synchronisation.
    ///
    /// Le MODE est le VERBE (#4163) : `replace` purge ce que la charge ne
    /// contient pas, `merge` ne purge jamais. Il voyageait dans le corps — un
    /// champ qu'aucun intermédiaire ne peut lire, et qui rendait indiscernables
    /// deux requêtes dont l'une PURGE.
    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult
    /// Une page du répertoire, par CURSEUR, avec delta optionnel.
    func page(cursor: String?, limit: Int, filter: DirectoryFilter, query: String?, updatedSince: Date?) async throws
        -> PaginatedAPIResponse<[DirectoryContact]>
    /// Efface l'intégralité du répertoire conservé.
    func clear() async throws -> DirectoryClearResult
}

public extension ContactDirectoryServiceProviding {
    func page(cursor: String? = nil, limit: Int = 100) async throws
        -> PaginatedAPIResponse<[DirectoryContact]> {
        try await page(cursor: cursor, limit: limit, filter: .all, query: nil, updatedSince: nil)
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
        // `PUT` remplace, `PATCH` fusionne — et le corps ne porte plus de
        // `mode`. Deux requêtes dont l'une PURGE ne doivent pas se ressembler.
        let response: APIResponse<DirectorySyncResult> = try await api.request(
            endpoint: "/directory/contacts",
            method: request.mode == .replace ? "PUT" : "PATCH",
            body: try JSONEncoder().encode(request),
            queryItems: nil
        )
        return response.data
    }

    /// Une page par CURSEUR — et un DELTA quand `updatedSince` est fourni.
    ///
    /// La lecture par décalage repayait un dénombrement complet à chaque page,
    /// et l'appelant paginait par 200 jusqu'à 250 pages : sans delta ni ETag,
    /// chaque revalidation retéléchargeait le répertoire ENTIER.
    ///
    /// `updatedSince` se remplit avec l'`appliedAt` que rend une
    /// synchronisation : ce que le serveur vient d'écrire est exactement ce
    /// qu'il reste à relire.
    public func page(
        cursor: String?,
        limit: Int,
        filter: DirectoryFilter,
        query: String?,
        updatedSince: Date?
    ) async throws -> PaginatedAPIResponse<[DirectoryContact]> {
        var items = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "filter", value: filter.rawValue)
        ]
        if let cursor, !cursor.isEmpty {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if let query, !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "q", value: query))
        }
        if let updatedSince {
            items.append(URLQueryItem(name: "updatedSince", value: ISO8601DateFormatter().string(from: updatedSince)))
        }
        return try await api.request(
            endpoint: "/directory/contacts",
            method: "GET",
            body: nil,
            queryItems: items
        )
    }

    public func clear() async throws -> DirectoryClearResult {
        let response: APIResponse<DirectoryClearResult> = try await api.request(
            endpoint: "/directory/contacts",
            method: "DELETE",
            body: nil,
            queryItems: nil
        )
        return response.data
    }
}
