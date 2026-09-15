import Foundation
import CoreGraphics
import MeeshySDK

nonisolated struct GallerySceneItem: Equatable {
    static let mimeType = "application/x-meeshy-scene"

    let id: String
    let postId: String
    let document: CanvasV3
    let sceneIndex: Int
    let carrier: StoryItem
    let aspect: CGFloat
    let moves: Bool

    static func == (gauche: GallerySceneItem, droite: GallerySceneItem) -> Bool {
        gauche.id == droite.id
    }
}

nonisolated struct GallerySceneCaption: Equatable {
    let origin: SceneCaption.Origin
    let mediaId: String?
}

nonisolated struct PostGalleryLot {

    struct Attribution: Equatable {
        let name: String
        let avatarURL: String?
        let color: String
        let date: Date
        let commentId: String?
    }

    let attachments: [MessageAttachment]
    let scenes: [String: GallerySceneItem]
    let sceneCaptions: [String: GallerySceneCaption]
    let captionServings: [String: SocialMediaCaptionServing]
    let captionMap: [String: String]
    let attributions: [String: Attribution]

    static let empty = PostGalleryLot(attachments: [], scenes: [:], sceneCaptions: [:],
                                      captionServings: [:], captionMap: [:], attributions: [:])

    static func compose(post: FeedPost,
                        comments: [FeedComment],
                        preferredLanguages: [String]) -> PostGalleryLot {
        .empty
    }

    static func entryId(in lot: PostGalleryLot, startMediaId: String?, startSceneIndex: Int) -> String {
        ""
    }
}

nonisolated enum PostGalleryCommentFeed {

    static func adding(_ comment: FeedComment, to current: [FeedComment]) -> [FeedComment] {
        current
    }

    static func removing(commentId: String, from current: [FeedComment]) -> [FeedComment] {
        current
    }

    static func merging(_ incoming: [FeedComment], into current: [FeedComment]) -> [FeedComment] {
        current
    }
}

nonisolated enum GalleryScenePlayback {

    static func playing(after intent: StageTransportIntent, isPlaying: Bool) -> Bool {
        isPlaying
    }
}
