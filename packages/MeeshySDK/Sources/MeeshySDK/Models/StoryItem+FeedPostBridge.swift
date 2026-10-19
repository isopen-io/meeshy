import Foundation

// MARK: - StoryItem bridge

public extension StoryItem {
    /// Synthesize a `StoryItem` from a story `FeedPost` (post-detail inline
    /// rendering). Mirrors the `RepostContent` bridge used by
    /// `StoryReaderRepresentable.init(repost:)`. `FeedPost` has no `expiresAt`,
    /// which is irrelevant to in-place playback.
    ///
    /// REPUBLICATION DE STORY : quand le post reposte une STORY sans ajouts
    /// propres, ses `storyEffects`/`audioUrl` sont nil et ses `media` vides —
    /// le contenu vit sur la source. Sans fallback, la page détail rendait un
    /// canvas VIDE (flou) et l'audio de fond / les audios timeline ne se
    /// résolvaient jamais (le resolver cherche `postMediaId` dans `media`).
    /// On retombe donc sur la source, avec la MÊME politique que
    /// `toStoryGroups` (StoryModels.swift, extension `[APIPost]`) — seule
    /// cascade équivalente côté API/tray/viewer — pour que les deux ponts
    /// résolvent un repost identiquement.
    ///
    /// `media` et `storyEffects` sont couplés en UNE SEULE décision de
    /// fallback (`hasOwnContent`), jamais résolus indépendamment : les
    /// `mediaObjects`/`audioPlayerObjects` des effects référencent leurs
    /// médias par `postMediaId`, donc mélanger des effects de la SOURCE avec
    /// des médias PROPRES (ou l'inverse) casse silencieusement toute
    /// résolution audio/vidéo — le composer de repost (`StoryComposerViewModel
    /// (reposting:authorHandle:)`) ne produit d'ailleurs jamais l'un sans
    /// l'autre : il clone `story.storyEffects` dès qu'il y a un ajout. Durci
    /// ici en profondeur pour ne jamais dépendre de cette garantie côté
    /// composer (post-revue 2026-07-13).
    init(feedPost: FeedPost) {
        let storySource = feedPost.republishedStory
        let hasOwnContent = StoryEffects.republicationHasOwnContent(own: feedPost.storyEffects,
                                                                    ownMediaIsEmpty: feedPost.media.isEmpty)
        self.init(
            id: feedPost.id,
            content: feedPost.content,
            media: hasOwnContent ? feedPost.media : (storySource?.media ?? []),
            storyEffects: feedPost.playedStoryEffects,
            createdAt: feedPost.timestamp,
            expiresAt: nil,
            repostOfId: storySource?.id,
            repostAuthorName: storySource?.author,
            repostAuthorUsername: storySource?.authorUsername,
            audioUrl: feedPost.audioUrl ?? storySource?.audioUrl,
            isViewed: false,
            trackingLinks: feedPost.trackedLinkMap.map { TrackedLink(url: $0.key, token: $0.value) }
        )
    }
}
