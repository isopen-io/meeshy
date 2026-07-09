import Foundation
import CoreGraphics
import MeeshySDK

public struct RepostPayload: Sendable, Codable {
    public let textObjects: [StoryTextObject]
    public let mediaObjects: [StoryMediaObject]
    public let stickers: [StorySticker]
    public let drawingData: Data?
    public let audioPlayerObjects: [StoryAudioPlayerObject]
    public let sourceCanvasSize: CGSize
    public let sourceSlideId: String
    public let sourceStoryItemId: String?

    public init(textObjects: [StoryTextObject],
                mediaObjects: [StoryMediaObject],
                stickers: [StorySticker],
                drawingData: Data?,
                audioPlayerObjects: [StoryAudioPlayerObject],
                sourceCanvasSize: CGSize,
                sourceSlideId: String,
                sourceStoryItemId: String?) {
        self.textObjects = textObjects
        self.mediaObjects = mediaObjects
        self.stickers = stickers
        self.drawingData = drawingData
        self.audioPlayerObjects = audioPlayerObjects
        self.sourceCanvasSize = sourceCanvasSize
        self.sourceSlideId = sourceSlideId
        self.sourceStoryItemId = sourceStoryItemId
    }
}

/// Taille design du canvas source selon sa forme figée par l'auteur — même
/// mapping que `StoryExporter`'s `canvasRenderSize` : un fond paysage impose
/// 1920×1080, sinon le portrait 1080×1920 par défaut. Sans ça, le repost d'une
/// story paysage transmettrait `CanvasGeometry.designSize` (portrait statique)
/// comme `sourceCanvasSize`, faussant le rescale de `CanvasReprojector` pour
/// tout contenu (texte/media/sticker) repositionné dans le nouveau post.
private func repostSourceCanvasSize(for aspect: StoryCanvasAspect) -> CGSize {
    switch aspect {
    case .portrait:  return CanvasGeometry.designSize
    case .landscape: return CGSize(width: CanvasGeometry.designHeight,
                                    height: CanvasGeometry.designWidth)
    }
}

extension StorySlide {
    public func extractRepostPayload(sourceStoryItemId: String? = nil) -> RepostPayload {
        RepostPayload(
            textObjects: effects.textObjects,
            mediaObjects: effects.mediaObjects ?? [],
            stickers: effects.stickerObjects ?? [],
            drawingData: effects.drawingData,
            audioPlayerObjects: effects.audioPlayerObjects ?? [],
            sourceCanvasSize: repostSourceCanvasSize(for: effects.canvasAspect),
            sourceSlideId: id,
            sourceStoryItemId: sourceStoryItemId
        )
    }
}

extension StoryItem {
    /// Extracts a RepostPayload directly from a StoryItem (single-effects model
    /// used at feed/repost level). `sourceSlideId` and `sourceStoryItemId` both
    /// resolve to the StoryItem id since this model has no per-slide identity.
    public func extractRepostPayload() -> RepostPayload {
        RepostPayload(
            textObjects: storyEffects?.textObjects ?? [],
            mediaObjects: storyEffects?.mediaObjects ?? [],
            stickers: storyEffects?.stickerObjects ?? [],
            drawingData: storyEffects?.drawingData,
            audioPlayerObjects: storyEffects?.audioPlayerObjects ?? [],
            sourceCanvasSize: repostSourceCanvasSize(for: storyEffects?.canvasAspect ?? .portrait),
            sourceSlideId: id,
            sourceStoryItemId: id
        )
    }
}
