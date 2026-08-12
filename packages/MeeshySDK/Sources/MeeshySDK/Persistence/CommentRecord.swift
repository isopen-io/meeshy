import Foundation
import os
import GRDB

public struct CommentRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "feed_comments"

    public var id: String
    public var postId: String
    public var parentId: String?
    public var authorId: String
    public var authorUsername: String?
    public var authorDisplayName: String?
    public var authorAvatarURL: String?
    public var content: String
    public var originalLanguage: String?
    public var translatedContent: String?
    public var likeCount: Int
    public var replyCount: Int
    public var effectFlags: Int
    public var createdAt: Date
    public var changeVersion: Int64
    /// Per-emoji aggregate counts (`[emoji: count]`) persisted from the
    /// `comment:reaction-added` / `comment:reaction-removed` / sync socket events.
    /// `nil` until the first reaction arrives — mirrors `PostRecord.reactionSummaryJson`
    /// so the displayed count survives an app restart instead of reverting to the
    /// last REST snapshot. Decoded lazily via the `reactionSummary` accessor.
    public var reactionSummaryJson: Data?
    /// Lieu partagé (JSON `SharedPlace`), hissé depuis `APIPostComment.location`.
    /// Stocké en texte comme sur `MessageRecord.locationJson` (Task 15) —
    /// même mécanique, même colonne texte plutôt que blob.
    public var locationJson: String?
    /// Médias du commentaire (JSON `[APIPostMedia]`), miroir de
    /// `PostRecord.mediaJson`. Réécrit par `comment:media-updated` quand le
    /// pipeline audio a produit la transcription et les variantes TTS : sans
    /// cette colonne l'enrichissement ne survivait pas au redémarrage.
    public var mediaJson: Data?

    public init(
        id: String, postId: String, parentId: String?,
        authorId: String, authorUsername: String?,
        authorDisplayName: String?, authorAvatarURL: String?,
        content: String, originalLanguage: String?,
        translatedContent: String?,
        likeCount: Int, replyCount: Int, effectFlags: Int,
        createdAt: Date, changeVersion: Int64,
        reactionSummaryJson: Data? = nil,
        locationJson: String? = nil,
        mediaJson: Data? = nil
    ) {
        self.id = id
        self.postId = postId
        self.parentId = parentId
        self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorDisplayName = authorDisplayName
        self.authorAvatarURL = authorAvatarURL
        self.content = content
        self.originalLanguage = originalLanguage
        self.translatedContent = translatedContent
        self.likeCount = likeCount
        self.replyCount = replyCount
        self.effectFlags = effectFlags
        self.createdAt = createdAt
        self.changeVersion = changeVersion
        self.reactionSummaryJson = reactionSummaryJson
        self.locationJson = locationJson
        self.mediaJson = mediaJson
    }
}

public extension CommentRecord {
    /// Decoded per-emoji reaction counts (`[emoji: count]`), empty when no
    /// reaction has been persisted yet. Computed (not a stored column) so GRDB
    /// ignores it — only `reactionSummaryJson` maps to a table column.
    var reactionSummary: [String: Int] {
        guard let reactionSummaryJson,
              let decoded = JSONDecoder().decodeOrLog([String: Int].self, from: reactionSummaryJson,
                                                      field: "comment reactionSummaryJson", id: id)
        else { return [:] }
        return decoded
    }

    /// Médias décodés depuis `mediaJson`, vide quand le commentaire n'en porte
    /// pas. Décodage paresseux, symétrique de `reactionSummary` et miroir de
    /// la lecture de `PostRecord.mediaJson`.
    var media: [APIPostMedia] {
        guard let mediaJson,
              let decoded = JSONDecoder().decodeOrLog([APIPostMedia].self, from: mediaJson,
                                                      field: "comment mediaJson", id: id)
        else { return [] }
        return decoded
    }

    /// Position décodée depuis `locationJson`, `nil` quand le commentaire n'en
    /// porte pas. Décodage paresseux, symétrique de `reactionSummary`.
    var location: SharedPlace? {
        guard let locationJson, let data = locationJson.data(using: .utf8) else { return nil }
        return JSONDecoder().decodeOrLog(SharedPlace.self, from: data, field: "comment locationJson", id: id)
    }
}

extension CommentRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.id == rhs.id && lhs.changeVersion == rhs.changeVersion
    }
}
