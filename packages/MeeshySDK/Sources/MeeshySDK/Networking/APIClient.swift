import Foundation
import Security
import os

// MARK: - API Client Protocol

// MARK: - API Client

public final class APIClient: APIClientProviding, @unchecked Sendable {
    public static let shared = APIClient()

    // MARK: - Ce que le pipeline a besoin de savoir d'une adresse (#4282)

    /// L'adresse RÉSOLUE : l'URL absolue, l'étiquette de journal, et les deux
    /// politiques. Le pipeline ne voit plus de chemin — donc il ne peut plus en
    /// déduire quoi que ce soit par comparaison de chaîne.
    ///
    /// Les deux façons de la construire coexistent pendant la migration : par
    /// CHEMIN pour les sites d'appel non encore typés (les politiques sont
    /// alors déduites), par ADRESSE TYPÉE pour les autres (elles sont lues).
    /// `MeeshyEndpointPolicy` garantit que les deux rendent le même verdict.
    struct ResolvedEndpoint {
        let urlString: String
        let logLabel: String
        let authKind: MeeshyEndpointAuthKind
        let retryPolicy: MeeshyEndpointRetryPolicy
        let rejectionPolicy: MeeshyEndpointRejectionPolicy

        init(legacyPath: String, baseURL: String) {
            self.urlString = "\(baseURL)\(legacyPath)"
            self.logLabel = legacyPath
            self.authKind = MeeshyEndpointPolicy.authKind(forLegacyPath: legacyPath)
            self.retryPolicy = MeeshyEndpointPolicy.retryPolicy(forLegacyPath: legacyPath)
            self.rejectionPolicy = MeeshyEndpointPolicy.rejectionPolicy(forLegacyPath: legacyPath)
        }

        init(endpoint: any MeeshyEndpoint) {
            self.urlString = endpoint.absoluteURLString
            self.logLabel = endpoint.path
            self.authKind = endpoint.authKind
            self.retryPolicy = endpoint.retryPolicy
            self.rejectionPolicy = endpoint.rejectionPolicy
        }
    }

    public var baseURL: String {
        MeeshyConfig.shared.apiBaseURL
    }

    /// Exposed for tests and for the upload pipeline that needs custom delegate hooks.
    /// HTTP/3 n'est PAS supposé (#10927) : Traefik n'écoute pas l'UDP 443.
    public let urlSession: URLSession

    private var session: URLSession { urlSession }
    let decoder: JSONDecoder
    let logger = MeeshyLog.logger(.network, subsystem: .legacySDK)

    // Responses are decoded OFF the main thread. APIClient lives in a module built
    // with SE-0461 (NonisolatedNonsendingByDefault), so a nonisolated async request
    // method runs on its caller — typically a @MainActor view model — and the
    // JSONDecoder work would otherwise land on the main thread for every list
    // payload (conversations / messages / feed): a real hitch during loads and
    // pagination. The serial queue + single reused decoder are race-free; the value
    // is smuggled back through an unchecked box so callers keep plain `Decodable`
    // (non-Sendable) response types.
    private static let offMainDecoder: JSONDecoder = MeeshyCoders.decoder(.api)

    private static let decodeQueue = DispatchQueue(label: "me.meeshy.api.decode", qos: .userInitiated)
    private struct DecodeBox<V>: @unchecked Sendable { let value: V }

    /// Encapsule TOUTE l'opération de décodage (décodage générique + reprise de la
    /// `continuation`, qui matérialisent le métatype `T.Type` non-`Sendable`) dans
    /// une box `@unchecked Sendable`. `run` est non-`@Sendable` : ses captures ne
    /// sont pas soumises au contrôle de concurrence, et le `decodeQueue.async` ne
    /// capture QUE la box (`Sendable`) en appelant `run()` (Void) — aucun métatype
    /// ne franchit la frontière `@Sendable`.
    private struct DecodeWork: @unchecked Sendable { let run: () -> Void }

    static func decodeOffMain<T: Decodable>(_ type: T.Type, from data: Data) async throws -> T {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<DecodeBox<T>, Error>) in
            // Tout le décodage générique ET la reprise de la `continuation`
            // (qui matérialisent le métatype `T.Type`, non-`Sendable`) sont
            // enfermés dans `run` — closure non-`@Sendable` stockée dans la box
            // `@unchecked Sendable`. Le `decodeQueue.async` ne capture donc QUE la
            // box et appelle `run()` (Void) : aucun `T.Type` ne franchit la frontière.
            let work = DecodeWork {
                do {
                    continuation.resume(returning: DecodeBox(value: try offMainDecoder.decode(type, from: data)))
                } catch {
                    continuation.resume(throwing: error)
                }
            }
            decodeQueue.async { work.run() }
        }.value
    }

    // net-09 — les deux tokens étaient des vars nues sur une classe
    // @unchecked Sendable : data race lecture header / écriture refresh, et
    // paire mixte observable au switch (13 paires déchirées mesurées par le
    // test de stress sur l'implémentation non verrouillée). Un seul verrou
    // pour la PAIRE : les getters/setters existants restent source-compatibles
    // (protocole APIClientProviding inchangé), setTokens/currentTokens
    // offrent la lecture/écriture atomique du couple. Prior art du pattern :
    // CallManager.isCallActiveFlag.
    private let tokenLock = OSAllocatedUnfairLock<InstalledTokens>(initialState: InstalledTokens())

    /// La paire, et la GÉNÉRATION du jeton installé (#10904) : elle change à
    /// chaque fois que le jeton de compte change de valeur. Une requête la
    /// capture avec le jeton qu'elle présente ; au retour d'un 401, une
    /// génération inchangée dit que ce jeton est TOUJOURS celui du client —
    /// même un aller-retour A → B → A, qui réinstalle le même jeton, la change.
    struct InstalledTokens {
        var auth: String?
        var anon: String?
        var generation: UInt64 = 0

        mutating func setAuth(_ value: String?) {
            if auth != value { generation &+= 1 }
            auth = value
        }
    }

    public var authToken: String? {
        get { tokenLock.withLock { $0.auth } }
        set { tokenLock.withLock { $0.setAuth(newValue) } }
    }

    public var anonymousSessionToken: String? {
        get { tokenLock.withLock { $0.anon } }
        set { tokenLock.withLock { $0.anon = newValue } }
    }

    /// Le jeton de session d'un compte INSCRIT — distinct de l'anonyme (#4213).
    ///
    /// Il ne sert pas à s'authentifier : c'est le JWT qui le fait. Il sert à
    /// DIRE QUELLE SESSION une connexion représente, ce dont le handshake
    /// Socket.IO a besoin pour qu'une révocation puisse couper le bon socket —
    /// et lui seul.
    ///
    /// Il vit ici, sous le même verrou que les deux autres, parce que le
    /// transport le lit depuis un contexte NON isolé : `AuthManager`, isolé
    /// `@MainActor`, ne peut pas être interrogé au milieu d'une construction
    /// synchrone de `SocketManager`.
    private let registeredSessionLock = OSAllocatedUnfairLock<String?>(initialState: nil)

    public var registeredSessionToken: String? {
        get { registeredSessionLock.withLock { $0 } }
        set { registeredSessionLock.withLock { $0 = newValue } }
    }

    /// L'identifiant à présenter au gateway, et SOUS QUEL EN-TÊTE.
    ///
    /// Deux populations, deux protocoles : un inscrit s'annonce par
    /// `Authorization: Bearer <JWT>`, un invité de lien par
    /// `X-Session-Token: <anon_…>`. Ce n'est pas un détail de transport — le
    /// gateway lit les deux dans des middlewares différents, et présenter un
    /// jeton anonyme en `Bearer` fait répondre « Invalid JWT token ».
    ///
    /// Porter l'en-tête AVEC la valeur est le point : un `String` nu oblige
    /// chaque appelant à SUPPOSER le protocole, et le web a payé exactement
    /// cette supposition (`fix(web)` du 2026-08-18) — tout appel d'un visiteur
    /// sans compte partait sans identifiant utilisable.
    public var requestCredential: MeeshyRequestCredential? {
        presentedCredential().credential
    }

    /// #10904 — ce qu'une requête PRÉSENTE, lu d'un seul tenant : l'identité,
    /// et, pour un compte, son jeton et la génération de ce jeton.
    func presentedCredential() -> (credential: MeeshyRequestCredential?, bearer: PresentedBearer?) {
        let pair = tokenLock.withLock { $0 }
        if let auth = pair.auth {
            return (.bearer(auth), PresentedBearer(token: auth, generation: pair.generation))
        }
        if let anon = pair.anon {
            return (.anonymousSession(anon), nil)
        }
        return (nil, nil)
    }

    /// #10904 — le jeton de compte qu'une requête a mis sur le fil, et la
    /// génération du client à ce moment-là.
    struct PresentedBearer {
        let token: String
        /// `nil` : ce jeton n'a jamais été celui du client (un jeton rafraîchi
        /// pour un autre client) — il ne rafraîchit rien de lui-même.
        let generation: UInt64?
    }

    /// Après un rafraîchissement, la requête porte `freshToken` : sa génération
    /// est celle du client s'il l'a installé, aucune sinon.
    func presentedBearerAfterRefresh(_ freshToken: String) -> PresentedBearer {
        let pair = tokenLock.withLock { $0 }
        return PresentedBearer(token: freshToken, generation: pair.auth == freshToken ? pair.generation : nil)
    }

    /// #10904 — le jeton de compte présenté sous `generation` est-il encore
    /// celui du client ?
    func isBearerStillInstalled(_ bearer: PresentedBearer) -> Bool {
        guard let generation = bearer.generation else { return false }
        return tokenLock.withLock { $0.generation == generation && $0.auth == bearer.token }
    }

    /// #10927 — `/sync` part par son propre transport (`SyncDeltaClient`) :
    /// sans ce relais, un JWT échu y partait tel quel après 24 h d'absence et
    /// le démarrage payait un 401 avant le repli REST, qui, lui, rafraîchit.
    /// Un rafraîchissement qui échoue (hors ligne, session quittée) rend le
    /// jeton tel qu'il est : le verdict reste au repli REST, qui sait dire
    /// « session expirée » sans prendre une coupure pour un refus.
    public func freshAuthToken() async -> String? {
        guard let bearer = presentedCredential().bearer else { return nil }
        guard AuthManager.isTokenExpired(bearer.token, now: Date()) else { return bearer.token }
        do {
            return try await AuthManager.shared.refreshSession(
                presentedToken: bearer.token,
                stillInstalled: isBearerStillInstalled(bearer),
                force: false
            )
        } catch {
            return bearer.token
        }
    }

    /// Écriture atomique de la paire — à préférer aux deux setters séparés
    /// quand les deux tokens changent ensemble (switch de compte).
    public func setTokens(auth: String?, anonymous: String?) {
        tokenLock.withLock { pair in
            pair.setAuth(auth)
            pair.anon = anonymous
        }
    }

    /// Lecture atomique de la paire — jamais un mélange de deux écritures.
    public func currentTokens() -> (auth: String?, anon: String?) {
        tokenLock.withLock { ($0.auth, $0.anon) }
    }

    private convenience init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        // HTTP RFC 7234 cache: exploite les ETag/304 renvoyés par le gateway pour
        // éviter les re-fetches inutiles. 10 MB mémoire + 50 MB disque.
        // iter-4: active le cache HTTP — la politique par défaut laisse NSURLCache inactif
        // pour les sessions authentifiées (Authorization header) sans ce paramétrage.
        config.urlCache = URLCache(
            memoryCapacity: 10 * 1_024 * 1_024,
            diskCapacity: 50 * 1_024 * 1_024,
            diskPath: "meeshy_http_cache"
        )
        config.requestCachePolicy = .useProtocolCachePolicy
        // #10927 — HTTP/3 reste découvert par Alt-Svc, comme URLSession le fait seul : le
        // SUPPOSER (`assumesHTTP3Capable`) tentait QUIC d'abord sur une passerelle qui n'écoute
        // pas l'UDP 443, et chaque connexion neuve payait ~150 ms d'échec avant le repli TCP.
        self.init(urlSession: URLSession(
            configuration: config,
            delegate: CertificatePinningDelegate(),
            delegateQueue: nil
        ))
    }

    /// Un client sur une session FOURNIE : les témoins y posent leur
    /// `URLProtocol` et observent ce qui part sur le fil (#10463).
    init(urlSession: URLSession) {
        self.urlSession = urlSession
        self.decoder = MeeshyCoders.decoder(.api)
    }

    /// T15b — purge le cache HTTP de la session (bodies ETag/304 des réponses
    /// REST). Appelé au logout : aucun payload d'un compte ne doit survivre
    /// sur disque à travers les sessions (même contrat que
    /// `CacheCoordinator.reset` / `clearAllMessagesForLogout`).
    public func clearHTTPCache() {
        urlSession.configuration.urlCache?.removeAllCachedResponses()
    }

    // MARK: - Generic Request

    /// Header-aware variant — see `APIClientProviding.requestWithHeaders`.
    /// Used by the offline outbox dispatcher to inject `X-Client-Mutation-Id`
    /// so the gateway `MutationLog` can dedup replayed mutations. Caller-
    /// provided headers OVERRIDE auth/content-type headers if the keys collide,
    /// so the dispatcher should not set `Authorization` or `Content-Type`.
    /// Le seul point où une CHAÎNE entre dans le pipeline.
    ///
    /// Interne, et sans jumelle publique : les verbes typés y arrivent par
    /// `legacyPath(for:)`, le rejeu hors-ligne par `replayPersistedRequest`.
    /// Aucun site d'appel ne peut l'atteindre depuis l'extérieur du module,
    /// donc aucun ne peut y passer un littéral.
    func stringRequest<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil,
        headers: [String: String]? = nil
    ) async throws -> T {
        try await requestWithHeaders(
            resolved: ResolvedEndpoint(legacyPath: endpoint, baseURL: baseURL),
            method: method, body: body, queryItems: queryItems, headers: headers
        )
    }

    /// **La seule entrée qui part encore d'une chaîne, et la seule qui doive.**
    ///
    /// `SettingsActionQueue` persiste des actions hors-ligne et les rejoue à la
    /// reconnexion. Le chemin qu'elle a stocké a été écrit par une version
    /// ANTÉRIEURE de l'app : aucun type ne lui survit, puisqu'un type n'existe
    /// qu'à la compilation et que l'enregistrement, lui, est sur le disque.
    ///
    /// Nommer l'exception vaut mieux que laisser un trou général. Qui appelle
    /// ceci pour une requête ordinaire lit, dans le nom, qu'il fait autre chose
    /// que ce qu'il croit — et une garde peut compter ses appelants.
    public func replayPersistedRequest<T: Decodable>(
        persistedPath: String,
        method: String,
        body: Data?,
        queryItems: [URLQueryItem]? = nil,
        headers: [String: String]? = nil
    ) async throws -> T {
        try await requestWithHeaders(
            resolved: ResolvedEndpoint(legacyPath: persistedPath, baseURL: baseURL),
            method: method, body: body, queryItems: queryItems, headers: headers
        )
    }

    /// La variante TYPÉE (#4282) — l'adresse porte son chemin complet et ses
    /// politiques, donc rien n'est déduit d'une chaîne.
    public func requestWithHeaders<T: Decodable>(
        _ endpoint: any MeeshyEndpoint,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil,
        headers: [String: String]? = nil
    ) async throws -> T {
        try await requestWithHeaders(
            resolved: ResolvedEndpoint(endpoint: endpoint),
            method: method, body: body, queryItems: queryItems, headers: headers
        )
    }

    /// **UNE requête, sous UN identifiant figé par l'appelant** (#9743).
    ///
    /// `requestWithHeaders` lit le jeton COURANT au moment de bâtir la
    /// requête, puis, sur un 401, le rafraîchit et REJOUE sous celui de la
    /// session du moment. Un appelant qui a vérifié « ce contenu appartient
    /// au compte A » ne peut donc pas garantir que la requête partira sous A :
    /// entre sa vérification et l'envoi, le compte a pu changer.
    ///
    /// Ici le jeton est un ARGUMENT : c'est celui que l'appelant vient de
    /// vérifier, il signe cette requête et aucune autre, et rien ne le
    /// remplace — ni rafraîchissement, ni rejeu. Un 401 est rendu tel quel,
    /// sans déconnecter la session courante, qui n'est peut-être pas la sienne.
    public func requestPinned<T: Decodable>(
        _ endpoint: any MeeshyEndpoint,
        method: String,
        body: Data?,
        headers: [String: String],
        bearerToken: String
    ) async throws -> T {
        let resolved = ResolvedEndpoint(endpoint: endpoint)
        guard !bearerToken.isEmpty,
              let components = URLComponents(string: resolved.urlString),
              !Self.containsEmptyPathSegment(components.path),
              let url = components.url else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        for (key, value) in await ClientInfoProvider.shared.buildHeaders() {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }
        for (key, value) in headers where key.caseInsensitiveCompare("Authorization") != .orderedSame {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        // Posé EN DERNIER, et jamais remplaçable par un en-tête de l'appelant.
        urlRequest.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: urlRequest)
        guard let statusCode = (response as? HTTPURLResponse)?.statusCode else {
            throw MeeshyError.server(statusCode: 0, message: "Aucune donnee recue")
        }
        guard (200...299).contains(statusCode) else {
            let errBody = try? decoder.decode(APIErrorBody.self, from: data)
            let message = errBody?.message ?? errBody?.error
            switch statusCode {
            case 401:
                AccountDeletedSignal.signal(statusCode: 401, body: data, presentedOwner: AccountDeletedSignal.owner(ofJWT: bearerToken))
                throw MeeshyError.auth(.sessionExpired)
            case 403:
                throw MeeshyError.forbidden(reason: message, body: data)
            case 429:
                if let slowMode = NewcomerSlowMode.fromResponse(response, body: data) {
                    throw MeeshyError.rejected(slowMode.rejection(message: message))
                }
                if let limit = DailyGestureLimit.fromBody(data) {
                    throw MeeshyError.rejected(APIRejection(
                        statusCode: 429, code: limit.gesture.rawValue, message: message ?? "Limite du jour atteinte",
                        resetAt: limit.resetAt, limit: limit.limit))
                }
                throw MeeshyError.server(statusCode: 429, message: "Trop de requetes")
            default:
                throw MeeshyError.server(statusCode: statusCode, message: message ?? "Erreur inconnue")
            }
        }
        return try await Self.decodeOffMain(T.self, from: data)
    }

    /// Un chemin porte-t-il un segment VIDE (`//`, ou `/` final) ? C'est la
    /// trace d'un identifiant vide interpolé dans une route
    /// (`/conversations/\(id)/messages` avec `id == ""`), qu'un intermédiaire
    /// normalise ensuite en une AUTRE route (#8651).
    nonisolated static func containsEmptyPathSegment(_ path: String) -> Bool {
        path.count > 1 && (path.contains("//") || path.hasSuffix("/"))
    }

    // MARK: - Paginated Request (cursor-based)

    /// Les deux paginées TYPÉES — elles composent l'URL comme les autres verbes
    /// et délèguent la pagination à leur jumelle interne, qui n'est plus
    /// accessible depuis l'extérieur du module.
    public func paginatedRequest<T: Decodable>(
        _ endpoint: any MeeshyEndpoint, cursor: String? = nil, limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[T]> {
        try await paginatedRequest(endpoint: legacyPath(for: endpoint), cursor: cursor, limit: limit)
    }

    public func offsetPaginatedRequest<T: Decodable>(
        _ endpoint: any MeeshyEndpoint, offset: Int = 0, limit: Int = 15
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        try await offsetPaginatedRequest(endpoint: legacyPath(for: endpoint), offset: offset, limit: limit)
    }

    func paginatedRequest<T: Decodable>(
        endpoint: String,
        cursor: String? = nil,
        limit: Int = 20
    ) async throws -> PaginatedAPIResponse<[T]> {
        var queryItems = [URLQueryItem(name: "limit", value: "\(limit)")]
        if let cursor {
            queryItems.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await stringRequest(endpoint: endpoint, queryItems: queryItems)
    }

    // MARK: - Offset Paginated Request

    func offsetPaginatedRequest<T: Decodable>(
        endpoint: String,
        offset: Int = 0,
        limit: Int = 15
    ) async throws -> OffsetPaginatedAPIResponse<[T]> {
        let queryItems = [
            URLQueryItem(name: "limit", value: "\(limit)"),
            URLQueryItem(name: "offset", value: "\(offset)"),
        ]
        return try await stringRequest(endpoint: endpoint, queryItems: queryItems)
    }

    // MARK: - JSON Encoder (shared, wire dates to the millisecond)

    private static let jsonEncoder: JSONEncoder = MeeshyCoders.encoder(.api)

    // MARK: - POST with Encodable body

    func post<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await stringRequest(endpoint: endpoint, method: "POST", body: data)
    }

    // MARK: - PUT with Encodable body

    func put<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await stringRequest(endpoint: endpoint, method: "PUT", body: data)
    }

    // MARK: - PATCH with Encodable body

    func patch<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await stringRequest(endpoint: endpoint, method: "PATCH", body: data)
    }

    // MARK: - DELETE

    func delete(endpoint: String) async throws -> APIResponse<[String: Bool]> {
        let acknowledgement: DeletionAcknowledgement = try await stringRequest(endpoint: endpoint, method: "DELETE")
        return acknowledgement.response
    }

    // MARK: - DELETE with Encodable body

    func delete<T: Decodable, U: Encodable>(
        endpoint: String,
        body: U
    ) async throws -> APIResponse<T> {
        let data = try APIClient.jsonEncoder.encode(body)
        return try await stringRequest(endpoint: endpoint, method: "DELETE", body: data)
    }

    // MARK: - Les mêmes verbes, sur une adresse TYPÉE (#4282)
    //
    // Les jumelles à `String` ci-dessus disparaîtront quand le dernier des 348
    // sites d'appel sera migré : c'est LEUR SUPPRESSION, et non une garde, qui
    // rendra un littéral impossible à passer — le compilateur devient le
    // cliquet. Elles restent tant qu'un seul site en dépend, sinon la migration
    // devrait tenir dans un commit unique de 348 fichiers.

    public func request<T: Decodable>(
        _ endpoint: any MeeshyEndpoint,
        method: String = "GET",
        body: Data? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        try await requestWithHeaders(endpoint, method: method, body: body, queryItems: queryItems)
    }

    public func post<T: Decodable, U: Encodable>(
        _ endpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        try await request(endpoint, method: "POST", body: try APIClient.jsonEncoder.encode(body))
    }

    public func put<T: Decodable, U: Encodable>(
        _ endpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        try await request(endpoint, method: "PUT", body: try APIClient.jsonEncoder.encode(body))
    }

    public func patch<T: Decodable, U: Encodable>(
        _ endpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        try await request(endpoint, method: "PATCH", body: try APIClient.jsonEncoder.encode(body))
    }

    public func delete(_ endpoint: any MeeshyEndpoint) async throws -> APIResponse<[String: Bool]> {
        let acknowledgement: DeletionAcknowledgement = try await request(endpoint, method: "DELETE")
        return acknowledgement.response
    }

    public func delete<T: Decodable, U: Encodable>(
        _ endpoint: any MeeshyEndpoint,
        body: U
    ) async throws -> APIResponse<T> {
        try await request(endpoint, method: "DELETE", body: try APIClient.jsonEncoder.encode(body))
    }
}

#if DEBUG
extension APIClient {
    /// Test seam — reproduces the header pipeline used by `request(...)` so
    /// suites can assert that `X-Device-Locale` (and any other `ClientInfo`
    /// header) is present on every outgoing request, without actually
    /// hitting the network.
    ///
    /// Internal-only on purpose: production code MUST go through
    /// `request(...)` to benefit from retry / auth refresh / error mapping.
    public func _buildURLRequestForTesting(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        headers: [String: String]? = nil,
        authToken: String? = nil
    ) async throws -> URLRequest {
        guard let url = URL(string: "https://example.test\(endpoint)") else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }
        // Le siège de test lisait `authToken` seul là où la production lit les
        // DEUX identités : il consulte désormais la même règle.
        return APIRequestBuilder.request(
            url: url, method: method,
            clientHeaders: await ClientInfoProvider.shared.buildHeaders(),
            credential: authToken.map(MeeshyRequestCredential.bearer) ?? requestCredential,
            body: body, headers: headers
        )
    }
}
#endif
