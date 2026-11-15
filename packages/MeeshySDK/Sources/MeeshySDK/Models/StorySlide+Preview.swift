import CoreGraphics
import Foundation

// MARK: - StorySlide Preview Conversion

extension StorySlide {
    /// Convertit un StorySlide (local, non encore publié) en StoryItem pour la preview.
    /// Les médias sont reconstruits depuis mediaObjects/audioPlayerObjects avec les bons types
    /// pour que le reader puisse les résoudre via postMediaId → story.media.
    public func toPreviewStoryItem() -> StoryItem {
        var mediaEntries: [FeedMedia] = []

        // Legacy background image
        if let url = mediaURL {
            mediaEntries.append(FeedMedia(id: id, type: .image, url: url,
                                          thumbnailColor: "4ECDC4", width: nil, height: nil))
        }

        // Canvas media objects (images + videos)
        if let mediaObjects = effects.mediaObjects {
            for obj in mediaObjects {
                let feedType: FeedMediaType = obj.kind == .video ? .video : .image
                mediaEntries.append(FeedMedia(
                    id: obj.postMediaId.isEmpty ? obj.id : obj.postMediaId,
                    type: feedType,
                    thumbnailColor: "4ECDC4"
                ))
            }
        }

        // Canvas audio player objects
        if let audioObjects = effects.audioPlayerObjects {
            for obj in audioObjects {
                mediaEntries.append(FeedMedia(
                    id: obj.postMediaId.isEmpty ? obj.id : obj.postMediaId,
                    type: .audio,
                    thumbnailColor: "9B59B6"
                ))
            }
        }

        return StoryItem(
            id: id,
            content: content,
            media: mediaEntries,
            storyEffects: effects,
            createdAt: Date(),
            expiresAt: Date().addingTimeInterval(StoryItem.defaultExpiryInterval),
            isViewed: false
        )
    }
}
