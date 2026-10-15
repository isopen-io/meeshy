import Foundation
import MeeshySDK

// MARK: - Que faire d'une photo de fond qui ne vient pas ? (#10707, #10706)
//
// Même règle que le web (`ffd8355cf2`) : une panne PASSAGÈRE garde la dernière photo
// peinte ; seule une pièce disparue ou refusée (404, 403, 410) rend le fond à Signature.
// Une pièce CHIFFRÉE n'est jamais demandée au réseau : le serveur ne sert que le chiffré,
// et l'appareil n'a pas (encore) de clé de pièce — Signature, seulement faute de clé.

nonisolated enum ConversationBackgroundPhotoVerdict: Equatable {
    case gone
    case transient

    private static let goneStatuses: Set<Int> = [403, 404, 410]

    static func of(_ error: Error) -> ConversationBackgroundPhotoVerdict {
        guard let status = PackHTTPStatus.code(of: error), goneStatuses.contains(status) else { return .transient }
        return .gone
    }

    /// D'où la photo se lit : en clair par le réseau, ou chiffrée donc dépendante d'une clé de l'appareil.
    enum Source: Equatable {
        case clear
        case needsDeviceKey
    }

    static func source(for known: MeeshyMessageAttachment?) -> Source {
        known?.isEncrypted == true ? .needsDeviceKey : .clear
    }

    /// VoiceOver nomme une photo par sa date (« Photo du 3 mars »), jamais par le nom du fichier.
    static func accessibilityLabel(createdAt: Date, locale: Locale = .current) -> String {
        let date = createdAt.formatted(.dateTime.day().month(.wide).year().locale(locale))
        let format = String(localized: "conversation.appearance.photo.label", defaultValue: "Photo du %@", bundle: .main)
        return String(format: format, date)
    }

    /// Le sélecteur ne propose pas une photo qu'il ne saurait pas peindre.
    static func mayBeOffered(_ attachment: MeeshyMessageAttachment) -> Bool {
        !attachment.isEncrypted && !attachment.isViewOnce && !attachment.isBlurred
    }
}

/// Interroge les métadonnées de la pièce (appartenance vérifiée à chaque lecture) pour savoir
/// si l'échec d'un chargement d'image est une disparition ou une panne.
nonisolated struct ConversationBackgroundPhotoProbe: Sendable {
    private nonisolated struct Ignored: Decodable {
        nonisolated init(from decoder: Decoder) throws {}
    }

    private let fetch: @Sendable (String) async throws -> Void

    init(fetch: @escaping @Sendable (String) async throws -> Void) {
        self.fetch = fetch
    }

    static let live = ConversationBackgroundPhotoProbe { attachmentId in
        let _: Ignored = try await APIClient.shared.request(
            AttachmentsEndpoint.byAttachmentIdMetadata(attachmentId: attachmentId),
            method: "GET", body: nil, queryItems: nil
        )
    }

    func isGone(attachmentId: String) async -> Bool {
        do {
            try await fetch(attachmentId)
            return false
        } catch {
            return ConversationBackgroundPhotoVerdict.of(error) == .gone
        }
    }
}
