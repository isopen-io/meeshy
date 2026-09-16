import XCTest
@testable import Meeshy
import MeeshySDK

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

    // MARK: - L'échec d'ouverture d'un réel depuis une notification (#6508)

    private func makeReel(id: String) -> FeedPost {
        let apiPost: APIPost = JSONStub.decode("""
        {"id":"\(id)","type":"REEL","content":"","createdAt":"2026-01-01T00:00:00.000Z","author":{"id":"a1","username":"alice"}}
        """)
        return apiPost.toFeedPost(preferredLanguages: [])
    }

    /// Le lecteur s'ouvre sur SON état d'échec — jamais sur le détail, qui
    /// referait la requête et échouerait une seconde fois pour le même tap.
    func test_presentFailure_opensTheReaderOnItsFailure_keepingTheTarget() {
        ReelsPresenter.shared.presentFailure(.server, postId: "r1", commentId: "c1", parentCommentId: "c0")

        let launch = ReelsPresenter.shared.launch
        XCTAssertEqual(launch?.failure, .server)
        XCTAssertEqual(launch?.seedPosts.count, 0)
        XCTAssertEqual(launch?.startId, "r1")
        XCTAssertEqual(launch?.commentId, "c1")
        XCTAssertEqual(launch?.parentCommentId, "c0")
    }

    /// Réessayer depuis l'échec REMPLIT le lecteur déjà ouvert : même identité,
    /// donc aucune seconde vague d'ouverture.
    func test_present_afterAFailure_fillsTheSameReader() {
        ReelsPresenter.shared.presentFailure(.network, postId: "r1", commentId: nil, parentCommentId: nil)
        let failed = ReelsPresenter.shared.launch

        ReelsPresenter.shared.present(posts: [makeReel(id: "r1")], startId: "r1")

        XCTAssertEqual(ReelsPresenter.shared.launch, failed)
        XCTAssertNil(ReelsPresenter.shared.launch?.failure)
        XCTAssertEqual(ReelsPresenter.shared.launch?.seedPosts.map(\.id), ["r1"])
    }

    /// Un lancement nominal n'hérite jamais d'une cause d'échec.
    func test_present_carriesNoFailure() {
        ReelsPresenter.shared.present(posts: [makeReel(id: "r2")], startId: "r2")

        XCTAssertNil(ReelsPresenter.shared.launch?.failure)
    }
}
