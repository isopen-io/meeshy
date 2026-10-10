import Foundation

// MARK: - Un compte de moins de 13 ans ne se connecte pas (#9927, #9929)
//
// Une date déclarée sous 13 ans est DÉFINITIVE : la passerelle l'écrit,
// révoque les sessions, puis répond 403 `AGE_BELOW_MINIMUM` à la connexion,
// au lien magique et au rafraîchissement du jeton tant que le compte a moins de
// 13 ans. Ce refus n'est ni une erreur de saisie ni une session expirée : il
// appelle UN écran, quel que soit le chemin qui l'a reçu. Le transport le
// signale donc au point unique par lequel passent tous les 403 — comme la
// porte de mise à jour (`UpgradeGateSignal`) pour les 426.

public extension Notification.Name {
    /// Postée quand la passerelle refuse un compte de moins de 13 ans.
    static let meeshyAgeBelowMinimum = Notification.Name("me.meeshy.ageBelowMinimum")
}

public enum AgeGateSignal {
    public static let code = "AGE_BELOW_MINIMUM"

    /// Poste le refus — et le rend — UNIQUEMENT sur un 403 portant le code.
    /// Tout autre refus d'accès reste l'affaire de son appelant.
    @discardableResult
    public static func signal(statusCode: Int, body: Data?, center: NotificationCenter = .default) -> Bool {
        guard statusCode == 403, carriesAgeCode(body) else { return false }
        center.post(name: .meeshyAgeBelowMinimum, object: nil)
        return true
    }

    /// Le refus est-il celui d'un compte de moins de 13 ans ?
    public static func isAgeRefusal(_ error: Error) -> Bool {
        guard let meeshy = error as? MeeshyError, case let .forbidden(_, body) = meeshy else { return false }
        return carriesAgeCode(body)
    }

    private static func carriesAgeCode(_ body: Data?) -> Bool {
        guard let body, let envelope = try? JSONDecoder().decode(Envelope.self, from: body) else { return false }
        return envelope.code == code
    }

    private struct Envelope: Decodable {
        let code: String?
    }
}
