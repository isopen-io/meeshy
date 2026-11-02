import Foundation

/// Ce que l'appelant laisse voir et entendre AVANT le décroché (#8795).
///
/// Le choix vaut pour UN correspondant et se rejoue à ses appels suivants.
/// Il ne gouverne que l'aperçu : au décroché, l'appel démarre avec ses médias
/// normaux.
struct CallPreviewConsent: Equatable, Codable, Sendable {
    var sendsAudio: Bool
    var sendsVideo: Bool

    /// Un contact jamais appelé : micro coupé, caméra activée (directive
    /// porteur 2026-09-30).
    static let initial = CallPreviewConsent(sendsAudio: false, sendsVideo: true)
}

@MainActor
protocol CallPreviewConsentStoring: AnyObject {
    func consent(localUserId: String, peerUserId: String) -> CallPreviewConsent
    func remember(_ consent: CallPreviewConsent, localUserId: String, peerUserId: String)
}

/// La mémoire de l'appareil, un choix par (compte, correspondant) : un autre
/// compte connecté sur le même téléphone ne rejoue jamais ceux du premier.
@MainActor
final class CallPreviewConsentStore: CallPreviewConsentStoring {
    nonisolated deinit {}

    static let shared = CallPreviewConsentStore()

    private static let key = "meeshy.call.previewConsents"
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func consent(localUserId: String, peerUserId: String) -> CallPreviewConsent {
        stored()[Self.entry(localUserId, peerUserId)] ?? .initial
    }

    func remember(_ consent: CallPreviewConsent, localUserId: String, peerUserId: String) {
        let updated = stored().merging([Self.entry(localUserId, peerUserId): consent]) { _, new in new }
        guard let data = try? JSONEncoder().encode(updated) else { return }
        defaults.set(data, forKey: Self.key)
    }

    private func stored() -> [String: CallPreviewConsent] {
        guard let data = defaults.data(forKey: Self.key),
              let decoded = try? JSONDecoder().decode([String: CallPreviewConsent].self, from: data) else { return [:] }
        return decoded
    }

    private static func entry(_ localUserId: String, _ peerUserId: String) -> String {
        "\(localUserId)|\(peerUserId)"
    }
}
