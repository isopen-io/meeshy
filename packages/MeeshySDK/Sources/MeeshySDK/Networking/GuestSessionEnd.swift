import Foundation

// MARK: - Une session d'invité se TERMINE, elle ne se retente pas (#10442)
//
// La passerelle refuse un invité de lien de deux façons qui ne sont ni une
// panne ni une session à rafraîchir (#10437) :
//
// - `403 SHARE_LINK_EXPIRED` — le lien par lequel il est entré a expiré. Toute
//   requête REST le reçoit, et le socket le reçoit en `error { code }` avant
//   d'être coupé, à la connexion comme à l'échéance.
// - `410 GUEST_ACCESS_REVOKED` — l'hôte a retiré le lien ; le participant est
//   désactivé. Le code voyage dans `error`, pas dans `code`.
//
// Retenter l'un ou l'autre ne peut pas aboutir : le socket retentait jusqu'à
// 16 s d'intervalle, indéfiniment, et l'écran ne disait rien. Ce type est la
// loi UNIQUE qui lit ces refus, et le signal que le transport poste quand il
// en reçoit un — comme `AgeGateSignal` pour les 403 `AGE_BELOW_MINIMUM`.

public extension Notification.Name {
    /// Postée quand la passerelle termine la session d'un invité de lien.
    static let meeshyGuestSessionEnded = Notification.Name("me.meeshy.guestSessionEnded")
}

nonisolated public enum GuestSessionEnd: String, Sendable, Equatable, CaseIterable {
    /// Le lien de partage a expiré.
    case linkExpired
    /// L'hôte a retiré l'accès de l'invité.
    case accessRevoked

    public static let linkExpiredCode = "SHARE_LINK_EXPIRED"
    public static let accessRevokedCode = "GUEST_ACCESS_REVOKED"

    static let endKey = "end"
    static let refusedTokenKey = "refusedSessionToken"

    /// La loi : un code d'erreur termine-t-il la session d'invité ?
    /// `nil` pour tout autre code — un refus ordinaire reste l'affaire de son appelant.
    public static func from(code: String?) -> GuestSessionEnd? {
        switch code {
        case linkExpiredCode: return .linkExpired
        case accessRevokedCode: return .accessRevoked
        default: return nil
        }
    }

    /// Le refus lu dans une réponse REST. Le code se cherche dans `code`
    /// (`sendError`) puis dans `error` (le 410 de révocation l'y pose), et
    /// n'est reconnu que sous SON statut : un code égaré sous un autre statut
    /// ne termine rien.
    public static func from(statusCode: Int, body: Data?) -> GuestSessionEnd? {
        guard let body, let envelope = try? JSONDecoder().decode(Envelope.self, from: body) else { return nil }
        guard let end = from(code: envelope.code) ?? from(code: envelope.error),
              end.statusCode == statusCode else { return nil }
        return end
    }

    /// Le refus lu dans la charge d'un événement socket `error`
    /// (`{ message, code }`, premier argument).
    public static func from(socketErrorPayload data: [Any]) -> GuestSessionEnd? {
        guard let payload = data.first as? [String: Any] else { return nil }
        return from(code: payload["code"] as? String)
    }

    /// Le statut HTTP sous lequel la passerelle rend ce refus.
    public var statusCode: Int {
        switch self {
        case .linkExpired: return 403
        case .accessRevoked: return 410
        }
    }

    /// Poste la fin de session. `refusedSessionToken` nomme la session
    /// refusée quand le transport la connaît (REST) : l'app ne termine que
    /// CELLE-LÀ, jamais une session ouverte depuis par un nouveau lien.
    public func signal(refusedSessionToken: String? = nil, center: NotificationCenter = .default) {
        var userInfo: [String: String] = [Self.endKey: rawValue]
        if let refusedSessionToken, !refusedSessionToken.isEmpty {
            userInfo[Self.refusedTokenKey] = refusedSessionToken
        }
        center.post(name: .meeshyGuestSessionEnded, object: nil, userInfo: userInfo)
    }

    /// Poste la fin de session — et la rend — UNIQUEMENT sur un refus
    /// reconnu par la loi. Tout autre refus passe sans bruit.
    @discardableResult
    public static func signal(
        statusCode: Int,
        body: Data?,
        refusedSessionToken: String?,
        center: NotificationCenter = .default
    ) -> GuestSessionEnd? {
        guard let end = from(statusCode: statusCode, body: body) else { return nil }
        end.signal(refusedSessionToken: refusedSessionToken, center: center)
        return end
    }

    /// La fin portée par une notification `meeshyGuestSessionEnded`.
    public init?(notification: Notification) {
        guard notification.name == .meeshyGuestSessionEnded,
              let raw = notification.userInfo?[Self.endKey] as? String else { return nil }
        self.init(rawValue: raw)
    }

    /// Le jeton de la session refusée, quand le transport l'a nommé.
    public static func refusedSessionToken(in notification: Notification) -> String? {
        notification.userInfo?[refusedTokenKey] as? String
    }

    private struct Envelope: Decodable {
        let code: String?
        let error: String?
    }
}
