import Foundation
import GRDB

public struct PostRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "feed_posts"

    public var id: String
    public var authorId: String
    public var authorUsername: String?
    public var authorDisplayName: String?
    public var authorAvatarURL: String?
    public var type: String?
    public var content: String?
    public var originalLanguage: String?
    public var visibility: String?
    public var likeCount: Int
    public var commentCount: Int
    public var repostCount: Int
    public var viewCount: Int
    public var bookmarkCount: Int
    public var shareCount: Int
    public var isLikedByMe: Bool
    public var isPinned: Bool
    public var isEdited: Bool
    public var isQuote: Bool
    public var moodEmoji: String?
    public var audioUrl: String?
    public var audioDuration: Int?
    public var mediaJson: Data?
    public var reactionSummaryJson: Data?
    public var repostOfJson: Data?
    public var mentionedUsersJson: Data?
    public var translationsJson: Data?
    public var createdAt: Date
    public var updatedAt: Date?
    public var changeVersion: Int64
    /// Lieu partagé (JSON `SharedPlace`), hissé depuis `APIPost.location`.
    /// Stocké en texte comme sur `MessageRecord.locationJson` (Task 15) —
    /// même mécanique, même colonne texte plutôt que blob.
    public var locationJson: String?
    /// Liste nommée d'une audience EXCEPT/ONLY (JSON `[String]`). La colonne
    /// `visibility` seule ne suffit pas : rouvrir l'éditeur sur un post ONLY
    /// hydraté du cache afficherait « aucune personne » alors que le post en
    /// cible plusieurs. Texte nullable → les lignes antérieures décodent nil.
    public var visibilityUserIdsJson: String?
    /// Compteurs de PORTÉE que le cache ne gardait pas (#10400) : seul
    /// `viewCount` y vivait, et le repli hors ligne reconstruisait des posts à
    /// « N likes · 0 impression ». `nil` = jamais reçu (ligne antérieure à la
    /// colonne, ou serveur qui ne l'a pas servi) — distinct d'un vrai zéro.
    public var impressionCount: Int?
    public var postOpenCount: Int?
    public var playCount: Int?
    public var qualifiedViewCount: Int?
    /// Le contour équipé de l'auteur (#10946), en JSON `ServedProfileDecorItem` : le repli hors
    /// ligne ne perd pas le contour. `nil` = sans contour ou ligne antérieure à la colonne.
    public var authorRingJson: String?

    public init(
        id: String, authorId: String,
        authorUsername: String?, authorDisplayName: String?,
        authorAvatarURL: String?, type: String?,
        content: String?, originalLanguage: String?,
        visibility: String?,
        likeCount: Int, commentCount: Int,
        repostCount: Int, viewCount: Int,
        bookmarkCount: Int, shareCount: Int,
        isLikedByMe: Bool, isPinned: Bool,
        isEdited: Bool, isQuote: Bool,
        moodEmoji: String?, audioUrl: String?, audioDuration: Int?,
        mediaJson: Data?, reactionSummaryJson: Data?,
        repostOfJson: Data?, mentionedUsersJson: Data?,
        translationsJson: Data?,
        createdAt: Date, updatedAt: Date?,
        changeVersion: Int64,
        locationJson: String? = nil,
        visibilityUserIdsJson: String? = nil,
        impressionCount: Int? = nil,
        postOpenCount: Int? = nil,
        playCount: Int? = nil,
        qualifiedViewCount: Int? = nil,
        authorRing: ServedProfileDecorItem? = nil
    ) {
        self.id = id
        self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorDisplayName = authorDisplayName
        self.authorAvatarURL = authorAvatarURL
        self.type = type
        self.content = content
        self.originalLanguage = originalLanguage
        self.visibility = visibility
        self.likeCount = likeCount
        self.commentCount = commentCount
        self.repostCount = repostCount
        self.viewCount = viewCount
        self.bookmarkCount = bookmarkCount
        self.shareCount = shareCount
        self.isLikedByMe = isLikedByMe
        self.isPinned = isPinned
        self.isEdited = isEdited
        self.isQuote = isQuote
        self.moodEmoji = moodEmoji
        self.audioUrl = audioUrl
        self.audioDuration = audioDuration
        self.mediaJson = mediaJson
        self.reactionSummaryJson = reactionSummaryJson
        self.repostOfJson = repostOfJson
        self.mentionedUsersJson = mentionedUsersJson
        self.translationsJson = translationsJson
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.changeVersion = changeVersion
        self.locationJson = locationJson
        self.visibilityUserIdsJson = visibilityUserIdsJson
        self.impressionCount = impressionCount
        self.postOpenCount = postOpenCount
        self.playCount = playCount
        self.qualifiedViewCount = qualifiedViewCount
        self.authorRingJson = authorRing.flatMap { try? JSONEncoder().encode($0) }.flatMap { String(data: $0, encoding: .utf8) }
    }
}

public extension PostRecord {
    /// Position décodée depuis `locationJson`, `nil` quand le post n'en porte
    /// pas. Décodage paresseux (comme `CommentRecord.reactionSummary`) plutôt
    /// que colonne stockée séparément — un seul champ JSON fait foi.
    /// Liste nommée décodée — même décodage paresseux que `location`.
    var visibilityUserIds: [String]? {
        guard let visibilityUserIdsJson, let data = visibilityUserIdsJson.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode([String].self, from: data)
    }

    var authorRing: ServedProfileDecorItem? {
        guard let authorRingJson, let data = authorRingJson.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(ServedProfileDecorItem.self, from: data)
    }

    var location: SharedPlace? {
        guard let locationJson, let data = locationJson.data(using: .utf8) else { return nil }
        return JSONDecoder().decodeOrLog(SharedPlace.self, from: data, field: "post locationJson", id: id)
    }
}

extension PostRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
