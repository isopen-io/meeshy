import Foundation

/// **Ce qui désigne et rouvre une pièce jointe chiffrée de bout en bout**
/// (#10789), à la manière de l'`AttachmentPointer` de Signal. Il voyage DANS
/// `E2EEContent`, donc sous libsignal : seuls les appareils destinataires lisent
/// la clé, le condensat, le nom, le type, la taille exacte, la durée et la
/// transcription. Le serveur ne garde que le blob (`id`), sous
/// `application/octet-stream`, à sa taille arrondie.
///
/// Le chiffrement lui-même est `E2EEAttachmentCipher` (`MeeshyE2EE`), format
/// `scheme`. Un `scheme` inconnu de cette version rend la pièce illisible,
/// jamais devinée.
public struct E2EEAttachmentPointer: Codable, Equatable, Sendable {
    public enum Kind: String, Codable, Sendable {
        case image, video, audio, file

        public init(from decoder: Decoder) throws {
            self = Kind(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .file
        }
    }

    /// La transcription faite sur l'appareil émetteur (Speech) : jamais par le serveur.
    public struct Transcript: Codable, Equatable, Sendable {
        public let text: String
        public let language: String?

        public init(text: String, language: String?) {
            self.text = text
            self.language = language
        }
    }

    /// L'affiche d'une vidéo ou la vignette d'une photo : un AUTRE blob, sous sa propre clé.
    public struct Thumbnail: Codable, Equatable, Sendable {
        public let id: String
        public let key: Data
        public let digest: Data
        public let size: Int
        public let contentType: String

        public init(id: String, key: Data, digest: Data, size: Int, contentType: String) {
            self.id = id
            self.key = key
            self.digest = digest
            self.size = size
            self.contentType = contentType
        }
    }

    public static let clientV1 = "client-v1"

    /// Le plafond de téléversement du produit (`UPLOAD_LIMITS`, 4 Gio) : une
    /// taille annoncée au-delà, ou négative, rend la pièce illisible — elle
    /// bornerait le téléchargement à rien, ou ferait déborder le calcul du blob.
    public static let maxSize = 4 * 1024 * 1024 * 1024

    /// L'identifiant serveur du blob (`MessageAttachment.id`).
    public let id: String
    public let scheme: String
    public let key: Data
    public let digest: Data
    /// La taille EXACTE du clair, en octets.
    public let size: Int
    public let contentType: String
    public let fileName: String?
    public let kind: Kind
    public let width: Int?
    public let height: Int?
    public let durationMs: Int?
    public let thumbHash: String?
    public let transcript: Transcript?
    public let thumbnail: Thumbnail?

    public init(
        id: String,
        scheme: String = E2EEAttachmentPointer.clientV1,
        key: Data,
        digest: Data,
        size: Int,
        contentType: String,
        fileName: String?,
        kind: Kind,
        width: Int? = nil,
        height: Int? = nil,
        durationMs: Int? = nil,
        thumbHash: String? = nil,
        transcript: Transcript? = nil,
        thumbnail: Thumbnail? = nil
    ) {
        self.id = id
        self.scheme = scheme
        self.key = key
        self.digest = digest
        self.size = size
        self.contentType = contentType
        self.fileName = fileName
        self.kind = kind
        self.width = width
        self.height = height
        self.durationMs = durationMs
        self.thumbHash = thumbHash
        self.transcript = transcript
        self.thumbnail = thumbnail
    }

    /// Cet appareil sait-il rouvrir ce blob ? Un `scheme` connu, une taille dans
    /// le plafond du produit, et des identifiants qui ont la forme d'un
    /// identifiant serveur (24 hexadécimaux) :
    /// un `id` venu d'un pair ne compose jamais autre chose qu'un segment
    /// d'adresse `GET /attachments/:id` (audit du 2026-10-25).
    public var isReadable: Bool {
        scheme == Self.clientV1 && Self.isServerId(id) && Self.isPlausible(size)
            && (thumbnail.map { Self.isServerId($0.id) && Self.isPlausible($0.size) } ?? true)
    }

    static func isPlausible(_ size: Int) -> Bool {
        (0...maxSize).contains(size)
    }

    static func isServerId(_ id: String) -> Bool {
        id.count == 24 && id.allSatisfy { $0.isHexDigit && ($0.isNumber || $0.isLowercase) }
    }

    /// Les blobs que le message rattache sur le serveur : la pièce, puis son affiche.
    public var blobIds: [String] { [id] + (thumbnail.map { [$0.id] } ?? []) }
}
