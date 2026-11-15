import Foundation
import MeeshySDK

/// **Ce que fait « Partager » (menu ⋯) sur une carte d'une LISTE** (favoris,
/// hashtag — #15994) : enregistrer le partage et frapper un lien suivi, comme
/// le profil.
///
/// L'utilisateur n'est jamais laissé sans rien à partager : quand la passerelle
/// n'enregistre rien (hors ligne, limite de débit), le lien public du post sert
/// de repli, sans compter de partage.
@MainActor
struct ListedPostSharer {
    struct Outcome {
        let link: ShareableLink?
        let recorded: Bool
    }

    private let service: PostServiceProviding

    init(service: PostServiceProviding = PostService.shared) {
        self.service = service
    }

    func share(_ post: FeedPost) async -> Outcome {
        let fileSource = ShareFileSource.post(post)
        let result = try? await service.share(postId: post.id, platform: "system", generateLink: true)
        guard let result else {
            return Outcome(link: ShareableLink.fallback(forPostId: post.id, fileSource: fileSource), recorded: false)
        }
        let tracked = result.shortUrl.flatMap(URL.init(string:)).map { ShareableLink(url: $0, fileSource: fileSource) }
        return Outcome(link: tracked ?? ShareableLink.fallback(forPostId: post.id, fileSource: fileSource), recorded: true)
    }
}
