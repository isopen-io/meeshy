import Foundation
import MeeshySDK

public enum StoryImageDecodeTiming: Sendable, Equatable {
    case immediate
    case offMainActor
}

struct StoryMediaImageRequest: Equatable, Sendable {
    let mediaId: String
    let cacheKey: String
    let url: URL
    let filterSignature: String

    nonisolated init?(media: StoryMediaObject?, resolvedURL: URL?) {
        guard let media, let resolvedURL else { return nil }
        self.mediaId = media.id
        self.cacheKey = media.postMediaId.isEmpty ? media.id : media.postMediaId
        self.url = resolvedURL
        self.filterSignature = "\(media.filter ?? "")|\(media.adjustments?.hashValue ?? 0)"
    }
}
