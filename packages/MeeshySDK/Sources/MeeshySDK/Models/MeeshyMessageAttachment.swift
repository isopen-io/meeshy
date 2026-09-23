import Foundation

// MARK: - Message Attachment

/// D4 — a responsive downscaled WebP variant of an image attachment, used to
/// pick the smallest sufficient image instead of fetching the multi-MB original
/// for inline previews. Non-encrypted images only. Mirrors the gateway payload.
public struct MeeshyImageVariant: Codable, Sendable, Hashable {
    public let width: Int
    public let height: Int
    public let url: String
    public let size: Int
    public let format: String

    public init(width: Int, height: Int, url: String, size: Int, format: String = "webp") {
        self.width = width
        self.height = height
        self.url = url
        self.size = size
        self.format = format
    }

    private enum CodingKeys: String, CodingKey {
        case width, height, url, size, format
    }

    /// Le repli `"webp"` vit ICI et pas seulement dans l'init memberwise :
    /// `format` est le seul champ que le fil peut légitimement taire (une
    /// variante responsive EST une WebP — `UploadProcessor` la pose en dur),
    /// et un défaut d'init ne décode rien.
    ///
    /// Les quatre autres champs restent EXIGÉS : un élément sans `url`, sans
    /// dimension ou sans poids ne peut être ni élu ni mesuré — il n'est pas une
    /// variante. Son absence n'est pas fatale pour autant : les porteurs le
    /// décodent par `LossyImageVariants`, qui l'IGNORE au lieu de faire tomber
    /// le message ou le post entier.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        width = try c.decode(Int.self, forKey: .width)
        height = try c.decode(Int.self, forKey: .height)
        url = try c.decode(String.self, forKey: .url)
        size = try c.decode(Int.self, forKey: .size)
        format = try c.decodeIfPresent(String.self, forKey: .format) ?? "webp"
    }
}

/// Consomme un élément sans l'inspecter — avance le curseur au-delà d'un
/// élément malformé (jumeau de `_StorySkippedElement`, l'autre décodage lossy
/// du module).
private struct _SkippedImageVariant: Decodable {
    init(from decoder: Decoder) throws {}
}

/// Décodage TOLÉRANT PAR ÉLÉMENT de `imageVariants` — le SITE UNIQUE de cette
/// tolérance, déclaré par les quatre porteurs du champ
/// (`MeeshyMessageAttachment`, `APIMessageAttachment`, `FeedMedia`,
/// `APIPostMedia`).
///
/// Le fil ne garantit RIEN de la forme d'un élément : `api-schemas.ts` ne pose
/// aucun `required` sur les items et Prisma stocke un `Json?` libre. Un modèle
/// plus STRICT que son fil ne perd pas le champ — il perd le CONTENU PORTEUR :
/// une seule variante écrite à moitié faisait échouer le décodage du post ou du
/// message entier, qui DISPARAISSAIT de la liste (précédent Android, mémoire
/// `reference_android_model_stricter_than_the_wire`).
///
/// Sémantique conservée à l'identique de `decodeIfPresent` : clé absente ou
/// valeur `null` → `nil` (jamais un tableau vide inventé) ; présente → la liste
/// des éléments VALIDES, `[]` si aucun ne l'est. À l'encodage, la clé est omise
/// quand la valeur est `nil` (cf. la surcharge `KeyedEncodingContainer.encode`
/// ci-dessous) : les blobs de cache gardent exactement la forme d'avant.
@propertyWrapper
public struct LossyImageVariants: Codable, Sendable, Hashable {
    public var wrappedValue: [MeeshyImageVariant]?

    public init(wrappedValue: [MeeshyImageVariant]?) {
        self.wrappedValue = wrappedValue
    }

    public init(from decoder: Decoder) throws {
        guard var unkeyed = try? decoder.unkeyedContainer() else {
            wrappedValue = nil
            return
        }
        var kept: [MeeshyImageVariant] = []
        while !unkeyed.isAtEnd {
            if let variant = try? unkeyed.decode(MeeshyImageVariant.self) {
                kept.append(variant)
            } else {
                _ = try? unkeyed.decode(_SkippedImageVariant.self)
            }
        }
        wrappedValue = kept
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wrappedValue)
    }
}

/// Sans ces deux surcharges, le `Codable` SYNTHÉTISÉ d'un porteur appellerait
/// `decode`/`encode` (le type enveloppe n'est pas optionnel) : une clé absente
/// lèverait `keyNotFound` et une valeur nulle écrirait `"imageVariants": null`
/// là où le champ était simplement omis. Elles rendent le wrapper transparent —
/// même contrat que `decodeIfPresent`/`encodeIfPresent`.
public extension KeyedDecodingContainer {
    func decode(_ type: LossyImageVariants.Type, forKey key: Key) throws -> LossyImageVariants {
        try decodeIfPresent(type, forKey: key) ?? LossyImageVariants(wrappedValue: nil)
    }
}

public extension KeyedEncodingContainer {
    mutating func encode(_ value: LossyImageVariants, forKey key: Key) throws {
        guard let variants = value.wrappedValue else { return }
        try encode(variants, forKey: key)
    }
}

/// The current user's OWN playback progress for a media attachment, surfaced
/// per-request by the gateway (mirror of `currentUserReactions`). Lets a client
/// seed the in-bubble waveform tint (audio) / progress bar (video) on load,
/// synced across devices. `nil` = the current user never consumed this media.
/// @see CurrentUserAttachmentConsumption in packages/shared/types/attachment.ts
public struct MeeshyMediaConsumption: Codable, Sendable, Equatable {
    public var lastPlayPositionMs: Int?
    public var listenedComplete: Bool
    public var lastWatchPositionMs: Int?
    public var watchedComplete: Bool

    public init(
        lastPlayPositionMs: Int? = nil,
        listenedComplete: Bool = false,
        lastWatchPositionMs: Int? = nil,
        watchedComplete: Bool = false
    ) {
        self.lastPlayPositionMs = lastPlayPositionMs
        self.listenedComplete = listenedComplete
        self.lastWatchPositionMs = lastWatchPositionMs
        self.watchedComplete = watchedComplete
    }
}

public struct MeeshyMessageAttachment: Identifiable, Codable, Sendable {
    public let id: String
    public var messageId: String?
    public let fileName: String
    public let originalName: String
    public let mimeType: String
    public let fileSize: Int
    public let filePath: String
    public let fileUrl: String
    public var title: String?
    public var alt: String?
    public var caption: String?
    public var forwardedFromAttachmentId: String?
    public var isForwarded: Bool = false
    /// Le fichier sort de la caméra ou du micro DE L'APPLICATION.
    ///
    /// Déclaré par le client qui a capturé, à l'envoi — lui seul le sait, et
    /// seulement à cet instant — puis rendu par la passerelle sur la pièce
    /// jointe. La feuille de partage le lit pour décider si PUBLIER ce média
    /// demande confirmation : une capture n'a encore été vue par personne.
    ///
    /// Défaut `false` : les blobs `attachmentsJson` en cache écrits avant ce
    /// champ décodent donc en « pas une capture », ce qui est la lecture juste
    /// — l'absence ne peut pas valoir capture.
    /// @see `PublicationTargetRule.needsCaptureConfirmation`
    public var capturedInApp: Bool = false
    public var isViewOnce: Bool = false
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int = 0
    public var isBlurred: Bool = false
    /// Effets appliqués à la pièce (confettis, flou animé…), miroir
    /// `attachment`-level de `MeeshyMessage.effectFlags`. Absent avant
    /// #7070 — un blob `attachmentsJson` écrit plus tôt décode en `nil`,
    /// ce qui est juste : « pas d'effet connu », jamais « pas d'effet ».
    public var effectFlags: UInt32?
    public var width: Int?
    public var height: Int?
    /// D4 — responsive downscaled WebP variants for picking a lighter image.
    /// Décodage tolérant par élément (`LossyImageVariants`) : un blob
    /// `attachmentsJson` dont une variante est partielle rend quand même la
    /// pièce jointe.
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?
    /// BUG2 A' — réactions par-image agrégées (emoji→count), miroir du reactionSummary
    /// message-level. Vit dans attachmentsJson (Codable synthétisé), pas de colonne GRDB.
    public var reactionSummary: [String: Int]?
    /// BUG2 A' — emojis posés par l'utilisateur courant sur cette pièce jointe.
    public var currentUserReactions: [String]?
    public var thumbnailPath: String?
    public var thumbnailUrl: String?
    public var thumbHash: String?
    public var duration: Int?
    public var bitrate: Int?
    public var sampleRate: Int?
    public var codec: String?
    public var channels: Int?
    public var fps: Float?
    public var videoCodec: String?
    public var pageCount: Int?
    public var lineCount: Int?
    public let uploadedBy: String
    public var isAnonymous: Bool = false
    public let createdAt: Date
    public var isEncrypted: Bool = false
    public var encryptionMode: String?
    public var latitude: Double?
    public var longitude: Double?
    public var thumbnailColor: String = "4ECDC4"

    // Persisted transcription/translation metadata so GRDB load surfaces
    // these fields instantly without waiting for a REST round-trip.
    public var transcription: EmbeddedTranscription?
    public var audioTranslations: [String: EmbeddedAudioTranslation]?

    // ===== CONSUMPTION AGGREGATES (all-or-nothing) =====
    // Server-computed denormalized state surfaced in the message-info sheet:
    // who has viewed / downloaded / listened / watched this attachment. The
    // `…ByAllAt` markers are stamped by the gateway only once EVERY active
    // recipient has completed that action (WhatsApp-style). Optional so old
    // cached `attachmentsJson` blobs (written before these shipped) decode to
    // nil. Vit dans attachmentsJson (Codable synthétisé), pas de colonne GRDB.
    public var deliveredToAllAt: Date?
    public var viewedByAllAt: Date?
    public var downloadedByAllAt: Date?
    public var listenedByAllAt: Date?
    public var watchedByAllAt: Date?
    public var viewedCount: Int?
    public var downloadedCount: Int?
    public var consumedCount: Int?

    // ===== CURRENT-USER CONSUMPTION (per-request, cross-device sync) =====
    /// The current user's own playback progress (position + completion).
    /// Optional so old cached `attachmentsJson` blobs decode to nil.
    public var currentUserConsumption: MeeshyMediaConsumption?

    /// Lightweight Codable transcription embedded in attachmentsJson.
    public struct EmbeddedTranscription: Codable, Sendable {
        public var text: String
        public var language: String
        public var confidence: Double?
        public var durationMs: Int?
        public var speakerCount: Int?
        public var segments: [TranscriptionSegmentData]?

        public struct TranscriptionSegmentData: Codable, Sendable {
            public var text: String
            public var startTime: Double?
            public var endTime: Double?
            public var speakerId: String?
        }
    }

    /// Lightweight Codable audio translation embedded in attachmentsJson.
    public struct EmbeddedAudioTranslation: Codable, Sendable {
        public var url: String
        public var transcription: String?
        public var durationMs: Int?
        public var format: String?
        public var cloned: Bool?
        public var quality: Double?
        public var voiceModelId: String?
        public var ttsModel: String?
        public var segments: [EmbeddedTranscription.TranscriptionSegmentData]?
    }

    public var type: AttachmentType {
        if mimeType.starts(with: "image/") { return .image }
        if mimeType.starts(with: "video/") { return .video }
        if mimeType.starts(with: "audio/") { return .audio }
        if mimeType == "application/x-location" { return .location }
        return .file
    }

    public enum AttachmentType: String, Codable {
        case image, video, audio, file, location
    }

    public init(id: String = UUID().uuidString, messageId: String? = nil,
                fileName: String = "", originalName: String = "",
                mimeType: String = "application/octet-stream", fileSize: Int = 0,
                filePath: String = "", fileUrl: String = "",
                title: String? = nil, alt: String? = nil, caption: String? = nil,
                forwardedFromAttachmentId: String? = nil, isForwarded: Bool = false,
                capturedInApp: Bool = false,
                isViewOnce: Bool = false, maxViewOnceCount: Int? = nil, viewOnceCount: Int = 0, isBlurred: Bool = false,
                effectFlags: UInt32? = nil,
                width: Int? = nil, height: Int? = nil, thumbnailPath: String? = nil, thumbnailUrl: String? = nil, thumbHash: String? = nil,
                duration: Int? = nil, bitrate: Int? = nil, sampleRate: Int? = nil, codec: String? = nil, channels: Int? = nil,
                fps: Float? = nil, videoCodec: String? = nil, pageCount: Int? = nil, lineCount: Int? = nil,
                uploadedBy: String = "", isAnonymous: Bool = false, createdAt: Date = Date(),
                isEncrypted: Bool = false, encryptionMode: String? = nil,
                latitude: Double? = nil, longitude: Double? = nil, thumbnailColor: String = "4ECDC4",
                transcription: EmbeddedTranscription? = nil,
                audioTranslations: [String: EmbeddedAudioTranslation]? = nil,
                imageVariants: [MeeshyImageVariant]? = nil,
                reactionSummary: [String: Int]? = nil,
                currentUserReactions: [String]? = nil,
                deliveredToAllAt: Date? = nil, viewedByAllAt: Date? = nil,
                downloadedByAllAt: Date? = nil, listenedByAllAt: Date? = nil,
                watchedByAllAt: Date? = nil, viewedCount: Int? = nil,
                downloadedCount: Int? = nil, consumedCount: Int? = nil,
                currentUserConsumption: MeeshyMediaConsumption? = nil) {
        self.id = id; self.messageId = messageId; self.fileName = fileName; self.originalName = originalName
        self.mimeType = mimeType; self.fileSize = fileSize; self.filePath = filePath; self.fileUrl = fileUrl
        self.title = title; self.alt = alt; self.caption = caption
        self.forwardedFromAttachmentId = forwardedFromAttachmentId; self.isForwarded = isForwarded
        self.capturedInApp = capturedInApp
        self.isViewOnce = isViewOnce; self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount; self.isBlurred = isBlurred
        self.effectFlags = effectFlags
        self.width = width; self.height = height; self.thumbnailPath = thumbnailPath; self.thumbnailUrl = thumbnailUrl; self.thumbHash = thumbHash
        self.duration = duration; self.bitrate = bitrate; self.sampleRate = sampleRate; self.codec = codec; self.channels = channels
        self.fps = fps; self.videoCodec = videoCodec; self.pageCount = pageCount; self.lineCount = lineCount
        self.uploadedBy = uploadedBy; self.isAnonymous = isAnonymous; self.createdAt = createdAt
        self.isEncrypted = isEncrypted; self.encryptionMode = encryptionMode
        self.latitude = latitude; self.longitude = longitude; self.thumbnailColor = thumbnailColor
        self.transcription = transcription; self.audioTranslations = audioTranslations
        self.imageVariants = imageVariants
        self.reactionSummary = reactionSummary
        self.currentUserReactions = currentUserReactions
        self.deliveredToAllAt = deliveredToAllAt
        self.viewedByAllAt = viewedByAllAt
        self.downloadedByAllAt = downloadedByAllAt
        self.listenedByAllAt = listenedByAllAt
        self.watchedByAllAt = watchedByAllAt
        self.viewedCount = viewedCount
        self.downloadedCount = downloadedCount
        self.consumedCount = consumedCount
        self.currentUserConsumption = currentUserConsumption
    }

    public static func image(color: String = "4ECDC4") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "image/jpeg", thumbnailColor: color)
    }

    public static func video(durationMs: Int, color: String = "FF6B6B") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "video/mp4", duration: durationMs, thumbnailColor: color)
    }

    public static func audio(durationMs: Int, color: String = "9B59B6") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "audio/mp4", duration: durationMs, channels: 2, thumbnailColor: color)
    }

    public static func file(name: String, size: Int, color: String = "F8B500") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(fileName: name, originalName: name, mimeType: "application/octet-stream", fileSize: size, thumbnailColor: color)
    }

    public static func location(latitude: Double = 0, longitude: Double = 0, color: String = "2ECC71") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(mimeType: "application/x-location", latitude: latitude, longitude: longitude, thumbnailColor: color)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        let seconds = d / 1000
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    public var fileSizeFormatted: String {
        let kb = Double(fileSize) / 1024
        if kb < 1024 { return String(format: "%.1f KB", kb) }
        return String(format: "%.1f MB", kb / 1024)
    }
}

public extension Array where Element == MeeshyMessageAttachment {
    /// L'attachement qu'une CITATION représente et qu'un tap média cité OUVRE :
    /// le premier média (hors localisation), sinon le premier tout court.
    ///
    /// L'ICÔNE d'une citation (les trois constructeurs de `ReplyReference` :
    /// serveur `uiReplyTo`, optimiste `makeReplyReference`, bannière swipe
    /// `triggerReply`) et l'OUVERTURE (`MessageListViewController
    /// .openQuotedMedia`) DOIVENT résoudre la MÊME pièce jointe. Avant
    /// (2026-08-27) l'icône lisait `attachments.first` et l'ouverture
    /// `attachments.first(where: type != .location)` : dès qu'une localisation
    /// précédait le média, l'icône décrivait une pièce jointe et le plein
    /// écran en ouvrait une autre. Un seul point de vérité pour les deux.
    var quotedRepresentative: MeeshyMessageAttachment? {
        first(where: { $0.type != .location }) ?? first
    }
}
