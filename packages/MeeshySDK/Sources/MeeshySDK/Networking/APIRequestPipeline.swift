import Foundation

// Les DÉCISIONS du pipeline de `APIClient`, sorties de `performRequestWithHeaders`
// (LOT-15) : chaque type répond à UNE question, sans état, sans réseau, donc
// éprouvable sans `URLSession`. La coque `APIClient+Perform.swift` ne fait plus
// qu'enchaîner et émettre les signaux.

struct APIErrorBody: Decodable {
    let message: String?
    let error: String?

    var served: String? { message ?? error }
}

// MARK: - Ce que l'on construit

enum APIRequestBuilder {

    static func url(urlString: String, queryItems: [URLQueryItem]?) throws -> URL {
        guard var components = URLComponents(string: urlString),
              !APIClient.containsEmptyPathSegment(components.path) else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }
        if let queryItems, !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else {
            throw MeeshyError.server(statusCode: 0, message: "URL invalide")
        }
        return url
    }

    /// L'ordre d'écriture EST le contrat : le dernier `setValue` gagne, donc
    /// l'identité d'appareil cède à l'identité de requête, qui cède au type de
    /// contenu, que l'appelant peut encore écraser (`X-Client-Mutation-Id`).
    ///
    /// Aucun `Accept-Encoding` ici : URLSession l'annonce seul et décompresse
    /// seul — le poser à la main le fait basculer en décompression manuelle.
    static func request(
        url: URL,
        method: String,
        clientHeaders: [String: String],
        credential: MeeshyRequestCredential?,
        body: Data?,
        headers: [String: String]?
    ) -> URLRequest {
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = method
        for (key, value) in clientHeaders {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        if let credential {
            urlRequest.setValue(credential.value, forHTTPHeaderField: credential.header)
        }
        if let body {
            urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            urlRequest.httpBody = body
        }
        for (key, value) in headers ?? [:] {
            urlRequest.setValue(value, forHTTPHeaderField: key)
        }
        return urlRequest
    }
}

// MARK: - Ce que l'on rejoue

enum APIRetryPolicy {
    static let maxAttempts = 3
    static let retryableStatusCodes: Set<Int> = [429, 503]
    static let retryAfterCeiling: TimeInterval = 30

    /// Une limite QUOTIDIENNE de gestes (429 `DAILY_*`) tient jusqu'à `resetAt`,
    /// et le mode lent des nouveaux comptes se DIT à l'auteur : ni l'un ni
    /// l'autre ne se rejoue en silence.
    static func shouldRetry(
        statusCode: Int,
        attempt: Int,
        retryPolicy: MeeshyEndpointRetryPolicy,
        hasDailyLimit: Bool,
        hasSlowMode: Bool
    ) -> Bool {
        retryPolicy == .standard
            && !hasDailyLimit
            && !hasSlowMode
            && retryableStatusCodes.contains(statusCode)
            && attempt < maxAttempts
    }

    static func delay(statusCode: Int, attempt: Int, retryAfter: String?) -> TimeInterval? {
        guard retryableStatusCodes.contains(statusCode), attempt < maxAttempts else { return nil }
        if let seconds = retryAfter.flatMap({ Double($0) }) {
            return min(seconds, retryAfterCeiling)
        }
        return Double(1 << attempt)
    }
}

// MARK: - Ce que l'on lève

enum APIFailureVerdict {
    case unauthorized
    case thrown(MeeshyError)

    /// L'ORDRE est le contrat : 426 (le gateway refuse ce BINAIRE) → refus
    /// structuré, réservé aux adresses qui le déclarent et fermé aux trois codes
    /// que d'autres mécanismes consomment (401, 403, 429) → 401 → 403 → mode
    /// lent → limite du jour → 429 → 5xx → défaut.
    static func classify(
        statusCode: Int,
        data: Data,
        authKind: MeeshyEndpointAuthKind,
        rejectionPolicy: MeeshyEndpointRejectionPolicy,
        dailyLimit: DailyGestureLimit?,
        slowMode: NewcomerSlowMode?,
        decoder: JSONDecoder
    ) -> APIFailureVerdict {
        let message = (try? decoder.decode(APIErrorBody.self, from: data))?.served
        if statusCode == 426 {
            return .thrown(.server(statusCode: 426, message: message ?? "Mise a jour requise"))
        }
        if statusCode == 400, let refusal = endToEndPlaintextRefusal(data: data, message: message, decoder: decoder) {
            return .thrown(.rejected(refusal))
        }
        if rejectionPolicy == .structured, (400...499).contains(statusCode), ![401, 403, 429].contains(statusCode) {
            return .thrown(structuredRejection(statusCode: statusCode, data: data, message: message, decoder: decoder))
        }
        if statusCode == 401 {
            return unauthorized(authKind: authKind, message: message)
        }
        if statusCode == 403 {
            return .thrown(.forbidden(reason: message, body: data))
        }
        return .thrown(throttledOrServerError(
            statusCode: statusCode, message: message, dailyLimit: dailyLimit, slowMode: slowMode
        ))
    }

    /// #11379 — le refus d'un clair dans une conversation chiffrée (#11216)
    /// garde son code sur TOUTE adresse : sans lui, le client lit un 400 opaque
    /// et rejoue le même clair par le socket, puis par l'outbox.
    private static func endToEndPlaintextRefusal(data: Data, message: String?, decoder: JSONDecoder) -> APIRejection? {
        guard let envelope = try? decoder.decode(APIRejectionEnvelope.self, from: data),
              envelope.code == EndToEndSendGate.serverPlaintextRefusalCode else { return nil }
        return APIRejection(statusCode: 400, code: envelope.code, message: message ?? "Erreur inconnue")
    }

    private static func structuredRejection(
        statusCode: Int, data: Data, message: String?, decoder: JSONDecoder
    ) -> MeeshyError {
        let envelope = try? decoder.decode(APIRejectionEnvelope.self, from: data)
        return .rejected(
            envelope?.rejection(statusCode: statusCode, fallbackMessage: message ?? "Erreur inconnue")
                ?? APIRejection(statusCode: statusCode, message: message ?? "Erreur inconnue")
        )
    }

    private static func unauthorized(authKind: MeeshyEndpointAuthKind, message: String?) -> APIFailureVerdict {
        guard case .invalidCredentials(let reason) = APIClient.mapUnauthorized(authKind: authKind, serverMessage: message) else {
            return .unauthorized
        }
        return .thrown(.auth(.invalidCredentialsWithMessage(reason)))
    }

    private static func throttledOrServerError(
        statusCode: Int, message: String?, dailyLimit: DailyGestureLimit?, slowMode: NewcomerSlowMode?
    ) -> MeeshyError {
        if let slowMode {
            return .rejected(slowMode.rejection(message: message))
        }
        if let dailyLimit {
            return .rejected(APIRejection(
                statusCode: 429, code: dailyLimit.gesture.rawValue, message: message ?? "Limite du jour atteinte",
                resetAt: dailyLimit.resetAt, limit: dailyLimit.limit))
        }
        if statusCode == 429 {
            return .server(statusCode: 429, message: "Trop de requetes")
        }
        if statusCode >= 500 {
            return .server(statusCode: statusCode, message: message ?? "Erreur serveur")
        }
        return .server(statusCode: statusCode, message: message ?? "Erreur inconnue")
    }
}

// MARK: - Ce que l'on fait d'un 401

enum UnauthorizedStep: Equatable {
    /// Aucun jeton de compte présenté : aucune session à rafraîchir, surtout pas
    /// celle du compte actif au moment de la réponse (#10904).
    case sessionExpired
    /// Un jeton présenté sur une route qui ne rafraîchit pas : la session se termine.
    case expireSession
    case refreshAndReplay

    static func decide(presentsBearer: Bool, authKind: MeeshyEndpointAuthKind) -> UnauthorizedStep {
        guard presentsBearer else { return .sessionExpired }
        return authKind == .bearer ? .refreshAndReplay : .expireSession
    }
}

enum APIRefreshedVerdict {
    case success
    case sessionExpired
    case thrown(MeeshyError)

    static func classify(statusCode: Int, data: Data, decoder: JSONDecoder) -> APIRefreshedVerdict {
        if (200...299).contains(statusCode) { return .success }
        if statusCode == 401 { return .sessionExpired }
        let message = (try? decoder.decode(APIErrorBody.self, from: data))?.served
        return .thrown(.server(statusCode: statusCode, message: message ?? "Erreur après rafraichissement"))
    }
}

// MARK: - Ce que l'appelant reçoit

enum APIFailureMapping {

    static func normalize(_ error: Error) -> any Error {
        switch error {
        case is MeeshyError, is CancellationError:
            return error
        case let decoding as DecodingError:
            return MeeshyError.server(statusCode: 0, message: describe(decoding))
        case let urlError as URLError:
            return MeeshyError.network(network(for: urlError))
        default:
            return MeeshyError.unknown(error)
        }
    }

    private static func network(for error: URLError) -> NetworkError {
        switch error.code {
        case .timedOut:
            return .timeout
        case .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed:
            return .serverUnreachable
        default:
            return .noConnection
        }
    }

    static func describe(_ error: DecodingError) -> String {
        let prefix = "Erreur de decodage: "
        switch error {
        case .typeMismatch(let type, let context):
            return prefix + "Type mismatch for type \(type) at path \(path(of: context))"
        case .valueNotFound(let type, let context):
            return prefix + "Value not found for type \(type) at path \(path(of: context))"
        case .keyNotFound(let key, let context):
            return prefix + "Key '\(key.stringValue)' not found at path \(path(of: context))"
        case .dataCorrupted(let context):
            return prefix + "Data corrupted at path \(path(of: context)) - \(context.debugDescription)"
        @unknown default:
            return prefix + error.localizedDescription
        }
    }

    private static func path(of context: DecodingError.Context) -> String {
        context.codingPath.map { $0.stringValue }.joined(separator: ".")
    }
}
