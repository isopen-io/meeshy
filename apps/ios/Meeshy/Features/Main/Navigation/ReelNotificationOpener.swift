import Foundation
import MeeshySDK

/// Where a tapped reel notification lands (#6508).
enum ReelNotificationDestination {
    /// The reel, in the immersive reader.
    case reel(FeedPost)
    /// The post EXISTS and is not a reel: the universal detail surface renders
    /// it, seeded with the post already fetched.
    case postDetail(FeedPost)
    /// The fetch failed: the reader opens on this cause.
    case failure(ContentFetchFailure)
}

/// **Un tap sur la notification d'un réel : UNE requête, et la vraie cause d'un échec (#6508).**
///
/// `RootView.openReelFromNotification` avalait l'échec par `try?` puis
/// retombait sur le détail du post, qui refaisait la même requête : deux
/// échecs pour un tap, et « vérifiez votre connexion » pendant une panne
/// serveur. La décision vit ici, injectable et testée ; RootView ne fait plus
/// que rendre la destination.
///
/// Cache d'abord (la Notification Service Extension précharge le post touché),
/// réseau ensuite. Un cache qui tient un post NON-réel ne tranche pas : le
/// réseau reclasse.
struct ReelNotificationOpener {
    let postService: PostServiceProviding
    let cachedPost: (String) async -> FeedPost?
    let preferredLanguages: () -> [String]
    let drainPrefetchedPosts: () async -> Void

    static var live: ReelNotificationOpener {
        ReelNotificationOpener(
            postService: PostService.shared,
            cachedPost: { postId in
                switch await CacheCoordinator.shared.feed.load(for: postId) {
                case .fresh(let cached, _), .stale(let cached, _):
                    return cached.first
                case .expired, .empty:
                    return nil
                }
            },
            preferredLanguages: { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] },
            drainPrefetchedPosts: { await NSEPendingPostConsumer.shared.consumeAll() }
        )
    }

    func destination(for postId: String) async -> ReelNotificationDestination {
        await drainPrefetchedPosts()
        if let cached = await cachedPost(postId), cached.isReel {
            return .reel(cached)
        }
        do {
            let post = try await postService.getPost(postId: postId)
                .toFeedPost(preferredLanguages: preferredLanguages())
            return post.isReel ? .reel(post) : .postDetail(post)
        } catch {
            return .failure(ContentFetchFailure.classify(error))
        }
    }
}
