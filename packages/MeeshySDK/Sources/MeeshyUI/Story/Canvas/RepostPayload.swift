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

extension StorySlide {
    public func extractRepostPayload(sourceStoryItemId: String? = nil) -> RepostPayload {
        RepostPayload(
            textObjects: effects.textObjects,
            mediaObjects: effects.mediaObjects ?? [],
            stickers: effects.stickerObjects ?? [],
            drawingData: effects.drawingData,
            audioPlayerObjects: effects.audioPlayerObjects ?? [],
            sourceCanvasSize: CanvasGeometry.designSize,
            sourceSlideId: id,
            sourceStoryItemId: sourceStoryItemId
        )
    }
}
