// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum PostsEndpoint: MeeshyEndpoint, Sendable {
    case bookmarks
    case byPostId(postId: String)
    case byPostIdAnonymousView(postId: String)
    case byPostIdBookmark(postId: String)
    case byPostIdComments(postId: String)
    case byPostIdCommentsByCommentId(postId: String, commentId: String)
    case byPostIdCommentsByCommentIdLike(postId: String, commentId: String)
    case byPostIdCommentsByCommentIdReplies(postId: String, commentId: String)
    case byPostIdCommentsByCommentIdTranslate(postId: String, commentId: String)
    case byPostIdDownloads(postId: String)
    case byPostIdImpression(postId: String)
    case byPostIdInteractions(postId: String)
    case byPostIdLike(postId: String)
    case byPostIdPin(postId: String)
    case byPostIdRepost(postId: String)
    case byPostIdRepublish(postId: String)
    case byPostIdShare(postId: String)
    case byPostIdTranslate(postId: String)
    case byPostIdView(postId: String)
    case byPostIdViews(postId: String)
    case communityByCommunityId(communityId: String)
    case engagementBatch
    case feed
    case feedReels
    case feedStatuses
    case feedStatusesDiscover
    case feedStories
    case fromAttachment
    case hashtagByTag(tag: String)
    case impressionsBatch
    case mediaByMediaId(mediaId: String)
    case nearby
    case nearbyDensity
    case root
    case storiesMine
    case userByUserId(userId: String)

    public var path: String {
        switch self {
        case .bookmarks: return "/api/v1/posts/bookmarks"
        case .byPostId(let postId): return "/api/v1/posts/\(postId)"
        case .byPostIdAnonymousView(let postId): return "/api/v1/posts/\(postId)/anonymous-view"
        case .byPostIdBookmark(let postId): return "/api/v1/posts/\(postId)/bookmark"
        case .byPostIdComments(let postId): return "/api/v1/posts/\(postId)/comments"
        case .byPostIdCommentsByCommentId(let postId, let commentId): return "/api/v1/posts/\(postId)/comments/\(commentId)"
        case .byPostIdCommentsByCommentIdLike(let postId, let commentId): return "/api/v1/posts/\(postId)/comments/\(commentId)/like"
        case .byPostIdCommentsByCommentIdReplies(let postId, let commentId): return "/api/v1/posts/\(postId)/comments/\(commentId)/replies"
        case .byPostIdCommentsByCommentIdTranslate(let postId, let commentId): return "/api/v1/posts/\(postId)/comments/\(commentId)/translate"
        case .byPostIdDownloads(let postId): return "/api/v1/posts/\(postId)/downloads"
        case .byPostIdImpression(let postId): return "/api/v1/posts/\(postId)/impression"
        case .byPostIdInteractions(let postId): return "/api/v1/posts/\(postId)/interactions"
        case .byPostIdLike(let postId): return "/api/v1/posts/\(postId)/like"
        case .byPostIdPin(let postId): return "/api/v1/posts/\(postId)/pin"
        case .byPostIdRepost(let postId): return "/api/v1/posts/\(postId)/repost"
        case .byPostIdRepublish(let postId): return "/api/v1/posts/\(postId)/republish"
        case .byPostIdShare(let postId): return "/api/v1/posts/\(postId)/share"
        case .byPostIdTranslate(let postId): return "/api/v1/posts/\(postId)/translate"
        case .byPostIdView(let postId): return "/api/v1/posts/\(postId)/view"
        case .byPostIdViews(let postId): return "/api/v1/posts/\(postId)/views"
        case .communityByCommunityId(let communityId): return "/api/v1/posts/community/\(communityId)"
        case .engagementBatch: return "/api/v1/posts/engagement/batch"
        case .feed: return "/api/v1/posts/feed"
        case .feedReels: return "/api/v1/posts/feed/reels"
        case .feedStatuses: return "/api/v1/posts/feed/statuses"
        case .feedStatusesDiscover: return "/api/v1/posts/feed/statuses/discover"
        case .feedStories: return "/api/v1/posts/feed/stories"
        case .fromAttachment: return "/api/v1/posts/from-attachment"
        case .hashtagByTag(let tag): return "/api/v1/posts/hashtag/\(tag)"
        case .impressionsBatch: return "/api/v1/posts/impressions/batch"
        case .mediaByMediaId(let mediaId): return "/api/v1/posts/media/\(mediaId)"
        case .nearby: return "/api/v1/posts/nearby"
        case .nearbyDensity: return "/api/v1/posts/nearby/density"
        case .root: return "/api/v1/posts"
        case .storiesMine: return "/api/v1/posts/stories/mine"
        case .userByUserId(let userId): return "/api/v1/posts/user/\(userId)"
        }
    }
}
