import Foundation

// MARK: - Conversation Requests

public struct CreateConversationRequest: Encodable {
    public let type: String
    public let title: String?
    public let participantIds: [String]

    public init(type: String, title: String? = nil, participantIds: [String]) {
        self.type = type; self.title = title; self.participantIds = participantIds
    }
}

public struct CreateConversationResponse: Decodable {
    public let id: String
    public let type: String
    public let title: String?
    public let createdAt: Date
}

// MARK: - Reaction Requests

public struct AddReactionRequest: Encodable {
    public let messageId: String
    public let emoji: String

    public init(messageId: String, emoji: String) {
        self.messageId = messageId; self.emoji = emoji
    }
}

// MARK: - Mobile Transcription

/// `Codable` (et non `Encodable` seul) parce qu'une transcription faite sur
/// l'appareil doit pouvoir être PERSISTÉE : elle voyage dans
/// `CreatePostPayload`, le format on-disk de la file durable, qui est relu au
/// flush. Sans `Decodable`, un vocal composé hors ligne partait sans sa
/// transcription et le serveur la refaisait — le travail de l'appareil jeté, et
/// un texte possiblement différent de celui que l'auteur avait relu.
/// `Equatable` pour la même raison : `CreatePostPayload` l'est, et un test de
/// fidélité on-disk ne se prouve pas autrement.
public struct MobileTranscriptionSegment: Codable, Sendable, Equatable {
    public let text: String
    public let start: Double?
    public let end: Double?
    public let speakerId: String?

    public init(text: String, start: Double? = nil, end: Double? = nil, speakerId: String? = nil) {
        self.text = text; self.start = start; self.end = end; self.speakerId = speakerId
    }

    enum CodingKeys: String, CodingKey {
        case text, start, end
        case speakerId = "speaker_id"
    }
}

public struct MobileTranscriptionPayload: Codable, Sendable, Equatable {
    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [MobileTranscriptionSegment]

    public init(text: String, language: String, confidence: Double? = nil,
                durationMs: Int? = nil, segments: [MobileTranscriptionSegment] = []) {
        self.text = text; self.language = language
        self.confidence = confidence; self.durationMs = durationMs; self.segments = segments
    }

    enum CodingKeys: String, CodingKey {
        case text, language, confidence, segments
        case durationMs = "duration_ms"
    }
}

// MARK: - Post Requests

public struct CreatePostRequest: Encodable {
    public let content: String?
    public let type: String
    public let visibility: String
    public let moodEmoji: String?
    public let visibilityUserIds: [String]?
    public let mediaIds: [String]?
    public let audioUrl: String?
    public let audioDuration: Int?
    public let originalLanguage: String?
    public let mobileTranscription: MobileTranscriptionPayload?
    /// La publication que celle-ci repartage. **Seul porteur de l'attribution
    /// d'une republication dans cette charge** : il n'y a pas de champ
    /// `viaUsername` ici, et il n'y en a jamais eu qui soit lu —
    /// `CreatePostSchema` ne le déclare pas, et un `z.object()` écarte
    /// silencieusement les clés inconnues. Le « via @X » se relit de
    /// `repostOf.author.username` (`StoryModels.toStatusEntry`).
    public let repostOfId: String?
    /// Lieu partagé (picker → `SharedPlace`) — même clé `location` top-level que
    /// pour un message ou un commentaire, hissée par le gateway depuis
    /// `metadata.location` (Task 9).
    public let location: SharedPlace?
    /// Pistes audio de composition (`audioPlayerObjects`). Permet à un POST ou
    /// un REEL de porter un son EMPRUNTÉ (`soundId`) sans média uploadé — même
    /// blob que `CreateStoryRequest.storyEffects`, même schéma gateway.
    public let storyEffects: StoryEffects?
    /// Opt-in auteur : extraction de la bande-son des VIDÉOS du post vers la
    /// bibliothèque de sons (miroir de `CreatePostSchema.allowSoundExtraction`).
    public let allowSoundExtraction: Bool?
    /// Les personnes que le post NOMME sans que son texte le dise (note sous le
    /// contenu, métadonnée silencieuse). Jamais les INLINE : le serveur les
    /// relit du `content` lui-même, et les déclarer ouvrirait un second chemin
    /// vers le même fait.
    public let mentions: [PostMentionInput]?
    /// Texte alternatif par média (accessibilité, `PostMedia.alt`) — clé = un
    /// id de `mediaIds` ci-dessus, ignoré côté gateway pour tout id qui n'y
    /// figure pas (miroir de `CreatePostSchema.mediaAlt`).
    public let mediaAlt: [String: String]?
    /// Grain de découvrabilité géographique DEMANDÉ — le second opt-in de la
    /// spec du 2026-08-02, INDÉPENDANT de `location` ci-dessus : afficher un
    /// lieu sur un contenu et rendre ce contenu trouvable à proximité sont
    /// deux choix séparés, l'un n'impliquant jamais l'autre.
    ///
    /// Ce champ ne transporte QUE le niveau d'arrondi souhaité. La
    /// coordonnée part EXACTE dans `location` et le serveur seul la quantifie
    /// avant d'écrire `Post.geoPoint` et `Post.geoPrecision`.
    ///
    /// `nil` OMET la clé, et son absence vaut « non découvrable » côté
    /// gateway. Ce n'est pas un détail d'encodage : le schéma est un
    /// `z.enum().optional()`, qui REJETTE un `null` explicite — et un défaut
    /// non nul rendrait trouvable un contenu que personne n'a choisi de
    /// rendre trouvable.
    public let discoverabilityPrecision: DiscoverabilityPrecision?

    public init(content: String? = nil, type: String = "POST", visibility: String = "PUBLIC", moodEmoji: String? = nil, visibilityUserIds: [String]? = nil, mediaIds: [String]? = nil, audioUrl: String? = nil, audioDuration: Int? = nil, originalLanguage: String? = nil, mobileTranscription: MobileTranscriptionPayload? = nil, repostOfId: String? = nil, location: SharedPlace? = nil, storyEffects: StoryEffects? = nil, allowSoundExtraction: Bool? = nil, mentions: [PostMentionInput]? = nil, mediaAlt: [String: String]? = nil, discoverabilityPrecision: DiscoverabilityPrecision? = nil) {
        self.content = content; self.type = type; self.visibility = visibility
        self.moodEmoji = moodEmoji; self.visibilityUserIds = visibilityUserIds
        self.mediaIds = mediaIds; self.audioUrl = audioUrl; self.audioDuration = audioDuration
        self.originalLanguage = originalLanguage
        self.mobileTranscription = mobileTranscription
        self.repostOfId = repostOfId
        self.location = location
        self.storyEffects = storyEffects
        self.allowSoundExtraction = allowSoundExtraction
        self.mentions = mentions
        self.mediaAlt = mediaAlt
        self.discoverabilityPrecision = discoverabilityPrecision
    }
}

/// Corps de `PATCH /posts/:postId/comments/:commentId` — édition par l'auteur.
/// `nil` = champ inchangé ; `effectFlags: 0` retire tous les effets.
public struct UpdateCommentRequest: Encodable {
    public let content: String?
    public let effectFlags: Int?

    public init(content: String? = nil, effectFlags: Int? = nil) {
        self.content = content
        self.effectFlags = effectFlags
    }
}

public struct CreateCommentRequest: Encodable {
    public let content: String
    public let parentId: String?
    public let effectFlags: Int?
    /// IDs des PostMedia déjà uploadés (uploadContext=comment) à attacher au
    /// commentaire. Wire aligné sur le contrat message-with-attachments (tableau),
    /// MAIS un commentaire ne porte QU'UN SEUL média : le gateway borne à 1.
    /// Omis du payload quand vide (endpoint texte-seul inchangé).
    public let attachmentIds: [String]?
    /// Transcription Whisper produite côté mobile pour un média audio (skip
    /// re-transcription serveur). Même structure que pour les posts.
    public let mobileTranscription: MobileTranscriptionPayload?
    public let originalLanguage: String?
    /// Lieu partagé (picker → `SharedPlace`) — même clé `location` que pour un
    /// message ou un post, hissée par le gateway depuis `metadata.location`.
    public let location: SharedPlace?

    public init(content: String, parentId: String? = nil, effectFlags: Int? = nil,
                attachmentIds: [String]? = nil,
                mobileTranscription: MobileTranscriptionPayload? = nil,
                originalLanguage: String? = nil,
                location: SharedPlace? = nil) {
        self.content = content
        self.parentId = parentId
        self.effectFlags = effectFlags
        self.attachmentIds = (attachmentIds?.isEmpty == false) ? attachmentIds : nil
        self.mobileTranscription = mobileTranscription
        self.originalLanguage = originalLanguage
        self.location = location
    }
}

public struct LikeRequest: Encodable {
    public let emoji: String
    public init(emoji: String) {
        self.emoji = emoji
    }
}

/// Modification de la position d'un post à l'ÉDITION — tri-état sur le fil :
/// requête sans la clé `location` = inchangé, `location: null` = retrait
/// (le gateway efface `metadata.location`), objet = remplacement. Le
/// `Encodable` synthétisé ne sachant pas émettre un `null` EXPLICITE,
/// `UpdatePostRequest` encode ce cas à la main (`encodeNil`).
public enum PostLocationUpdate: Sendable, Equatable {
    case set(SharedPlace)
    case remove
}

public struct UpdatePostRequest: Encodable, Sendable {
    public let content: String?
    public let visibility: String?
    /// `nil` = « ne touche pas au champ », PAS « vide-le ». L'`Encodable`
    /// synthétisé omet les optionnels `nil` du JSON, et le gateway ne réécrit
    /// le champ que s'il est présent (`PostService.updatePost` :
    /// `if (data.visibilityUserIds !== undefined)`). Pour NETTOYER une liste
    /// d'audience devenue orpheline, envoyer `[]` — accepté par
    /// `UpdatePostSchema` sauf pour `EXCEPT`/`ONLY`, que son `refine` exige
    /// non vides.
    public let visibilityUserIds: [String]?
    public let moodEmoji: String?
    /// Source language. Changing it re-runs the Prisme translation pipeline.
    public let originalLanguage: String?
    /// Editable only between "POST" and "REEL" (gateway enforces the rest).
    public let type: String?
    /// Ids of attached media (PostMedia) to detach during the edit.
    public let removeMediaIds: [String]?
    /// Full replacement composition blob for a STORY edit. On a STORY, its
    /// presence counts as a CONTENT edit — the gateway resets views/reactions
    /// (`engagementReset`) while keeping the publication date.
    public let storyEffects: StoryEffects?
    /// Ids of freshly uploaded media (TUS, postId=null) to attach during the
    /// edit — same contract as `CreateStoryRequest.mediaIds`.
    public let mediaIds: [String]?
    /// Tri-état (cf. doc de `PostLocationUpdate`) : `nil` = clé absente du
    /// JSON (inchangé), `.remove` = `location: null`, `.set` = objet.
    public let location: PostLocationUpdate?
    /// Les personnes que ce contenu NOMME sans que son texte le dise, à
    /// l'édition. Tri-état, comme côté gateway (`reconcilePostMentions`) :
    /// `nil` = clé absente, les déclarées survivent ; `[]` = elles partent
    /// toutes ; une liste REMPLACE l'ensemble déclaré.
    ///
    /// Le `nil` n'est pas une commodité mais la seule lecture juste pour un
    /// chemin d'édition qui n'affiche pas les références (l'édition de texte
    /// d'un post) : envoyer `[]` depuis là révoquerait des références que
    /// l'auteur n'a jamais vues.
    ///
    /// INLINE n'y figure jamais — le serveur le dérive du texte à chaque
    /// écriture, et le déclarer ouvrirait un second chemin vers le même fait.
    public let mentions: [PostMentionInput]?
    /// Opt-in extraction bande-son vidéo — `nil` = inchangé (miroir de
    /// `UpdatePostSchema.allowSoundExtraction`).
    public let allowSoundExtraction: Bool?
    /// Texte alternatif par média — même contrat que
    /// `CreatePostRequest.mediaAlt` : clé = un id de `mediaIds` ci-dessus,
    /// ignoré côté gateway pour tout id qui n'y figure pas (un média déjà
    /// attaché au post ne se réécrit pas par ce canal).
    public let mediaAlt: [String: String]?

    public init(content: String? = nil, visibility: String? = nil, visibilityUserIds: [String]? = nil,
                moodEmoji: String? = nil, originalLanguage: String? = nil, type: String? = nil,
                removeMediaIds: [String]? = nil, storyEffects: StoryEffects? = nil,
                mediaIds: [String]? = nil, location: PostLocationUpdate? = nil,
                mentions: [PostMentionInput]? = nil, allowSoundExtraction: Bool? = nil,
                mediaAlt: [String: String]? = nil) {
        self.content = content; self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.moodEmoji = moodEmoji
        self.originalLanguage = originalLanguage
        self.type = type
        self.removeMediaIds = removeMediaIds
        self.storyEffects = storyEffects
        self.mediaIds = mediaIds
        self.location = location
        self.mentions = mentions
        self.allowSoundExtraction = allowSoundExtraction
        self.mediaAlt = mediaAlt
    }

    enum CodingKeys: String, CodingKey {
        case content, visibility, visibilityUserIds, moodEmoji, originalLanguage
        case type, removeMediaIds, storyEffects, mediaIds, location, mentions
        case allowSoundExtraction, mediaAlt
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(content, forKey: .content)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(visibilityUserIds, forKey: .visibilityUserIds)
        try c.encodeIfPresent(moodEmoji, forKey: .moodEmoji)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(removeMediaIds, forKey: .removeMediaIds)
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        try c.encodeIfPresent(mediaIds, forKey: .mediaIds)
        // `encodeIfPresent` suffit au tri-état : `nil` omet la clé, `[]`
        // l'émet vide. Pas besoin du `encodeNil` que le lieu réclame — là,
        // l'effacement s'écrit `null`, ici il s'écrit `[]`.
        try c.encodeIfPresent(mentions, forKey: .mentions)
        try c.encodeIfPresent(allowSoundExtraction, forKey: .allowSoundExtraction)
        try c.encodeIfPresent(mediaAlt, forKey: .mediaAlt)
        switch location {
        case .set(let place): try c.encode(place, forKey: .location)
        case .remove: try c.encodeNil(forKey: .location)
        case nil: break
        }
    }
}

/// Une personne que le post NOMME sans que son texte le dise — pastille posée
/// sur le canevas d'une story, choix dans un sélecteur.
///
/// Miroir de `PostMentionInputSchema` côté gateway. `userId` OU `username` :
/// un sélecteur rend un `User.id`, un canevas ne porte que le `@handle` qu'il
/// affiche — et c'est lui qui survit à un brouillon repris trois jours plus
/// tard, là où un id devrait être persisté en parallèle des effets. Le serveur
/// résout les pseudos avec la MÊME fonction que l'extraction de texte.
/// `Codable` et non `Encodable` seul : la file de publication hors-ligne
/// persiste la déclaration telle quelle, et doit donc savoir la relire.
public struct PostMentionInput: Codable, Sendable, Equatable {
    public let userId: String?
    public let username: String?
    /// `PINNED` | `NOTE` | `SILENT`. Jamais `INLINE` : le serveur le dérive du
    /// texte, et le déclarer ouvrirait un second chemin vers le même fait.
    ///
    /// `nil` reste accepté par le serveur, qui le lit PINNED — c'est ce que
    /// faisait l'ancien canal CANVAS, et c'est ce qui garde les versions déjà
    /// installées fonctionnelles.
    public let display: String?

    public init(userId: String? = nil, username: String? = nil, display: String? = nil) {
        self.userId = userId
        self.username = username
        self.display = display
    }

    /// Nommée par son pseudo — ce que porte un brouillon repris, là où un id
    /// devrait avoir été persisté en parallèle des effets.
    public static func handle(_ username: String, display: PostReferenceDisplay) -> PostMentionInput {
        PostMentionInput(userId: nil, username: username, display: display.rawValue)
    }

    /// Nommée par son id — ce que rend un sélecteur, et ce que porte un badge
    /// du canevas.
    public static func id(_ userId: String, display: PostReferenceDisplay) -> PostMentionInput {
        PostMentionInput(userId: userId, username: nil, display: display.rawValue)
    }
}

public struct CreateStoryRequest: Encodable {
    /// Le type de publication que ce corps crée.
    ///
    /// Il fut `= "STORY"`, figé. Ce littéral COMMANDAIT l'envoi : le composer
    /// pouvait offrir « Post », le corps disait « STORY », et le choix aurait
    /// eu l'air de marcher. C'est désormais l'appelant qui le pose — et le
    /// défaut reste `STORY`, si bien qu'aucun appelant historique ne publie
    /// autre chose qu'avant.
    ///
    /// Le CANEVAS voyage avec, quel que soit le type, et c'est la raison pour
    /// laquelle le format est porté ici plutôt que par un corps sans effets :
    /// le gateway persiste `storyEffects` pour n'importe quel `type`
    /// (`PostService.createPost`) et son `hasAnyContentCarrier` accepte une
    /// publication portée par le seul canevas.
    public let type: String
    public let content: String?
    public let storyEffects: StoryEffects?
    public let visibility: String
    public let visibilityUserIds: [String]?
    public let originalLanguage: String?
    public let mediaIds: [String]?
    public let repostOfId: String?
    /// Les nommés que `content` ne porte PAS. Sans ce champ, épingler quelqu'un
    /// sur le canevas imposait d'écrire son `@handle` dans la légende : le
    /// gateway n'extrayait les mentions que du texte du post.
    public let mentions: [PostMentionInput]?
    /// Opt-in de l'auteur pour l'extraction de la bande-son des vidéos de la
    /// story (miroir de `CreatePostSchema.allowSoundExtraction`). `nil` =
    /// l'auteur n'a rien tranché, le défaut serveur s'applique par SILENCE et
    /// non par écrasement.
    public let allowSoundExtraction: Bool?
    /// Texte alternatif par média (miroir de `CreatePostSchema.mediaAlt`).
    ///
    /// La clé est un id de `mediaIds` ci-dessus, et rien d'autre :
    /// `PostService.applyMediaAlt` filtre les clés absentes de `mediaIds`, donc
    /// une clé locale au composer serait acceptée par la requête et jetée par
    /// le serveur, sans erreur. Cf. `StoryMediaAltMapping.serverKeyed`.
    public let mediaAlt: [String: String]?

    public init(type: String = PostType.story.rawValue, content: String? = nil, storyEffects: StoryEffects? = nil, visibility: String = "PUBLIC", visibilityUserIds: [String]? = nil, originalLanguage: String? = nil, mediaIds: [String]? = nil, repostOfId: String? = nil, mentions: [PostMentionInput]? = nil, allowSoundExtraction: Bool? = nil, mediaAlt: [String: String]? = nil) {
        self.type = type
        self.content = content; self.storyEffects = storyEffects; self.visibility = visibility
        self.visibilityUserIds = visibilityUserIds
        self.originalLanguage = originalLanguage; self.mediaIds = mediaIds
        self.repostOfId = repostOfId
        self.mentions = mentions
        self.allowSoundExtraction = allowSoundExtraction
        self.mediaAlt = mediaAlt
    }
}

// MARK: - Preference Requests

public struct UpdateConversationPreferencesRequest: Encodable, Sendable {
    public var isPinned: Bool?
    public var isMuted: Bool?
    public var isArchived: Bool?
    public var categoryId: String?
    public var tags: [String]?
    public var reaction: String?
    public var customName: String?
    public var mentionsOnly: Bool?

    public init(isPinned: Bool? = nil, isMuted: Bool? = nil, isArchived: Bool? = nil, categoryId: String? = nil, tags: [String]? = nil, reaction: String? = nil, customName: String? = nil, mentionsOnly: Bool? = nil) {
        self.isPinned = isPinned; self.isMuted = isMuted; self.isArchived = isArchived
        self.categoryId = categoryId; self.tags = tags; self.reaction = reaction
        self.customName = customName; self.mentionsOnly = mentionsOnly
    }
}

// MARK: - Category

public struct ConversationCategory: Codable, Identifiable, Sendable, CacheIdentifiable {
    public let id: String
    public let name: String
    public let color: String?
    public let icon: String?
    public let order: Int?
    public let isExpanded: Bool?

    public init(id: String, name: String, color: String?, icon: String?, order: Int?, isExpanded: Bool?) {
        self.id = id
        self.name = name
        self.color = color
        self.icon = icon
        self.order = order
        self.isExpanded = isExpanded
    }
}

// MARK: - Translation

public struct TranslateRequest: Encodable {
    public let text: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let messageId: String?

    public init(text: String, sourceLanguage: String, targetLanguage: String, messageId: String? = nil) {
        self.text = text; self.sourceLanguage = sourceLanguage; self.targetLanguage = targetLanguage
        self.messageId = messageId
    }

    enum CodingKeys: String, CodingKey {
        case text
        case sourceLanguage = "source_language"
        case targetLanguage = "target_language"
        case messageId = "message_id"
    }
}

public struct TranslateResponse: Decodable, Sendable {
    public let translatedText: String
    public let detectedLanguage: String?

    enum CodingKeys: String, CodingKey {
        case translatedText = "translated_text"
        case detectedLanguage = "source_language"
    }
}

// MARK: - User Search

public struct UserSearchResult: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let isOnline: Bool?

    public init(
        id: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        isOnline: Bool? = nil
    ) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.isOnline = isOnline
    }
}

// MARK: - Attachment Status

/// Per-user playback / view stats for a single attachment.
///
/// The gateway returns rows keyed by `participantId` (cf. `MessageReadStatusService.getAttachmentStatusDetails`).
/// Historically this struct used `userId`, which caused `JSONDecoder` to fail
/// silently against the real payload, leaving the "Écouté" / "Vu" tabs empty
/// even when stats existed in MongoDB.
public struct AttachmentStatusUser: Decodable, Identifiable {
    public let participantId: String
    public let username: String
    public let avatar: String?
    public let viewedAt: Date?
    public let downloadedAt: Date?
    public let listenedAt: Date?
    public let watchedAt: Date?
    public let listenCount: Int?
    public let watchCount: Int?
    public let listenedComplete: Bool?
    public let watchedComplete: Bool?
    public let lastPlayPositionMs: Int?
    public let lastWatchPositionMs: Int?

    public var id: String { participantId }
}

// MARK: - Attachment Transcription

public struct TranscribeRequest: Encodable {
    public let force: Bool

    public init(force: Bool) {
        self.force = force
    }

    enum CodingKeys: String, CodingKey {
        case force
    }
}

// MARK: - Generic empty success for fire-and-forget

public struct EmptySuccess: Decodable {
    public init() {}
}

// MARK: - Attachment Translation

public struct AttachmentTranslateRequest: Encodable {
    public let targetLanguages: [String]
    public let sourceLanguage: String?
    public let generateVoiceClone: Bool?

    public init(
        targetLanguages: [String],
        sourceLanguage: String? = nil,
        generateVoiceClone: Bool? = nil
    ) {
        self.targetLanguages = targetLanguages
        self.sourceLanguage = sourceLanguage
        self.generateVoiceClone = generateVoiceClone
    }
}

public struct AttachmentTranslationResult: Decodable, Sendable {
    public let id: String
    public let targetLanguage: String
    public let translatedText: String?
    public let audioUrl: String?
    public let durationMs: Int?
    public let voiceCloned: Bool?

    public init(
        id: String,
        targetLanguage: String,
        translatedText: String? = nil,
        audioUrl: String? = nil,
        durationMs: Int? = nil,
        voiceCloned: Bool? = nil
    ) {
        self.id = id
        self.targetLanguage = targetLanguage
        self.translatedText = translatedText
        self.audioUrl = audioUrl
        self.durationMs = durationMs
        self.voiceCloned = voiceCloned
    }
}

public struct AttachmentTranslateResponse: Decodable, Sendable {
    public let status: String?
    public let jobId: String?
    public let translations: [AttachmentTranslationResult]

    public init(status: String?, jobId: String?, translations: [AttachmentTranslationResult]) {
        self.status = status
        self.jobId = jobId
        self.translations = translations
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        jobId = try container.decodeIfPresent(String.self, forKey: .jobId)
        translations = (try? container.decodeIfPresent([AttachmentTranslationResult].self, forKey: .translations)) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case status, jobId, translations
    }
}

/// Thrown by `AttachmentService.translate` when the gateway returns HTTP 403
/// with a consent-required payload (e.g. `AUDIO_TRANSLATION_NOT_ENABLED`).
public struct AttachmentConsentError: Error, Sendable {
    public let code: String
    public let message: String
    public let requiredConsents: [String]

    public init(code: String, message: String, requiredConsents: [String]) {
        self.code = code
        self.message = message
        self.requiredConsents = requiredConsents
    }
}

/// Decodable shape of the HTTP 403 body for consent-required 403 responses.
struct AttachmentConsentErrorBody: Decodable {
    let error: String
    let message: String?
    let requiredConsents: [String]?
}
