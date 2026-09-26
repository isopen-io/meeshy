import MeeshySDK

/// Site UNIQUE de la projection `APIPostComment` → `FeedComment` (descente Prisme comprise).
/// `nonisolated` : trois appelants (PostDetailViewModel.fetchCommentsFromNetwork / mapReplies,
/// FeedViewModel.prefetch) mappent dans un `Task.detached` ; une extension non annotée serait
/// MainActor par défaut de module (SE-0466). Tout ce qu'elle appelle est nonisolated.
nonisolated extension FeedComment {
    init(api c: APIPostComment, preferredLanguages: [String], parentId parentOverride: String? = nil) {
        self.init(
            id: c.id, author: c.author.name, authorId: c.author.id,
            authorUsername: c.author.username,
            authorAvatarURL: c.author.avatar,
            content: c.content, timestamp: c.createdAt,
            likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
            parentId: parentOverride ?? c.parentId,
            effectFlags: c.effectFlags ?? 0,
            originalLanguage: c.originalLanguage,
            translatedContent: PostDetailViewModel.resolveCommentTranslation(
                translations: c.translations, originalLanguage: c.originalLanguage,
                preferredLanguages: preferredLanguages),
            currentUserReactions: c.currentUserReactions,
            media: (c.media ?? []).map { $0.toFeedMedia() },
            location: c.location,
            quotedMedia: c.quotedCitation
        )
    }
}
