import Foundation

// MARK: - Le CONTRAT d'un client d'API (#4282)
//
// Extrait d'`APIClient.swift`, qui passait 1100 lignes en gagnant les verbes
// typés — le budget se paie par une DÉCOUPE PAR RESPONSABILITÉ, pas par une
// tranche. Ici vit ce qu'un client doit SAVOIR FAIRE ; là-bas, comment
// `APIClient` le fait.
//
// La frontière est nette : ce fichier ne connaît ni `URLSession`, ni les
// jetons, ni la politique de réessai. Il déclare neuf verbes, tous sur une
// adresse TYPÉE, et donne aux conformants la seule chose dont ils ont besoin
// pour les servir depuis une table indexée par chemin : `legacyPath(for:)`.

public protocol APIClientProviding: Sendable {
    var baseURL: String { get }
    var authToken: String? { get set }
    var anonymousSessionToken: String? { get set }

    // #4282 — les verbes ne prennent plus QUE des adresses typées.
    //
    // Leurs jumelles à `String` ont été retirées, et c'est cette suppression —
    // non une garde — qui rend un chemin écrit à la main impossible à passer :
    // il n'existe plus de signature qui l'accepte. Un catalogue qu'on peut
    // contourner ne prouve rien.
    //
    // L'unique entrée qui part encore d'une chaîne est
    // `APIClient.replayPersistedRequest(persistedPath:…)`, et son nom dit
    // pourquoi : un chemin lu du DISQUE, écrit par une version antérieure de
    // l'app, à qui aucun type ne survit.
    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?, queryItems: [URLQueryItem]?) async throws -> T
    func requestWithHeaders<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?, queryItems: [URLQueryItem]?, headers: [String: String]?) async throws -> T
    func post<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T>
    func put<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T>
    func patch<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T>
    func delete(_ endpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]>
    func delete<T: Decodable, U: Encodable>(_ endpoint: any MeeshyEndpoint, body: U) async throws -> APIResponse<T>
    func paginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint, cursor: String?, limit: Int) async throws -> PaginatedAPIResponse<[T]>
    func offsetPaginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[T]>
}

public extension APIClientProviding {

    /// La forme que les conformants à `String` attendent : le chemin PRIVÉ de
    /// son préfixe d'API, tel que les 348 sites d'appel l'écrivent aujourd'hui.
    ///
    /// Sans ce retrait, un double de test enregistrerait `/api/v1/auth/login`
    /// là où ses assertions attendent `/auth/login` — la migration casserait
    /// des témoins qui ne portent pas sur elle, et la seule façon de les
    /// réparer serait de les réécrire un par un. Le préfixe est lu sur la
    /// CONFIGURATION, jamais écrit en dur : un environnement qui sert sous un
    /// autre préfixe garderait sinon son préfixe dans le chemin.
    ///
    /// Les quatorze routes hors `/api/v1` (`/health`, `/api/conversations/…`)
    /// ne commencent pas par ce préfixe et passent donc INCHANGÉES — c'est
    /// exactement pour elles que le catalogue stocke le chemin complet.
    func legacyPath(for endpoint: any MeeshyEndpoint) -> String {
        let prefix = URL(string: MeeshyConfig.shared.apiBaseURL)?.path ?? ""
        guard !prefix.isEmpty, endpoint.path.hasPrefix(prefix) else { return endpoint.path }
        return String(endpoint.path.dropFirst(prefix.count))
    }

    // Les REPLIS par défaut ont été retirés (#4282).
    //
    // Ils retombaient sur les jumelles à `String`, qui n'existent plus au
    // protocole. Les garder aurait demandé de les réintroduire — c'est-à-dire
    // de laisser au conformant une façon d'accepter un chemin écrit à la main,
    // ce que ce lot existe pour rendre impossible.
    //
    // Conséquence assumée : un double de test implémente les neuf verbes
    // typés. Il n'a pas de réseau, il a une table indexée par chaîne, et
    // `legacyPath(for:)` ci-dessus lui donne la clé — deux lignes par verbe.
}

public extension APIClientProviding {
    // Les commodités à `String` ont été retirées avec le reste (#4282).
    //
    // Elles n'ajoutaient que des valeurs par défaut (`method: "GET"`,
    // `body: nil`) autour d'une signature qui n'existe plus. Leurs jumelles
    // TYPÉES portent ces défauts directement dans leurs paramètres.

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint) async throws -> T {
        try await request(endpoint, method: "GET", body: nil, queryItems: nil)
    }

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String) async throws -> T {
        try await request(endpoint, method: method, body: nil, queryItems: nil)
    }

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, body: Data?) async throws -> T {
        try await request(endpoint, method: method, body: body, queryItems: nil)
    }

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, queryItems: [URLQueryItem]?) async throws -> T {
        try await request(endpoint, method: "GET", body: nil, queryItems: queryItems)
    }

    func request<T: Decodable>(_ endpoint: any MeeshyEndpoint, method: String, queryItems: [URLQueryItem]?) async throws -> T {
        try await request(endpoint, method: method, body: nil, queryItems: queryItems)
    }

    func requestWithHeaders<T: Decodable>(
        _ endpoint: any MeeshyEndpoint, method: String = "GET", body: Data? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        try await requestWithHeaders(endpoint, method: method, body: body,
                                     queryItems: queryItems, headers: nil)
    }

    func paginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint) async throws -> PaginatedAPIResponse<[T]> {
        try await paginatedRequest(endpoint, cursor: nil, limit: 20)
    }

    func offsetPaginatedRequest<T: Decodable>(_ endpoint: any MeeshyEndpoint) async throws -> OffsetPaginatedAPIResponse<[T]> {
        try await offsetPaginatedRequest(endpoint, offset: 0, limit: 15)
    }
}
