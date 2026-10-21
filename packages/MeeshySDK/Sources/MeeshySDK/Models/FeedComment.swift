import Foundation

// MARK: - Feed Comment Model
public struct FeedComment: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    /// Le contour équipé de l'auteur du commentaire (#10946) ; `nil` sans contour.
    public var authorRing: ServedProfileDecorItem? = nil
    public let parentId: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var replies: Int
    public var effectFlags: Int
    public var originalLanguage: String?
    public var translatedContent: String?
    /// TOUTES les traductions servies du commentaire, par langue. Sans elles,
    /// `translatedContent` — résolu une fois au mapping — restait dans
    /// l'ancienne langue quand le lecteur changeait la sienne : le post se
    /// re-résolvait, ses commentaires non. `resolved(preferredLanguages:)`
    /// redescend le Prisme depuis ce dictionnaire, sans re-fetch.
    public var translations: [String: PostTranslation]? = nil
    /// Emojis avec lesquels l'utilisateur courant a réagi sur ce commentaire.
    /// Hydraté depuis `APIPostComment.currentUserReactions` au mapping.
    /// Persisté dans le cache GRDB iOS via le Codable manuel ci-dessous —
    /// permet de restaurer l'état "liké par moi" au cold start sans API call.
    public var currentUserReactions: [String]?
    /// Média unique attaché au commentaire (image/vidéo/audio). Réutilise `FeedMedia`
    /// (même bridge `toMessageAttachment()` que les posts → mêmes viewers inline +
    /// plein écran que les messages). Vide pour un commentaire texte. Le pipeline
    /// audio enrichit la transcription/`translatedAudios` via `comment:media-updated`.
    public var media: [FeedMedia]
    /// Lieu attaché au commentaire (`APIPostComment.location`, hissé par le
    /// gateway depuis `metadata.location`). Était décodé puis JETÉ au passage
    /// domaine — même panne que `FeedPost.location`, corrigée le 2026-07-30.
    public var location: SharedPlace? = nil
    /// **Le média du POST que ce commentaire CITE** (#6578) — distinct de
    /// `media` ci-dessus, qui porte les pièces JOINTES au commentaire. Les deux
    /// peuvent coexister : « regarde la deuxième photo » + ses propres clichés.
    /// `nil` ⇒ le commentaire parle du post, pas d'un média en particulier.
    public var quotedMedia: CommentQuotedMedia? = nil
    /// `[rawURL: token]` — la carte des liens suivis du commentaire, pour son
    /// texte ET la légende de son média (`APIPostComment.trackedLinkMap`, #9075).
    public var trackedLinkMap: [String: String] = [:]

    public var displayContent: String { translatedContent ?? content }

    /// Redescend le Prisme pour `preferredLanguages` depuis `translations` —
    /// la MÊME descente que `FeedPost.resolved` (`PrismTranslationResolver`).
    /// Un commentaire sans dictionnaire (cache gravé avant lui) garde ce qu'il
    /// affiche : rien ne permet de le re-résoudre sans re-fetch.
    public func resolved(preferredLanguages: [String]) -> FeedComment {
        guard let dict = translations, !dict.isEmpty else { return self }
        var copy = self
        copy.translatedContent = PrismTranslationResolver.resolve(
            originalLanguage: originalLanguage,
            candidates: dict.map { PrismCandidate(language: $0.key, value: $0.value.text) },
            preferredLanguages: preferredLanguages
        )?.text
        return copy
    }

    /// Une traduction ARRIVÉE (`comment:translation-updated`) rejoint le
    /// dictionnaire, puis le texte affiché se re-résout. Pour un commentaire
    /// sans dictionnaire qui affiche déjà une traduction, rien ne change : on
    /// ne sait pas quel rang elle occupe, et la remplacer pourrait descendre.
    public func mergingTranslation(_ text: String, language: String, preferredLanguages: [String]) -> FeedComment {
        guard translations != nil || translatedContent == nil else { return self }
        var copy = self
        var dict = translations ?? [:]
        dict[language] = PostTranslation(text: text)
        copy.translations = dict
        return copy.resolved(preferredLanguages: preferredLanguages)
    }

    public var effects: MessageEffects {
        MessageEffects(flags: MessageEffectFlags(rawValue: UInt32(clamping: effectFlags)))
    }

    /// Copie éditée (édition par l'auteur) : nouveau contenu + effets, tout le
    /// reste préservé. `content` étant immuable (let), l'édition passe par une
    /// copie. Un contenu MODIFIÉ invalide `translatedContent` — les traductions
    /// décrivaient l'ancien texte ; le pipeline serveur régénère et les vues se
    /// mettent à jour via `comment:translation-updated`.
    public func withEditedContent(_ newContent: String, effectFlags newFlags: Int) -> FeedComment {
        var edited = FeedComment(
            id: id, author: author, authorId: authorId, authorUsername: authorUsername,
            authorAvatarURL: authorAvatarURL,
            content: newContent, timestamp: timestamp, likes: likes, replies: replies,
            parentId: parentId, effectFlags: newFlags,
            originalLanguage: originalLanguage,
            translatedContent: newContent == content ? translatedContent : nil,
            translations: newContent == content ? translations : nil,
            currentUserReactions: currentUserReactions, media: media, location: location,
            // Une ÉDITION ne change pas ce dont le commentaire PARLE : la
            // citation survit au nouveau texte, comme elle survit en base.
            quotedMedia: quotedMedia,
            trackedLinkMap: trackedLinkMap
        )
        edited.authorRing = authorRing
        return edited
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorUsername: String? = nil,
                authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0,
                parentId: String? = nil, effectFlags: Int = 0,
                originalLanguage: String? = nil, translatedContent: String? = nil,
                translations: [String: PostTranslation]? = nil,
                currentUserReactions: [String]? = nil, media: [FeedMedia] = [],
                location: SharedPlace? = nil, quotedMedia: CommentQuotedMedia? = nil,
                trackedLinkMap: [String: String] = [:]) {
        self.id = id; self.author = author; self.authorId = authorId; self.authorUsername = authorUsername
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL; self.parentId = parentId
        self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
        self.effectFlags = effectFlags
        self.originalLanguage = originalLanguage; self.translatedContent = translatedContent
        self.translations = translations
        self.currentUserReactions = currentUserReactions
        self.media = media
        self.location = location
        self.quotedMedia = quotedMedia
        self.trackedLinkMap = trackedLinkMap
    }
}

extension FeedComment: CacheIdentifiable {}

extension FeedComment: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, parentId, content, timestamp, likes, replies
        case effectFlags, originalLanguage, translatedContent, currentUserReactions, media, location
        case quotedMedia, trackedLinkMap, translations, authorRing
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        parentId = try c.decodeIfPresent(String.self, forKey: .parentId)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        replies = try c.decode(Int.self, forKey: .replies)
        effectFlags = try c.decodeIfPresent(Int.self, forKey: .effectFlags) ?? 0
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        // `decodeIfPresent` : un blob gravé avant le champ se relit sans dictionnaire.
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        media = try c.decodeIfPresent([FeedMedia].self, forKey: .media) ?? []
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        // `decodeIfPresent` : les blobs de cache gravés AVANT le champ se
        // relisent sans perte — un commentaire d'avant #6578 ne cite rien.
        quotedMedia = try c.decodeIfPresent(CommentQuotedMedia.self, forKey: .quotedMedia)
        trackedLinkMap = try c.decodeIfPresent([String: String].self, forKey: .trackedLinkMap) ?? [:]
        authorRing = try? c.decodeIfPresent(ServedProfileDecorItem.self, forKey: .authorRing)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encodeIfPresent(parentId, forKey: .parentId)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(replies, forKey: .replies)
        try c.encode(effectFlags, forKey: .effectFlags)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(authorRing, forKey: .authorRing)
        try c.encodeIfPresent(currentUserReactions, forKey: .currentUserReactions)
        if !media.isEmpty {
            try c.encode(media, forKey: .media)
        }
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(quotedMedia, forKey: .quotedMedia)
        if !trackedLinkMap.isEmpty { try c.encode(trackedLinkMap, forKey: .trackedLinkMap) }
    }
}
