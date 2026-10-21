import Foundation
import MeeshySDK

/// Composition du modèle d'une carte de « Mes stories » — la MÊME carte sert
/// les stories publiées (onglets « Publiées » et « Archive ») et les
/// brouillons. Seules les entrées qui viennent d'un état observé (progression
/// d'un export vers la photothèque) sont passées par l'appelant.
enum MyStoryCardModelRules {

    static func published(
        _ story: StoryItem,
        saveProgress: Double?,
        saveIsCancellable: Bool
    ) -> MyStoryCardModel {
        MyStoryCardModel(
            id: story.id,
            kind: .published,
            thumbnailURL: story.media.first?.thumbnailUrl ?? story.media.first?.url,
            thumbHash: story.storyEffects?.thumbHash,
            localCoverPath: MyStoryThumbnailResolver.localCoverPath(
                renderedCover: CacheCoordinator.thumbnailLocalFileURL(
                    for: StoryCoverThumbnail.cacheKey(storyId: story.id))?.path,
                legacyFallback: nil),
            backgroundHex: story.storyEffects?.background,
            date: story.createdAt,
            expiresAt: story.expiresAt,
            counts: [
                .viewsAndReactions: story.viewCount ?? 0,
                .reactions: story.reactionCount,
                .comments: story.commentCount,
            ],
            title: nil,
            saveProgress: saveProgress,
            saveIsCancellable: saveIsCancellable)
    }

    static func draft(
        _ draft: StoryDraftSummary,
        saveProgress: Double?,
        saveIsCancellable: Bool
    ) -> MyStoryCardModel {
        MyStoryCardModel(
            id: draft.id,
            kind: .draft,
            thumbnailURL: nil,
            thumbHash: draft.thumbHash,
            localCoverPath: MyStoryThumbnailResolver.localCoverPath(
                renderedCover: CacheCoordinator.thumbnailLocalFileURL(
                    for: StoryCoverThumbnail.cacheKey(storyId: draft.id))?.path,
                legacyFallback: draft.coverFileURL?.path),
            backgroundHex: draft.backgroundHex,
            date: draft.updatedAt,
            expiresAt: nil,
            counts: [:],
            title: draft.title,
            saveProgress: saveProgress,
            saveIsCancellable: saveIsCancellable)
    }
}
