import XCTest
@testable import Meeshy

/// La loi de bascule d'un like — pure, sans simulateur ni réseau.
final class PostLikeMutationTests: XCTestCase {

    func test_aimer_poseLetatEtIncrementeLeCompteur() {
        let outcome = PostLikeMutation.toggled(isLiked: false, likes: 5)
        XCTAssertEqual(outcome, .init(isLiked: true, likes: 6))
    }

    func test_retirer_reposeLetatEtDecrementeLeCompteur() {
        let outcome = PostLikeMutation.toggled(isLiked: true, likes: 5)
        XCTAssertEqual(outcome, .init(isLiked: false, likes: 4))
    }

    /// Le bornage bas, et la raison pour laquelle il n'est pas décoratif : le
    /// serveur peut avoir déjà décrémenté (écho d'une autre session) avant que
    /// le geste optimiste ne s'applique. `FeedViewModel` faisait `+= -1` sans
    /// borne et pouvait donc afficher « −1 j'aime ».
    func test_retirerSurUnCompteurNul_neFabriquePasDeNegatif() {
        let outcome = PostLikeMutation.toggled(isLiked: true, likes: 0)
        XCTAssertEqual(outcome, .init(isLiked: false, likes: 0))
    }

    /// Aucune borne HAUTE : le total appartient au serveur, qui le réaffirme en
    /// valeur absolue. Un plafond inventé ici mentirait sur un post viral.
    func test_aimer_neplafonnePasLeCompteur() {
        XCTAssertEqual(PostLikeMutation.toggled(isLiked: false, likes: 999_999).likes, 1_000_000)
    }

    /// Deux bascules successives rendent l'état de départ — la propriété qui
    /// permet à un appelant de rejouer un geste annulé sans instantané.
    func test_deuxBascules_reviennentAuDepart() {
        let once = PostLikeMutation.toggled(isLiked: false, likes: 3)
        let twice = PostLikeMutation.toggled(isLiked: once.isLiked, likes: once.likes)
        XCTAssertEqual(twice, .init(isLiked: false, likes: 3))
    }
}
