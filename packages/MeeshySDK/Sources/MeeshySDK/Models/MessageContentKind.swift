import Foundation

/// LE TYPE DE CONTENU D'UN MESSAGE (#11205, #11209) — miroir exact de
/// `messageContentKind` (`packages/shared/utils/message-content-kind.ts`), dérivé
/// en UN site : ce que le message EST ; ce qu'un lecteur en FAIT est
/// `MessageActionPolicy`. Ordre de lecture : supprimé, système (dont l'appel),
/// formes de la métadonnée (sticker, lieu — écrit en `text` par le serveur,
/// #7590 —, sondage), pièces jointes, texte. `MessageActionPolicyVectorTests`
/// rejoue les vecteurs partagés.
public enum MessageContentKind: String, CaseIterable, Sendable {
    case text, link, image, video, audio, file, location, contact, poll, sticker, call, system, deleted, multi

    /// Les drapeaux protégés et d'état, lus sur le message ET ses pièces.
    public struct Flags: Equatable, Sendable {
        public let viewOnce: Bool
        public let blurred: Bool
        /// Le serveur ne lit pas le clair (`sharedTranslationServerReadsMessage`, régime inconnu ⇒ chiffré).
        public let encrypted: Bool
        public let ephemeral: Bool
        /// Identifiant client `cid_…` : le serveur ne connaît pas encore ce message.
        public let optimistic: Bool
        public let failed: Bool
        public let captureNotice: Bool

        public init(
            viewOnce: Bool, blurred: Bool, encrypted: Bool, ephemeral: Bool,
            optimistic: Bool, failed: Bool, captureNotice: Bool
        ) {
            self.viewOnce = viewOnce
            self.blurred = blurred
            self.encrypted = encrypted
            self.ephemeral = ephemeral
            self.optimistic = optimistic
            self.failed = failed
            self.captureNotice = captureNotice
        }
    }

    public struct Shape: Equatable, Sendable {
        public let kind: MessageContentKind
        public let flags: Flags

        public init(kind: MessageContentKind, flags: Flags) {
            self.kind = kind
            self.flags = flags
        }
    }

    /// Ce que la loi lit d'une pièce jointe.
    public struct Piece: Equatable, Sendable {
        public let mimeType: String?
        public let originalName: String?
        public let fileName: String?
        public let isViewOnce: Bool?
        public let isBlurred: Bool?
        public let effectFlags: UInt32?

        public init(
            mimeType: String? = nil, originalName: String? = nil, fileName: String? = nil,
            isViewOnce: Bool? = nil, isBlurred: Bool? = nil, effectFlags: UInt32? = nil
        ) {
            self.mimeType = mimeType
            self.originalName = originalName
            self.fileName = fileName
            self.isViewOnce = isViewOnce
            self.isBlurred = isBlurred
            self.effectFlags = effectFlags
        }
    }

    /// Ce que la loi lit de `Message.metadata` : sa clé `kind` et les formes
    /// qu'elle PORTE (une clé présente et non nulle).
    public struct Metadata: Equatable, Sendable {
        public let kind: String?
        public let carriesSticker: Bool
        public let carriesLocation: Bool
        public let carriesPoll: Bool

        public init(kind: String? = nil, carriesSticker: Bool = false, carriesLocation: Bool = false, carriesPoll: Bool = false) {
            self.kind = kind
            self.carriesSticker = carriesSticker
            self.carriesLocation = carriesLocation
            self.carriesPoll = carriesPoll
        }

        public static let empty = Metadata()
    }

    /// Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien.
    public struct Subject: Equatable, Sendable {
        public let id: String
        public let content: String?
        public let messageType: String?
        public let deletedAt: Date?
        public let isViewOnce: Bool?
        public let isBlurred: Bool?
        public let isEncrypted: Bool?
        public let encryptionMode: String?
        public let effectFlags: UInt32?
        /// Sa seule PRÉSENCE déclare un éphémère ; c'est aussi l'heure où il cesse d'être vivant.
        public let expiresAt: Date?
        public let ephemeralDuration: Double?
        public let metadata: Metadata
        public let attachments: [Piece?]?
        /// L'envoi a échoué — posé par le client qui l'a tenté.
        public let failed: Bool?

        public init(
            id: String,
            content: String? = nil,
            messageType: String? = nil,
            deletedAt: Date? = nil,
            isViewOnce: Bool? = nil,
            isBlurred: Bool? = nil,
            isEncrypted: Bool? = nil,
            encryptionMode: String? = nil,
            effectFlags: UInt32? = nil,
            expiresAt: Date? = nil,
            ephemeralDuration: Double? = nil,
            metadata: Metadata = .empty,
            attachments: [Piece?]? = nil,
            failed: Bool? = nil
        ) {
            self.id = id
            self.content = content
            self.messageType = messageType
            self.deletedAt = deletedAt
            self.isViewOnce = isViewOnce
            self.isBlurred = isBlurred
            self.isEncrypted = isEncrypted
            self.encryptionMode = encryptionMode
            self.effectFlags = effectFlags
            self.expiresAt = expiresAt
            self.ephemeralDuration = ephemeralDuration
            self.metadata = metadata
            self.attachments = attachments
            self.failed = failed
        }

        var pieces: [Piece] { (attachments ?? []).compactMap { $0 } }

        /// Ce que la loi de sortie lit de ce message.
        public var contentExitSubject: ContentExitLaw.Subject {
            ContentExitLaw.Subject(
                isViewOnce: isViewOnce,
                isBlurred: isBlurred,
                effectFlags: effectFlags,
                ephemeralDuration: ephemeralDuration,
                expiresAt: expiresAt,
                attachments: attachments?.map { (piece: Piece?) -> ContentExitLaw.Piece? in
                    guard let piece else { return nil }
                    return ContentExitLaw.Piece(isViewOnce: piece.isViewOnce, isBlurred: piece.isBlurred, effectFlags: piece.effectFlags)
                }
            )
        }
    }

    public static func shape(of subject: Subject) -> Shape {
        Shape(kind: kind(of: subject), flags: flags(of: subject))
    }

    // MARK: - Type

    private static let callKinds: Set<String> = ["call", "call-live"]

    private static func kind(of subject: Subject) -> MessageContentKind {
        if subject.deletedAt != nil { return .deleted }
        if subject.messageType == "system" { return callKinds.contains(subject.metadata.kind ?? "") ? .call : .system }
        if subject.messageType == "sticker" || subject.metadata.carriesSticker { return .sticker }
        if subject.messageType == "location" || subject.metadata.carriesLocation { return .location }
        if subject.metadata.carriesPoll { return .poll }
        let pieces = subject.pieces
        if pieces.count > 1 { return .multi }
        if let only = pieces.first { return pieceKind(only) }
        return holdsWebAddress(subject.content ?? "") ? .link : .text
    }

    private static func pieceKind(_ piece: Piece) -> MessageContentKind {
        if isContactCard(mimeType: piece.mimeType ?? "", fileName: piece.originalName ?? piece.fileName) { return .contact }
        let mime = (piece.mimeType ?? "").lowercased()
        if mime.hasPrefix("image/") { return .image }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("video/") { return .video }
        return .file
    }

    /// `(?<![@\w])https?://\S`, `\w` au sens ASCII de JavaScript.
    private static let webAddress = LiteralRegex.compile(
        pattern: "(?<![@A-Za-z0-9_])https?://\\S",
        options: [.caseInsensitive]
    )

    private static func holdsWebAddress(_ text: String) -> Bool {
        webAddress.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)) != nil
    }

    // MARK: - Carte de visite — `isContactCardAttachment` (`packages/shared/utils/vcard.ts`)

    private static let contactCardAliases: Set<String> = ["text/vcard", "text/x-vcard", "text/directory", "text/x-vcf"]
    private static let genericMimeTypes: Set<String> = ["", "application/octet-stream", "text/plain", "application/vcard"]

    private static func bareMimeType(_ mimeType: String) -> String {
        let head = mimeType.split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
        return head.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func isContactCard(mimeType: String, fileName: String?) -> Bool {
        let bare = bareMimeType(mimeType)
        if contactCardAliases.contains(bare) { return true }
        guard genericMimeTypes.contains(bare), let fileName, !fileName.isEmpty else { return false }
        let name = fileName.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return name.hasSuffix(".vcf") || name.hasSuffix(".vcard")
    }

    // MARK: - Drapeaux

    private static func flags(of subject: Subject) -> Flags {
        let pieces = subject.pieces
        let bits = pieces.reduce(subject.effectFlags ?? 0) { $0 | ($1.effectFlags ?? 0) }
        let ephemeralBits = MessageEffectFlags.ephemeral.rawValue | MessageEffectFlags.ephemeralAfterRead.rawValue
        return Flags(
            viewOnce: subject.isViewOnce == true
                || pieces.contains { $0.isViewOnce == true }
                || (bits & MessageEffectFlags.viewOnce.rawValue) != 0,
            blurred: subject.isBlurred == true
                || pieces.contains { $0.isBlurred == true }
                || (bits & MessageEffectFlags.blurred.rawValue) != 0,
            encrypted: !DeviceTranslationEligibility.serverReadsMessage(
                conversationEncryptionMode: nil,
                isEncrypted: subject.isEncrypted == true,
                encryptionMode: subject.encryptionMode
            ),
            ephemeral: subject.expiresAt != nil || (subject.ephemeralDuration ?? 0) > 0 || (bits & ephemeralBits) != 0,
            optimistic: subject.id.hasPrefix("cid_"),
            failed: subject.failed == true,
            captureNotice: subject.messageType == "system" && subject.metadata.kind == CaptureNoticeMetadata.kind
        )
    }
}
