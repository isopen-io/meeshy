import Foundation

/// La limite QUOTIDIENNE de gestes d'un compte (#9584, #9571) : un refus AVANT
/// écriture, par jour civil du compte, sur `POST /posts/:postId/comments`
/// (`DAILY_COMMENT_LIMIT`), `POST /posts/:postId/like` et l'accusé de
/// `post:reaction-add` (`DAILY_REACTION_LIMIT`).
///
/// REST : `429` + `{ code, retryAfter, resetAt, limit, path }` à la racine de
/// l'enveloppe ; socket : `{ success: false, error, code, retryAfter, resetAt, limit }`.
///
/// Ce refus est TERMINAL jusqu'à `resetAt` : ni le transport (qui retente
/// d'ordinaire un 429), ni la file durable ne le rejouent. Un retrait ne rend
/// pas la place du jour.
public struct DailyGestureLimit: Error, Sendable, Equatable {
    public enum Gesture: String, Sendable, Equatable {
        case comment = "DAILY_COMMENT_LIMIT"
        case reaction = "DAILY_REACTION_LIMIT"
    }

    public let gesture: Gesture
    /// L'instant où le compte retrouve ses gestes — `nil` sur un refus qui ne le porte pas.
    public let resetAt: Date?
    public let limit: Int?

    public init(gesture: Gesture, resetAt: Date?, limit: Int?) {
        self.gesture = gesture
        self.resetAt = resetAt
        self.limit = limit
    }

    public init?(code: String?, resetAt: Date?, limit: Int?) {
        guard let gesture = code.flatMap(Gesture.init(rawValue:)) else { return nil }
        self.init(gesture: gesture, resetAt: resetAt, limit: limit)
    }

    public static func isDailyLimitCode(_ code: String?) -> Bool {
        code.flatMap(Gesture.init(rawValue:)) != nil
    }

    /// `2026-10-07T22:00:00.000Z` (avec ou sans millisecondes).
    public static func parseInstant(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        return WireDate.date(from: value)
    }

    private struct Envelope: Decodable {
        let code: String?
        let resetAt: String?
        let limit: Int?
    }

    /// Le refus lu dans le corps d'une réponse REST ; `nil` pour tout autre corps.
    public static func fromBody(_ data: Data) -> DailyGestureLimit? {
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: data) else { return nil }
        return DailyGestureLimit(code: envelope.code, resetAt: parseInstant(envelope.resetAt), limit: envelope.limit)
    }

    /// Le refus lu dans l'accusé d'un événement socket ; `nil` pour tout autre accusé.
    public static func fromAck(_ response: [String: Any]) -> DailyGestureLimit? {
        DailyGestureLimit(code: response["code"] as? String,
                          resetAt: parseInstant(response["resetAt"] as? String),
                          limit: response["limit"] as? Int)
    }

    /// Le refus que porte une erreur levée par le transport (`MeeshyError.rejected`)
    /// ou par l'accusé socket (levé tel quel) ; `nil` pour toute autre erreur.
    public static func from(_ error: Error) -> DailyGestureLimit? {
        if let limit = error as? DailyGestureLimit { return limit }
        if case MeeshyError.rejected(let rejection) = error {
            return DailyGestureLimit(code: rejection.code, resetAt: rejection.resetAt, limit: rejection.limit)
        }
        return nil
    }
}

extension SocialSocketManager {
    /// L'erreur d'un accusé de réaction refusé : la limite du jour quand l'accusé
    /// la porte (`DAILY_REACTION_LIMIT`), la phrase du serveur sinon.
    nonisolated static func postReactionAckFailure(_ response: [String: Any]) -> Error {
        if let limit = DailyGestureLimit.fromAck(response) { return limit }
        let message = (response["error"] as? [String: Any])?["message"] as? String
            ?? (response["error"] as? String)
            ?? "unknown error"
        return PostReactionError.serverError(message)
    }
}

/// Les limites du jour qui ont fait RENONCER la file durable, par identifiant
/// de mutation : la file ne rejoue pas le geste, et l'écran qui l'a posé dit
/// pourquoi — l'heure de remise à zéro plutôt qu'un « impossible » muet. Borné.
public final class DailyGestureLimitLedger: @unchecked Sendable {
    public static let shared = DailyGestureLimitLedger()

    private static let capacity = 64
    private let lock = NSLock()
    private var byMutation: [String: DailyGestureLimit] = [:]

    public init() {}

    public func record(_ limit: DailyGestureLimit, clientMutationId: String) {
        lock.lock()
        defer { lock.unlock() }
        if byMutation.count >= Self.capacity, let evicted = byMutation.keys.first {
            byMutation.removeValue(forKey: evicted)
        }
        byMutation[clientMutationId] = limit
    }

    /// La limite qui a fait renoncer cette mutation, une seule fois.
    public func take(clientMutationId: String) -> DailyGestureLimit? {
        lock.lock()
        defer { lock.unlock() }
        return byMutation.removeValue(forKey: clientMutationId)
    }
}
