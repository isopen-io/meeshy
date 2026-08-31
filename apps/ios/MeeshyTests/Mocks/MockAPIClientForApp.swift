import Foundation
import MeeshySDK
import XCTest

/// Une adresse FICTIVE, pour les témoins qui doivent en désigner une que le
/// serveur ne sert pas — « aucun stub », « échec », « /a puis /b ».
///
/// Le protocole ne prend plus que des adresses typées (#4282), et c'est
/// voulu : un site de PRODUCTION ne doit pas pouvoir écrire un chemin. Un
/// témoin, lui, a besoin d'exprimer l'inexistant — c'est la moitié de son
/// travail. Ce type le lui permet sans rouvrir la porte au code de production,
/// puisqu'il vit dans la cible de test.
/// (Nommée `FictionalEndpoint` et non `TestEndpoint` : le serveur sert bien une
/// route `/api/v1/test`, donc le catalogue GÉNÉRÉ porte déjà un
/// `TestEndpoint`. La collision aurait été silencieuse à l'écriture et
/// déroutante à la lecture.)
struct FictionalEndpoint: MeeshyEndpoint {
    let path: String
    init(_ path: String) { self.path = path }
}

final class MockAPIClientForApp: APIClientProviding, @unchecked Sendable {

    // MARK: - State

    var baseURL: String = "https://mock.api"
    var authToken: String?
    var anonymousSessionToken: String?

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    // MARK: - Call Tracking

    var requestCount = 0
    var requestEndpoints: [String] = []
    var requestMethods: [String] = []
    var postCount = 0
    var putCount = 0
    var patchCount = 0
    var deleteCount = 0
    /// Corps POST encodés (JSONEncoder), dans l'ordre d'appel — pour asserter
    /// le payload réellement mis sur le fil (clés présentes ET absentes).
    var lastPostBodies: [Data] = []

    // MARK: - Stub Registration

    func stub<T>(_ endpoint: String, result: T) {
        stubs[endpoint] = result
    }

    // MARK: - Protocol Methods

    func request<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?
    ) async throws -> T {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append(method)
        // Corps déjà encodé par l'appelant (`FeedViewModel.createBorrowedSoundPost`
        // passe par ce chemin brut plutôt que par `post<T,U>`) — même point de
        // capture, même ordre : AVANT le throw, pour que le corps reste
        // observable même quand le test court-circuite la réponse.
        if let body { lastPostBodies.append(body) }
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? T else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for endpoint '\(endpoint)' returning \(T.self)"])
        }
        return result
    }

    /// Le repli par défaut du protocole a été retiré (#4282) : un double doit
    /// désormais implémenter aussi la variante à en-têtes. Elle délègue à
    /// `request`, comme le faisait ce repli — les en-têtes ne sont pas
    /// enregistrés ici, et ce double n'en assertait aucun.
    func requestWithHeaders<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        try await request(typedEndpoint, method: method, body: body, queryItems: queryItems)
    }

    func paginatedRequest<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        cursor: String?,
        limit: Int
    ) async throws -> PaginatedAPIResponse<[T]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("GET")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? PaginatedAPIResponse<[T]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for paginated endpoint '\(endpoint)'"])
        }
        return result
    }

    func offsetPaginatedRequest<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        offset: Int,
        limit: Int
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("GET")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? OffsetPaginatedAPIResponse<[T]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for offset paginated endpoint '\(endpoint)'"])
        }
        return result
    }

    func post<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        postCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("POST")
        if let data = try? JSONEncoder().encode(body) { lastPostBodies.append(data) }
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for POST endpoint '\(endpoint)'"])
        }
        return result
    }

    func put<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        putCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("PUT")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for PUT endpoint '\(endpoint)'"])
        }
        return result
    }

    func patch<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        patchCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("PATCH")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for PATCH endpoint '\(endpoint)'"])
        }
        return result
    }

    func delete(_ typedEndpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        deleteCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("DELETE")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<[String: Bool]> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for DELETE endpoint '\(endpoint)'"])
        }
        return result
    }

    func delete<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        deleteCount += 1
        requestCount += 1
        requestEndpoints.append(endpoint)
        requestMethods.append("DELETE")
        if let error = errorToThrow { throw error }
        guard let result = stubs[endpoint] as? APIResponse<T> else {
            throw NSError(domain: "MockAPIClientForApp", code: -1, userInfo: [NSLocalizedDescriptionKey: "No stub for DELETE endpoint '\(endpoint)'"])
        }
        return result
    }

    // MARK: - Reset

    func reset() {
        baseURL = "https://mock.api"
        authToken = nil
        anonymousSessionToken = nil
        stubs.removeAll()
        errorToThrow = nil
        requestCount = 0
        requestEndpoints.removeAll()
        requestMethods.removeAll()
        postCount = 0
        putCount = 0
        patchCount = 0
        deleteCount = 0
        lastPostBodies.removeAll()
    }
}
