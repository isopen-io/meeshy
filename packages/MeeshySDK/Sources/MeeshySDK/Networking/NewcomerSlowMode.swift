import Foundation

/// **Le mode lent des nouveaux comptes dans Meeshy Global** (#7740, #7759) :
/// un compte de moins de 24 h écrit un message toutes les 30 s. Le refus est
/// TEMPORAIRE — `429` + `code: "NEWCOMER_SLOW_MODE"` + l'en-tête
/// `Retry-After` (REST), `{ success: false, code, retryAfter }` (accusé socket).
///
/// Le transport ne le rejoue PAS en silence, à la différence d'un 429 de
/// débit : l'auteur doit savoir pourquoi son message ne part pas, et dans
/// combien de temps il peut le renvoyer. Le refus remonte en
/// `MeeshyError.rejected`, son délai porté par `resetAt`.
public struct NewcomerSlowMode: Sendable, Equatable {
    public static let code = "NEWCOMER_SLOW_MODE"

    /// Secondes avant de pouvoir renvoyer — jamais moins d'une.
    public let retryAfterSeconds: Int

    public init(retryAfterSeconds: Int) {
        self.retryAfterSeconds = max(1, retryAfterSeconds)
    }

    private struct Envelope: Decodable {
        let code: String?
        let retryAfter: Double?
    }

    /// Le refus lu dans une réponse REST ; `nil` pour toute autre réponse.
    /// L'en-tête `Retry-After` fait foi ; à défaut, le `retryAfter` de l'enveloppe.
    public static func fromResponse(_ response: URLResponse, body: Data) -> NewcomerSlowMode? {
        guard let http = response as? HTTPURLResponse, http.statusCode == 429,
              let envelope = try? JSONDecoder().decode(Envelope.self, from: body),
              envelope.code == code else { return nil }
        let header = http.value(forHTTPHeaderField: "Retry-After").flatMap { Double($0) }
        return NewcomerSlowMode(seconds: header ?? envelope.retryAfter ?? 1)
    }

    /// Le refus que porte une erreur levée par le transport ; `nil` pour toute autre erreur.
    public static func from(_ error: Error, now: Date = Date()) -> NewcomerSlowMode? {
        guard case MeeshyError.rejected(let rejection) = error, rejection.code == code else { return nil }
        return NewcomerSlowMode(seconds: rejection.resetAt.map { $0.timeIntervalSince(now) } ?? 1)
    }

    /// Le refus tel que le transport le lève.
    public func rejection(message: String?, now: Date = Date()) -> APIRejection {
        APIRejection(
            statusCode: 429,
            code: Self.code,
            message: message ?? "Mode lent des nouveaux comptes",
            resetAt: now.addingTimeInterval(TimeInterval(retryAfterSeconds))
        )
    }

    private init(seconds: Double) {
        let bounded = seconds.isFinite ? min(max(seconds, 1), 86_400) : 1
        self.init(retryAfterSeconds: Int(bounded.rounded(.up)))
    }
}
