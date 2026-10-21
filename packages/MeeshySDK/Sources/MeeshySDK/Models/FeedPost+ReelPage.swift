import Foundation

// MARK: - Une page de réel ne se réévalue que si ce qu'elle montre change (#10354)

extension FeedPost {

    /// **Deux versions d'un réel rendent-elles la MÊME page ?**
    ///
    /// `FeedPost: Equatable` ne compare que l'identifiant (il sert le diff des
    /// listes) : une page de réel `Equatable` qui s'y fierait garderait le
    /// texte d'avant une édition, un compteur figé, une traduction jamais
    /// montrée. Cette égalité-ci compare tout ce que la page de réel LIT —
    /// texte et Prisme, médias, scène, lieu, mentions, compteurs, drapeaux du
    /// lecteur, auteur — et rien d'autre. L'élection d'un réel ne change aucun
    /// de ces champs : seules les deux pages concernées se réévaluent.
    public static func rendersSameReelPage(_ lhs: FeedPost, _ rhs: FeedPost) -> Bool {
        lhs.id == rhs.id
            && sameText(lhs, rhs)
            && sameCounters(lhs, rhs)
            && sameAuthor(lhs, rhs)
            && sameMedia(lhs.media, rhs.media)
            && lhs.storyEffects == rhs.storyEffects
            && lhs.location == rhs.location
            && lhs.mentions == rhs.mentions
            && lhs.repost?.id == rhs.repost?.id
            && lhs.visibility == rhs.visibility
            && lhs.visibilityUserIds == rhs.visibilityUserIds
            && lhs.trackedLinkMap == rhs.trackedLinkMap
            && lhs.viewerPoints == rhs.viewerPoints
            && lhs.audioUrl == rhs.audioUrl
    }

    private static func sameText(_ lhs: FeedPost, _ rhs: FeedPost) -> Bool {
        lhs.content == rhs.content
            && lhs.translatedContent == rhs.translatedContent
            && lhs.originalLanguage == rhs.originalLanguage
            && lhs.type == rhs.type
            && lhs.translations?.mapValues(\.text) == rhs.translations?.mapValues(\.text)
    }

    private static func sameCounters(_ lhs: FeedPost, _ rhs: FeedPost) -> Bool {
        lhs.likes == rhs.likes
            && lhs.isLiked == rhs.isLiked
            && lhs.isBookmarkedByMe == rhs.isBookmarkedByMe
            && lhs.isRepostedByMe == rhs.isRepostedByMe
            && lhs.commentCount == rhs.commentCount
            && lhs.repostCount == rhs.repostCount
            && lhs.bookmarkCount == rhs.bookmarkCount
            && lhs.shareCount == rhs.shareCount
            && lhs.viewCount == rhs.viewCount
            && lhs.postOpenCount == rhs.postOpenCount
            && lhs.impressionCount == rhs.impressionCount
            && lhs.qualifiedViewCount == rhs.qualifiedViewCount
            && lhs.playCount == rhs.playCount
    }

    private static func sameAuthor(_ lhs: FeedPost, _ rhs: FeedPost) -> Bool {
        lhs.author == rhs.author
            && lhs.authorId == rhs.authorId
            && lhs.authorUsername == rhs.authorUsername
            && lhs.authorColor == rhs.authorColor
            && lhs.authorAvatarURL == rhs.authorAvatarURL
            && lhs.timestamp == rhs.timestamp
    }

    private static func sameMedia(_ lhs: [FeedMedia], _ rhs: [FeedMedia]) -> Bool {
        lhs.count == rhs.count && zip(lhs, rhs).allSatisfy { a, b in
            a.id == b.id
                && a.type == b.type
                && a.url == b.url
                && a.thumbnailUrl == b.thumbnailUrl
                && a.thumbHash == b.thumbHash
                && a.thumbnailColor == b.thumbnailColor
                && a.width == b.width
                && a.height == b.height
                && a.duration == b.duration
                && a.caption == b.caption
                && a.alt == b.alt
                && a.captionLanguage == b.captionLanguage
                && a.captionTranslations == b.captionTranslations
                && a.transcription == b.transcription
                && a.translatedAudios == b.translatedAudios
        }
    }
}
