import Foundation
@testable import MeeshySDK

final class MockAPIClient: APIClientProviding, @unchecked Sendable {
    var baseURL: String = "https://mock.api"
    var authToken: String?
    var anonymousSessionToken: String?
    /// Le jeton que rendrait un rafraîchissement — `nil` : rien à rafraîchir.
    var freshAuthTokenStub: String?

    func freshAuthToken() async -> String? { freshAuthTokenStub ?? authToken }

    // MARK: - Recording

    struct RecordedRequest: @unchecked Sendable {
        let endpoint: String
        let method: String
        let bodyJSON: [String: Any]?
        let queryItems: [URLQueryItem]?
        /// Extra headers passed via `requestWithHeaders` (e.g. `X-Client-Mutation-Id`,
        /// an explicit `Authorization` override). `nil` for requests made via the
        /// headerless `request`/`post`/... entry points.
        let headers: [String: String]?
        /// La politique de refus que l'appelant a DEMANDÉE (`TypedRefusals`
        /// la passe à `.structured`) : sans elle, perdre l'enveloppe ne
        /// rougit aucun test (#14708).
        var rejectionPolicy: MeeshyEndpointRejectionPolicy? = nil

        var path: String { endpoint }
    }

    private let recorded = Locked<[RecordedRequest]>([])

    var requests: [RecordedRequest] { recorded.read { $0 } }

    var lastRequest: RecordedRequest? { requests.last }
    var requestCount: Int { requests.count }

    // MARK: - Stubbing

    private var stubs: [String: Any] = [:]
    var errorToThrow: Error?

    /// Per-endpoint errors — take precedence over `errorToThrow` when set.
    private var endpointErrors: [String: Error] = [:]

    /// Stub a specific endpoint to throw `error` instead of returning a stub value.
    /// Used to simulate structured error responses (e.g. 403 consent payloads).
    func stubError(_ endpoint: String, error: Error) {
        endpointErrors[endpoint] = error
    }

    /// Typed error thrown when a request hits an endpoint with no registered stub.
    /// Replaces the previous `fatalError` which caused process crashes when async
    /// background tasks (e.g. `ConversationSyncEngine.didReconnect → syncSinceLastCheckpoint`)
    /// fired against a mock that hadn't seeded the relevant endpoint.
    enum NoStubError: Error, CustomStringConvertible {
        case missing(endpoint: String, type: String, available: [String])
        var description: String {
            switch self {
            case .missing(let endpoint, let type, let available):
                return "MockAPIClient: no stub for '\(endpoint)' returning \(type). Available stubs: \(available)"
            }
        }
    }

    /// Erreur choisie REQUÊTE PAR REQUÊTE, après enregistrement — pour un
    /// double qui refuse une requête d'un lot et accepte sa voisine sur la
    /// même adresse (#10483 : les `open` refusés, les vues acceptées).
    var errorForRequest: ((RecordedRequest) -> Error?)?

    func stub<T>(_ endpoint: String, result: T) {
        stubs[endpoint] = result
    }

    /// La charge telle que la passerelle la SERT, décodée par le décodeur de
    /// `APIClient` dans le type que le SERVICE demande (#15996). Un stub typé
    /// fabrique la valeur déjà décodée et ne peut donc pas voir qu'un service
    /// demande `[String: String]` là où la passerelle met un booléen.
    private var wireStubs: [String: Data] = [:]

    func stubWire(_ endpoint: String, json: String) {
        wireStubs[endpoint] = Data(json.utf8)
    }

    /// Les pages d'un même chemin, servies DANS L'ORDRE (la dernière se répète) :
    /// un double indexé par chemin ne sait sinon rendre qu'une réponse par adresse.
    private let wireSequences = Locked<[String: [Data]]>([:])

    func stubWireSequence(_ endpoint: String, jsons: [String]) {
        wireSequences.mutate { $0[endpoint] = jsons.map { Data($0.utf8) } }
    }

    private func nextSequencedWire(_ endpoint: String) -> Data? {
        wireSequences.mutate { (sequences: inout [String: [Data]]) -> Data? in
            guard var pages = sequences[endpoint], let first = pages.first else { return nil }
            if pages.count > 1 { pages.removeFirst() }
            sequences[endpoint] = pages
            return first
        }
    }

    private func stubbed<T: Decodable>(_ endpoint: String, as type: T.Type) async throws -> T {
        if let wire = nextSequencedWire(endpoint) {
            return try await APIClient.decodeOffMain(T.self, from: wire)
        }
        if let wire = wireStubs[endpoint] {
            return try await APIClient.decodeOffMain(T.self, from: wire)
        }
        guard let result = stubs[endpoint] as? T else {
            throw NoStubError.missing(endpoint: endpoint, type: "\(T.self)", available: Array(stubs.keys))
        }
        return result
    }

    // MARK: - Reset

    func reset() {
        recorded.mutate { $0.removeAll() }
        stubs.removeAll()
        wireStubs.removeAll()
        wireSequences.mutate { $0.removeAll() }
        errorToThrow = nil
        endpointErrors.removeAll()
        authToken = nil
        freshAuthTokenStub = nil
        anonymousSessionToken = nil
    }

    // MARK: - APIClientProviding

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
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: method, bodyData: body, queryItems: queryItems)
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: T.self)
    }

    /// Overrides the protocol's default (header-dropping) fallback so tests
    /// can assert on explicit headers (`X-Client-Mutation-Id`, an explicit
    /// `Authorization` override) instead of silently losing them.
    func requestWithHeaders<T: Decodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]?,
        headers: [String: String]?
    ) async throws -> T {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: method, bodyData: body, queryItems: queryItems, headers: headers)
        if let last = requests.last, let error = errorForRequest?(last) { throw error }
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: T.self)
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
        return try await request(typedEndpoint, method: "GET", body: nil, queryItems: nil)
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
        return try await request(typedEndpoint, method: "GET", body: nil, queryItems: nil)
    }

    func post<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: "POST", encodableBody: body)
        if let error = endpointErrors[endpoint] { throw error }
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: APIResponse<T>.self)
    }

    func put<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: "PUT", encodableBody: body)
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: APIResponse<T>.self)
    }

    func patch<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: "PATCH", encodableBody: body)
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: APIResponse<T>.self)
    }

    func delete(_ typedEndpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        return try await request(typedEndpoint, method: "DELETE", body: nil, queryItems: nil)
    }

    func delete<T: Decodable, U: Encodable>(
        _ typedEndpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        // La table de stubs reste indexée par CHEMIN : un double n'a pas de
        // réseau, il a une table, et le chemin est la clé que les témoins
        // écrivent déjà. `legacyPath(for:)` la donne (#4282).
        let endpoint = legacyPath(for: typedEndpoint)
        recordRequest(endpoint: endpoint, rejectionPolicy: typedEndpoint.rejectionPolicy, method: "DELETE", encodableBody: body)
        if let error = errorToThrow { throw error }
        return try await stubbed(endpoint, as: APIResponse<T>.self)
    }

    // MARK: - Internal recording helpers

    private func recordRequest(
        endpoint: String, rejectionPolicy: MeeshyEndpointRejectionPolicy, method: String, bodyData: Data?,
        queryItems: [URLQueryItem]? = nil, headers: [String: String]? = nil
    ) {
        let json = bodyData.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let recordedRequest = RecordedRequest(
            endpoint: endpoint, method: method, bodyJSON: json, queryItems: queryItems, headers: headers,
            rejectionPolicy: rejectionPolicy
        )
        recorded.mutate { $0.append(recordedRequest) }
    }

    private func recordRequest<U: Encodable>(
        endpoint: String, rejectionPolicy: MeeshyEndpointRejectionPolicy, method: String, encodableBody: U
    ) {
        let data = try? JSONEncoder().encode(encodableBody)
        let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let recordedRequest = RecordedRequest(
            endpoint: endpoint, method: method, bodyJSON: json, queryItems: nil, headers: nil,
            rejectionPolicy: rejectionPolicy
        )
        recorded.mutate { $0.append(recordedRequest) }
    }
}
