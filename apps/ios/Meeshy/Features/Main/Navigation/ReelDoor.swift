import Foundation
import MeeshySDK

/// Ce que la porte d'un réel demande au lecteur immersif — la forme de
/// `ReelsPresenter`, extraite pour que la porte se teste sans l'overlay.
@MainActor
protocol ReelsPresenting: AnyObject {
    func present(posts: [FeedPost], startId: String?, commentId: String?, parentCommentId: String?)
    func presentFailure(_ failure: ContentFetchFailure, postId: String, commentId: String?, parentCommentId: String?)
}

extension ReelsPresenter: ReelsPresenting {}

/// **La seule porte d'un réel nommé, pour toutes les entrées** (#7805, #7806).
///
/// Dans l'app, un réel s'ouvre dans le lecteur immersif (`ReelsPresenter`). La
/// notification iPhone le faisait, mais la notification iPad, le lien
/// `/reel/<id>` et le lien de suivi REEL ouvraient le détail d'un post : le
/// même réel se lisait dans deux moteurs selon la porte. Chaque racine ne
/// fournit plus que SA façon d'ouvrir un détail (une pile sur iPhone, la
/// colonne droite sur iPad) ; la décision est celle de
/// `ReelNotificationOpener` — cache d'abord, une requête, la vraie cause d'un
/// échec (#6508).
@MainActor
struct ReelDoor {
    let opener: ReelNotificationOpener
    let presenter: ReelsPresenting

    static var live: ReelDoor {
        ReelDoor(opener: .live, presenter: ReelsPresenter.shared)
    }

    func open(
        postId: String,
        commentId: String? = nil,
        parentCommentId: String? = nil,
        showPostDetail: (FeedPost) -> Void
    ) async {
        switch await opener.destination(for: postId) {
        case .reel(let post):
            presenter.present(posts: [post], startId: postId, commentId: commentId, parentCommentId: parentCommentId)
        case .postDetail(let post):
            showPostDetail(post)
        case .failure(let failure):
            presenter.presentFailure(failure, postId: postId, commentId: commentId, parentCommentId: parentCommentId)
        }
    }
}
