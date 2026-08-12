import XCTest
@testable import Meeshy

/// Verrouille le contrat de `ReelsPresenter` — l'unique porte d'entrée de l'overlay
/// Réels, appelée depuis DEUX gestes qui n'ont pas la même graine : l'appui long sur
/// le bouton flottant Flux (sans graine, le lecteur va chercher sa page) et le tap
/// sur une carte de réel dans le Flux (graine = les posts déjà à l'écran).
///
/// `presentFresh()` porte la mention « long-press launch » dans sa documentation et
/// n'avait plus AUCUN appelant pour ce geste : le long-press avait été rebranché sur
/// un simple bascule du Flux. Ces tests fixent la différence entre les deux entrées
/// pour qu'une prochaine itération ne les confonde pas.
@MainActor
final class ReelsPresenterTests: XCTestCase {

    override func tearDown() {
        ReelsPresenter.shared.dismiss()
        super.tearDown()
    }

    // MARK: - presentFresh (appui long sur le bouton flottant)

    func test_presentFresh_publishesALaunch() {
        ReelsPresenter.shared.dismiss()

        ReelsPresenter.shared.presentFresh()

        XCTAssertNotNil(ReelsPresenter.shared.launch)
    }

    /// Sans graine : c'est ce qui distingue le lancement par geste du lancement
    /// depuis une carte. Une graine vide dit au lecteur d'aller chercher sa page.
    func test_presentFresh_carriesNoSeedAndNoStartId() {
        ReelsPresenter.shared.presentFresh()

        XCTAssertEqual(ReelsPresenter.shared.launch?.seedPosts.count, 0)
        XCTAssertNil(ReelsPresenter.shared.launch?.startId)
    }

    /// Aucun commentaire ciblé : ce chemin n'est pas celui d'une notification.
    func test_presentFresh_targetsNoComment() {
        ReelsPresenter.shared.presentFresh()

        XCTAssertNil(ReelsPresenter.shared.launch?.commentId)
        XCTAssertNil(ReelsPresenter.shared.launch?.parentCommentId)
    }

    // MARK: - dismiss

    func test_dismiss_clearsTheLaunch() {
        ReelsPresenter.shared.presentFresh()

        ReelsPresenter.shared.dismiss()

        XCTAssertNil(ReelsPresenter.shared.launch)
    }

    /// Deux lancements successifs doivent produire deux identités distinctes, sans
    /// quoi `fullScreenCover(item:)` ne rouvrirait pas l'overlay refermé entre-temps.
    func test_twoSuccessiveLaunches_areNotEqual() {
        ReelsPresenter.shared.presentFresh()
        let first = ReelsPresenter.shared.launch

        ReelsPresenter.shared.dismiss()
        ReelsPresenter.shared.presentFresh()
        let second = ReelsPresenter.shared.launch

        XCTAssertNotNil(first)
        XCTAssertNotNil(second)
        XCTAssertNotEqual(first, second)
    }
}
