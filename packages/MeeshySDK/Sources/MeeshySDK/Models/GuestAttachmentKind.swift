import Foundation

// MARK: - Ce qu'un INVITÉ peut joindre par un lien de partage (#10001, #10006)
//
// Miroir Swift de `packages/shared/types/guest-attachment-kinds.ts` — les
// familles, leurs extensions, leurs MIME et les deux codes de refus. Le serveur
// juge sur le CONTENU réel du fichier ; ce que le client lit ici ne sert qu'à
// n'OFFRIR que ce qui passera, et à dire pourquoi le reste ne passe pas.

/// Une famille de pièces jointes ouverte (ou non) à un invité.
public enum GuestAttachmentKind: String, Sendable, CaseIterable, Codable, Equatable {
    case text
    case audio
    case image
    case pdf

    /// Les extensions qu'un sélecteur peut proposer pour cette famille
    /// (`GUEST_ATTACHMENT_KIND_EXTENSIONS`).
    public var fileExtensions: [String] {
        switch self {
        case .text: return ["txt"]
        case .audio: return ["mp3", "m4a", "mp4", "aac", "ogg", "oga", "opus", "webm", "weba", "wav"]
        case .image: return ["jpg", "jpeg", "png", "gif", "webp"]
        case .pdf: return ["pdf"]
        }
    }

    /// La famille que DÉCLARE un nom de fichier — jamais une preuve.
    public static func kind(ofFileName fileName: String) -> GuestAttachmentKind? {
        let ext = (fileName as NSString).pathExtension.lowercased()
        guard !ext.isEmpty else { return nil }
        return allCases.first { $0.fileExtensions.contains(ext) }
    }

    /// La famille que DÉCLARE un type MIME (`guestAttachmentKindOfMimeType`).
    public static func kind(ofMimeType mimeType: String?) -> GuestAttachmentKind? {
        guard let mimeType else { return nil }
        let base = (mimeType.split(separator: ";").first.map(String.init) ?? "")
            .trimmingCharacters(in: .whitespaces)
            .lowercased()
        if base == "text/plain" { return .text }
        if base.hasPrefix("audio/") { return .audio }
        if ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"].contains(base) { return .image }
        if base == "application/pdf" { return .pdf }
        return nil
    }

    /// Le plafond de World Wide (`WORLD_GUEST_ATTACHMENT_KINDS`) : ce qu'un
    /// invité y joint au plus, quoi que disent les termes de son lien.
    public static let worldGuestCeiling: [GuestAttachmentKind] = [.text, .audio]

    /// Lecture TOLÉRANTE des termes servis : `nil` reste `nil` (aucune
    /// restriction), une famille inconnue est ignorée, et une liste qui n'en
    /// contient que d'inconnues devient VIDE — elle n'ouvre rien, jamais tout.
    public static func knownKinds(from raw: [String]?) -> [GuestAttachmentKind]? {
        guard let raw else { return nil }
        return allCases.filter { raw.contains($0.rawValue) }
    }
}

// MARK: - Ce que le sélecteur de l'invité OFFRE

/// Les familles qu'un invité peut joindre dans SA session — `kinds == nil`
/// quand le lien ne restreint rien (les droits `canSend*` s'appliquent alors
/// comme avant), un tableau quand il fait foi.
public struct GuestAttachmentAllowance: Sendable, Equatable {
    public let kinds: [GuestAttachmentKind]?

    public init(kinds: [GuestAttachmentKind]?) {
        self.kinds = kinds
    }

    public static let unrestricted = GuestAttachmentAllowance(kinds: nil)

    /// `GUEST_ATTACHMENT_MAX_BYTES` — le serveur lit le fichier ENTIER pour le
    /// juger, d'où la borne, qui ne vaut que sur un lien restreint.
    public static let maxBytes: Int64 = 25 * 1024 * 1024

    public var isRestricted: Bool { kinds != nil }

    public func allows(_ kind: GuestAttachmentKind) -> Bool {
        kinds?.contains(kind) ?? true
    }

    /// Photothèque, appareil photo, stickers : ce qui produit une IMAGE.
    public var offersVisualMedia: Bool { allows(.image) }

    /// Le micro du composeur produit de l'audio.
    public var offersVoiceRecording: Bool { allows(.audio) }

    /// Le sélecteur de fichiers s'ouvre dès qu'une famille au moins est ouverte.
    public var offersFiles: Bool { kinds.map { !$0.isEmpty } ?? true }

    /// Une fiche de contact ou un lieu ne sont dans aucune famille : un lien
    /// restreint ne les offre pas.
    public var offersContactsAndPlaces: Bool { !isRestricted }

    /// Le plafond d'une conversation appliqué aux termes servis : des termes
    /// ABSENTS prennent le plafond — jamais « tout » —, des termes plus larges
    /// y sont resserrés, des termes plus étroits le restent.
    public func capped(by ceiling: [GuestAttachmentKind]) -> GuestAttachmentAllowance {
        GuestAttachmentAllowance(kinds: (kinds ?? ceiling).filter(ceiling.contains))
    }

    public enum Verdict: Sendable, Equatable {
        /// Admis ; la famille déclarée par le nom, quand elle est connue.
        case accepted(GuestAttachmentKind?)
        case refused(GuestAttachmentRefusal.Reason)
    }

    /// Le verdict sur un fichier CHOISI, avant tout envoi : la famille par
    /// l'extension, puis la borne de taille. Le serveur reste juge du contenu.
    public func verdict(fileName: String, byteCount: Int64) -> Verdict {
        let declared = GuestAttachmentKind.kind(ofFileName: fileName)
        guard let kinds else { return .accepted(declared) }
        guard let declared, kinds.contains(declared) else { return .refused(.kindNotAllowed) }
        guard byteCount <= Self.maxBytes else { return .refused(.tooLarge) }
        return .accepted(declared)
    }
}

// MARK: - Le refus du SERVEUR

/// Le refus d'une pièce jointe d'invité, tel que les chemins d'envoi le
/// rendent (`GUEST_ATTACHMENT_REFUSAL_CODES`) : 403 pour une famille fermée,
/// 413 pour une pièce trop lourde, corps = l'enveloppe JSON (suivie de `\n`
/// sur tus). Définitif : le rejouer ne le fera pas passer.
public struct GuestAttachmentRefusal: Error, Sendable, Equatable {
    public enum Reason: String, Sendable, Equatable {
        case kindNotAllowed = "GUEST_ATTACHMENT_KIND_NOT_ALLOWED"
        case tooLarge = "GUEST_ATTACHMENT_TOO_LARGE"
    }

    public let reason: Reason
    public let serverMessage: String?

    public init(reason: Reason, serverMessage: String? = nil) {
        self.reason = reason
        self.serverMessage = serverMessage
    }

    private struct Envelope: Decodable {
        let code: String?
        let message: String?
    }

    /// `nil` quand la réponse n'est pas un refus d'invité — un autre 403
    /// (lien sans familles : ancien corps texte), ou un autre statut.
    public init?(statusCode: Int, body: Data) {
        guard statusCode == 403 || statusCode == 413,
              let envelope = try? JSONDecoder().decode(Envelope.self, from: body),
              let code = envelope.code,
              let reason = Reason(rawValue: code) else { return nil }
        self.init(reason: reason, serverMessage: envelope.message)
    }
}
