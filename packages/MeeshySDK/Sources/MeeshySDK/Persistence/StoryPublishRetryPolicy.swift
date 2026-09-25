import Foundation

/// Ce que rejouer une publication peut changer — et ce qu'il ne changera pas.
///
/// Un refus 4xx de la passerelle (adresse non vérifiée, validation, conflit)
/// rendra le même verdict à chaque tentative : le rejouer brûle le budget de
/// réessai et, pire, le classe dans « publication au retour en ligne » alors
/// que l'appareil EST en ligne (#7907). Seuls restent réessayables ce que le
/// temps peut guérir : le réseau, les 5xx, la limite de débit (429), l'expiration
/// de requête (408) et une session à rafraîchir (401).
///
/// Règle PURE et agnostique du produit : elle ne dit que « définitif ou non » ;
/// ce qu'on affiche d'un refus reste l'affaire de l'app.
public enum StoryPublishRetryPolicy {
    private static let retryableClientStatuses: Set<Int> = [401, 408, 425, 429]

    public static func isPermanent(_ error: Error) -> Bool {
        if error is StoryPublishUnrecoverableError { return true }
        if let rejection = error as? APIRejection { return isPermanentStatus(rejection.statusCode) }
        switch MeeshyError.from(error) {
        case .forbidden:
            return true
        case .rejected(let rejection):
            return isPermanentStatus(rejection.statusCode)
        case .server(let statusCode, _):
            return isPermanentStatus(statusCode)
        case .network, .auth, .message, .media, .unknown:
            return false
        }
    }

    /// Le code machine d'un refus (`EMAIL_NOT_VERIFIED`…), quand la passerelle
    /// en a posé un. `nil` pour tout ce qui n'est pas un refus typé.
    public static func rejectionCode(_ error: Error) -> String? {
        if let rejection = error as? APIRejection { return rejection.code }
        switch error as? MeeshyError {
        case .rejected(let rejection):
            return rejection.code
        case .forbidden(_, let body):
            return body.flatMap { try? JSONDecoder().decode(CodedBody.self, from: $0) }?.code
        default:
            return nil
        }
    }

    private static func isPermanentStatus(_ statusCode: Int) -> Bool {
        (400..<500).contains(statusCode) && !retryableClientStatuses.contains(statusCode)
    }

    private struct CodedBody: Decodable {
        let code: String?
    }
}
