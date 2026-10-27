import Foundation

// MARK: - Feed Media Model
public struct FeedMedia: Identifiable, Sendable, Codable {
    public let id: String
    public let type: FeedMediaType
    public let url: String?
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let thumbnailColor: String
    public var width: Int?
    public var height: Int?
    public var duration: Int?
    public var fileName: String?
    public var fileSize: String?
    public var pageCount: Int?
    /// Légende du média, telle que servie par `PostMedia.caption` (posts, réels,
    /// stories) — le texte que le plein écran affiche SOUS l'image ou la vidéo,
    /// et que VoiceOver lit à sa place.
    ///
    /// Elle existait sur le fil (`APIPostMedia.caption`) et dans le schéma
    /// (`PostMedia.caption`) mais n'était déclarée NI ici NI dans
    /// `toMessageAttachment()` : le décodeur la jetait, et le plein écran d'un
    /// média de post ou de commentaire ne pouvait structurellement rien montrer.
    public var caption: String?
    /// Texte alternatif du média (`PostMedia.alt`, #6738), écrit par l'auteur
    /// pour les lecteurs d'écran. Il était décodé sur `APIPostMedia` puis jeté
    /// ici : aucune surface ne pouvait le rendre à VoiceOver.
    public var alt: String?
    /// Langue SOURCE de `caption` (`PostMedia.captionLanguage`, #6280).
    public var captionLanguage: String?
    /// Traductions de `caption`, aplaties `langue → texte` — même dialecte que
    /// `MeeshyConversation.lastMessageTranslations` (`PostMedia.captionTranslations`,
    /// #6280). DISTINCTE de `translatedAudios` ci-dessous, qui traduit les PISTES
    /// audio, jamais le texte de la légende.
    public var captionTranslations: [String: String]?
    public var transcription: MessageTranscription?
    /// Per-language TTS variants of an audio media (Prisme Linguistique).
    /// Each carries the translated transcription text + the synthesized audio
    /// URL for that language. Populated for reel/feed audio from the gateway's
    /// `PostMedia.translations` map; empty for non-audio media or when the
    /// translator pipeline has not produced TTS variants yet.
    public var translatedAudios: [MessageTranslatedAudio]
    /// Variantes WebP responsive (D4) de l'image — `nil` pour une image chiffrée
    /// ou un média dont le fil n'en sert pas. Transportées jusqu'à
    /// `MeeshyMessageAttachment.imageVariants` pour que le plein écran élise la
    /// variante à la largeur d'écran (`ImageVariantSelector`) au lieu de charger
    /// l'original multi-Mo — la galerie ouverte depuis un post les perdait.
    /// Décodage tolérant par élément (`LossyImageVariants`) : un blob de feed
    /// persisté dont une variante est partielle rend quand même le média.
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?

    /// Ratio largeur/hauteur dérivé de `width`/`height`. `nil` si l'un des
    /// deux est absent ou si l'un des deux vaut 0 (évite une division par
    /// zéro et un faux ratio 0.0 pour une largeur nulle/corrompue).
    public var aspectRatio: Double? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return Double(width) / Double(height)
    }

    public init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil,
                thumbnailUrl: String? = nil, thumbHash: String? = nil,
                thumbnailColor: String = "4ECDC4",
                width: Int? = nil, height: Int? = nil, duration: Int? = nil,
                fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
                caption: String? = nil,
                alt: String? = nil,
                captionLanguage: String? = nil,
                captionTranslations: [String: String]? = nil,
                transcription: MessageTranscription? = nil,
                translatedAudios: [MessageTranslatedAudio] = [],
                imageVariants: [MeeshyImageVariant]? = nil) {
        self.id = id; self.type = type; self.url = url; self.thumbnailUrl = thumbnailUrl; self.thumbHash = thumbHash; self.thumbnailColor = thumbnailColor
        self.width = width; self.height = height; self.duration = duration
        self.fileName = fileName; self.fileSize = fileSize; self.pageCount = pageCount
        self.caption = caption
        self.alt = alt
        self.captionLanguage = captionLanguage
        self.captionTranslations = captionTranslations
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.imageVariants = imageVariants
    }

    /// La descente du Prisme sur LA LÉGENDE de ce média (#6280) — projection de
    /// `PrismTranslationResolver`, même règle que
    /// `MeeshyConversation.resolvedLastMessagePreview`. `nil` ⇒ servir `caption`
    /// TEL QUEL (règle #1 du Prisme : absence de traduction vers une langue
    /// préférée ⇒ le contenu original, jamais `translations.first`).
    public func resolvedCaption(preferredLanguages: [String]) -> String? {
        guard let captionTranslations, !captionTranslations.isEmpty else { return caption }
        return PrismTranslationResolver.resolve(
            originalLanguage: captionLanguage,
            translations: captionTranslations,
            preferredLanguages: preferredLanguages
        )?.text ?? caption
    }

    /// **Ce que VoiceOver lit pour ce média** (#6738) : le texte alternatif de
    /// l'auteur, sinon sa légende (servie dans la langue du lecteur), sinon
    /// `nil` — l'appelant pose alors son libellé générique par type.
    public func accessibilityDescription(preferredLanguages: [String]) -> String? {
        let texte = alt?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let texte, !texte.isEmpty { return texte }
        let legende = resolvedCaption(preferredLanguages: preferredLanguages)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let legende, !legende.isEmpty else { return nil }
        return legende
    }

    public static func image(color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func image(url: String, color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, url: url, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func video(duration: Int, color: String = "FF6B6B") -> FeedMedia {
        FeedMedia(type: .video, thumbnailColor: color, width: 1920, height: 1080, duration: duration)
    }

    public static func audio(duration: Int, color: String = "9B59B6") -> FeedMedia {
        FeedMedia(type: .audio, thumbnailColor: color, duration: duration)
    }

    public static func document(name: String, size: String, pages: Int, color: String = "F8B500") -> FeedMedia {
        FeedMedia(type: .document, thumbnailColor: color, fileName: name, fileSize: size, pageCount: pages)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        return MediaFormat.duration(d)
    }

    // Explicit Codable so a newly-added `translatedAudios` field stays
    // backward-compatible with feed blobs persisted before it existed: a
    // missing key decodes to `[]` instead of throwing `keyNotFound`, which
    // would otherwise drop the whole cached feed page on cold start.
    private enum CodingKeys: String, CodingKey {
        case id, type, url, thumbnailUrl, thumbHash, thumbnailColor
        case width, height, duration, fileName, fileSize, pageCount
        case caption, alt, captionLanguage, captionTranslations
        case transcription, translatedAudios, imageVariants
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(FeedMediaType.self, forKey: .type)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        thumbnailColor = try c.decode(String.self, forKey: .thumbnailColor)
        width = try c.decodeIfPresent(Int.self, forKey: .width)
        height = try c.decodeIfPresent(Int.self, forKey: .height)
        duration = try c.decodeIfPresent(Int.self, forKey: .duration)
        fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        fileSize = try c.decodeIfPresent(String.self, forKey: .fileSize)
        pageCount = try c.decodeIfPresent(Int.self, forKey: .pageCount)
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        alt = try c.decodeIfPresent(String.self, forKey: .alt)
        captionLanguage = try c.decodeIfPresent(String.self, forKey: .captionLanguage)
        captionTranslations = try c.decodeIfPresent([String: String].self, forKey: .captionTranslations)
        transcription = try c.decodeIfPresent(MessageTranscription.self, forKey: .transcription)
        translatedAudios = try c.decodeIfPresent([MessageTranslatedAudio].self, forKey: .translatedAudios) ?? []
        _imageVariants = try c.decode(LossyImageVariants.self, forKey: .imageVariants)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(url, forKey: .url)
        try c.encodeIfPresent(thumbnailUrl, forKey: .thumbnailUrl)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try c.encode(thumbnailColor, forKey: .thumbnailColor)
        try c.encodeIfPresent(width, forKey: .width)
        try c.encodeIfPresent(height, forKey: .height)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fileName, forKey: .fileName)
        try c.encodeIfPresent(fileSize, forKey: .fileSize)
        try c.encodeIfPresent(pageCount, forKey: .pageCount)
        try c.encodeIfPresent(caption, forKey: .caption)
        try c.encodeIfPresent(alt, forKey: .alt)
        try c.encodeIfPresent(captionLanguage, forKey: .captionLanguage)
        try c.encodeIfPresent(captionTranslations, forKey: .captionTranslations)
        try c.encodeIfPresent(transcription, forKey: .transcription)
        if !translatedAudios.isEmpty {
            try c.encode(translatedAudios, forKey: .translatedAudios)
        }
        try c.encodeIfPresent(imageVariants, forKey: .imageVariants)
    }
}

extension FeedMedia {
    /// Bridge to MeeshyMessageAttachment for reuse of media player components
    public func toMessageAttachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: fileName ?? "",
            originalName: fileName ?? "",
            mimeType: mimeTypeFromFeedType,
            fileSize: 0,
            fileUrl: url ?? "",
            alt: alt,
            caption: caption,
            width: width,
            height: height,
            thumbnailPath: nil,
            thumbnailUrl: thumbnailUrl,
            thumbHash: thumbHash,
            duration: duration.map { $0 * 1000 },
            latitude: nil,
            longitude: nil,
            thumbnailColor: thumbnailColor,
            imageVariants: imageVariants
        )
    }

    private var mimeTypeFromFeedType: String {
        switch type {
        case .image: return "image/jpeg"
        case .video: return "video/mp4"
        case .audio: return "audio/mpeg"
        case .document: return "application/pdf"
        }
    }
}
