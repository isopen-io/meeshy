import Foundation

public struct APIMessageAttachment: Decodable, Sendable {
    // ── Identifiers ──
    public let id: String
    public let messageId: String?

    // ── File info ──
    public let fileName: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Int?
    public let fileUrl: String?

    // ── Visual / thumbnail ──
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let width: Int?
    public let height: Int?
    /// D4 — responsive downscaled WebP variants for `srcset`-style selection.
    /// Décodage tolérant par élément (`LossyImageVariants`).
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?
    /// BUG2 A' — réactions par-image agrégées (emoji→count).
    public let reactionSummary: [String: Int]?
    /// BUG2 A' — emojis posés par l'utilisateur courant sur cette pièce jointe.
    public let currentUserReactions: [String]?
    /// Phase 2 — progression de consommation PERSONNELLE du current-user
    /// (position + complétion), pour seeder le tint waveform / progress-bar.
    public let currentUserConsumption: MeeshyMediaConsumption?

    // ── Audio / video ──
    public let duration: Int?
    public let bitrate: Int?
    public let sampleRate: Int?
    public let codec: String?
    public let channels: Int?
    public let fps: Double?
    public let videoCodec: String?

    // ── Document ──
    public let pageCount: Int?
    public let lineCount: Int?

    // ── Location (legacy fields, kept for compat) ──
    public let latitude: Double?
    public let longitude: Double?

    // ── Uploader / timestamps ──
    public let uploadedBy: String?
    public let isAnonymous: Bool?
    public let createdAt: Date?

    // NOTE: `metadata` (generic JSON blob) is intentionally NOT decoded
    // here — iOS has no JSONValue-style any-codable helper yet and no
    // current consumer reads it. Add when needed.

    // ── Forwarding ──
    public let forwardedFromAttachmentId: String?
    public let isForwarded: Bool?

    // ── Provenance ──
    /// Le fichier sort de la caméra ou du micro DE L'APPLICATION. Déclaré par
    /// le client qui a capturé, à l'envoi — lui seul le sait, et seulement à cet
    /// instant — puis rendu ici par la passerelle. La feuille de partage le lit
    /// pour décider si PUBLIER ce média demande confirmation.
    /// @see `PublicationTargetRule.needsCaptureConfirmation`
    public let capturedInApp: Bool?

    // ── View-once / Effects / Blur ──
    public let isViewOnce: Bool?
    public let maxViewOnceCount: Int?
    public let viewOnceCount: Int?
    public let isBlurred: Bool?
    public let effectFlags: UInt32?

    /// Protection DÉCLARÉE par le fil — `nil` quand il n'en dit RIEN (les deux
    /// drapeaux absents), ce qui n'est pas la même chose que « dit qu'elle est
    /// absente ». Site UNIQUE de la dérivation pour `ReplyReference
    /// .attachmentIsProtected`, que le chemin réseau (`uiReplyTo`) et le chemin
    /// cache (`MessagePersistenceActor`) gravent tous les deux.
    ///
    /// Un `false` fabriqué à partir d'un silence serait une AFFIRMATION : il
    /// rendrait la citation d'un média protégé indistinguable de celle d'un
    /// média ordinaire, et le jour où le fil se met à porter les drapeaux, le
    /// blob gravé continuerait de mentir. `nil` se laisse corriger.
    public var declaredProtection: Bool? {
        guard isViewOnce != nil || isBlurred != nil else { return nil }
        return (isViewOnce ?? false) || (isBlurred ?? false)
    }

    // ── Consumption tracking (R5 — denormalized counters surfaced in
    //    attachmentFullSelect; required to render the consumption strip
    //    and the per-attachment "delivered / viewed / listened / watched
    //    by all" timestamps). Pre-R7 these fields existed on the wire
    //    but iOS dropped them silently because `APIMessageAttachment`
    //    didn't declare them.
    public let deliveredToAllAt: Date?
    public let viewedByAllAt: Date?
    public let downloadedByAllAt: Date?
    public let listenedByAllAt: Date?
    public let watchedByAllAt: Date?
    public let viewedCount: Int?
    public let downloadedCount: Int?
    public let consumedCount: Int?

    // ── E2EE envelope (R5 — clients MUST receive these to decrypt the
    //    attachment payload. Pre-R7 they were sent by the gateway but
    //    dropped silently here because the iOS struct didn't declare them.
    public let isEncrypted: Bool?
    public let encryptionMode: String?
    public let encryptionIv: String?
    public let encryptionAuthTag: String?

    // ── Prisme Linguistique JSON blobs ──
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?

    // MARK: - CodingKeys

    private enum CodingKeys: String, CodingKey {
        case id, messageId
        case fileName, originalName, mimeType, fileSize, fileUrl
        case thumbnailUrl, thumbHash, width, height, imageVariants, reactionSummary, currentUserReactions, currentUserConsumption
        case duration, bitrate, sampleRate, codec, channels, fps, videoCodec
        case pageCount, lineCount
        case latitude, longitude
        case uploadedBy, isAnonymous, createdAt
        case forwardedFromAttachmentId, isForwarded, capturedInApp
        case isViewOnce, maxViewOnceCount, viewOnceCount, isBlurred, effectFlags
        case deliveredToAllAt, viewedByAllAt, downloadedByAllAt
        case listenedByAllAt, watchedByAllAt
        case viewedCount, downloadedCount, consumedCount
        case isEncrypted, encryptionMode, encryptionIv, encryptionAuthTag
        case transcription, translations
    }

    /// Custom `init(from:)` to isolate `transcription` and `translations`
    /// decode failures from the rest of the attachment. The Prisme
    /// Linguistique JSON blobs are the only fields that can carry
    /// partially-enriched payloads (e.g., a language entry mid-write by
    /// a translator worker). Without isolation, a single malformed entry
    /// would throw and the ENTIRE `APIMessageAttachment` decode would
    /// fail — `MessageSocketManager.decode(_:from:)` would then silently
    /// swallow the event and iOS would never see the enrichment. This
    /// init wraps both fields with `try?` so the rest of the attachment
    /// is still surfaced even if one Prisme blob is malformed.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decode(String.self, forKey: .id)
        self.messageId = try c.decodeIfPresent(String.self, forKey: .messageId)
        self.fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        self.originalName = try c.decodeIfPresent(String.self, forKey: .originalName)
        self.mimeType = try c.decodeIfPresent(String.self, forKey: .mimeType)
        self.fileSize = try c.decodeIfPresent(Int.self, forKey: .fileSize)
        self.fileUrl = try c.decodeIfPresent(String.self, forKey: .fileUrl)
        self.thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        self.thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        self.width = try c.decodeIfPresent(Int.self, forKey: .width)
        self.height = try c.decodeIfPresent(Int.self, forKey: .height)
        self._imageVariants = try c.decode(LossyImageVariants.self, forKey: .imageVariants)
        self.reactionSummary = try c.decodeIfPresent([String: Int].self, forKey: .reactionSummary)
        self.currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        self.currentUserConsumption = try c.decodeIfPresent(MeeshyMediaConsumption.self, forKey: .currentUserConsumption)
        self.duration = try c.decodeIfPresent(Int.self, forKey: .duration)
        self.bitrate = try c.decodeIfPresent(Int.self, forKey: .bitrate)
        self.sampleRate = try c.decodeIfPresent(Int.self, forKey: .sampleRate)
        self.codec = try c.decodeIfPresent(String.self, forKey: .codec)
        self.channels = try c.decodeIfPresent(Int.self, forKey: .channels)
        self.fps = try c.decodeIfPresent(Double.self, forKey: .fps)
        self.videoCodec = try c.decodeIfPresent(String.self, forKey: .videoCodec)
        self.pageCount = try c.decodeIfPresent(Int.self, forKey: .pageCount)
        self.lineCount = try c.decodeIfPresent(Int.self, forKey: .lineCount)
        self.latitude = try c.decodeIfPresent(Double.self, forKey: .latitude)
        self.longitude = try c.decodeIfPresent(Double.self, forKey: .longitude)
        self.uploadedBy = try c.decodeIfPresent(String.self, forKey: .uploadedBy)
        self.isAnonymous = try c.decodeIfPresent(Bool.self, forKey: .isAnonymous)
        self.createdAt = try c.decodeIfPresent(Date.self, forKey: .createdAt)
        self.forwardedFromAttachmentId = try c.decodeIfPresent(String.self, forKey: .forwardedFromAttachmentId)
        self.isForwarded = try c.decodeIfPresent(Bool.self, forKey: .isForwarded)
        self.capturedInApp = try c.decodeIfPresent(Bool.self, forKey: .capturedInApp)
        self.isViewOnce = try c.decodeIfPresent(Bool.self, forKey: .isViewOnce)
        self.maxViewOnceCount = try c.decodeIfPresent(Int.self, forKey: .maxViewOnceCount)
        self.viewOnceCount = try c.decodeIfPresent(Int.self, forKey: .viewOnceCount)
        self.isBlurred = try c.decodeIfPresent(Bool.self, forKey: .isBlurred)
        self.effectFlags = try c.decodeIfPresent(UInt32.self, forKey: .effectFlags)
        self.deliveredToAllAt = try c.decodeIfPresent(Date.self, forKey: .deliveredToAllAt)
        self.viewedByAllAt = try c.decodeIfPresent(Date.self, forKey: .viewedByAllAt)
        self.downloadedByAllAt = try c.decodeIfPresent(Date.self, forKey: .downloadedByAllAt)
        self.listenedByAllAt = try c.decodeIfPresent(Date.self, forKey: .listenedByAllAt)
        self.watchedByAllAt = try c.decodeIfPresent(Date.self, forKey: .watchedByAllAt)
        self.viewedCount = try c.decodeIfPresent(Int.self, forKey: .viewedCount)
        self.downloadedCount = try c.decodeIfPresent(Int.self, forKey: .downloadedCount)
        self.consumedCount = try c.decodeIfPresent(Int.self, forKey: .consumedCount)
        self.isEncrypted = try c.decodeIfPresent(Bool.self, forKey: .isEncrypted)
        self.encryptionMode = try c.decodeIfPresent(String.self, forKey: .encryptionMode)
        self.encryptionIv = try c.decodeIfPresent(String.self, forKey: .encryptionIv)
        self.encryptionAuthTag = try c.decodeIfPresent(String.self, forKey: .encryptionAuthTag)

        // ── Fault-tolerant Prisme Linguistique blobs ──
        // The two fields below CAN be partial/malformed during async
        // enrichment (translator workers writing in flight). `try?` here
        // is INTENTIONAL : we'd rather show the attachment without its
        // transcription / translations than lose the whole attachment.
        self.transcription = (try? c.decodeIfPresent(APIAttachmentTranscription.self, forKey: .transcription)) ?? nil
        self.translations = (try? c.decodeIfPresent([String: APIAttachmentTranslation].self, forKey: .translations)) ?? nil
    }
}
