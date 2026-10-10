import XCTest
import Combine
@testable import Meeshy

/// **Les effets du rail de la story** (directive porteur 2026-10-01) : « remettre
/// dans la lecture des story les effets qu'il y avait sur l'icône son, le cœur […]
/// ainsi que le contour du cœur sur tous les autres éléments lorsqu'on a commenté,
/// partagé etc. »
///
/// Le chrome commun (#8878, 19b9d089) les avait remplacés par une simple teinte
/// indigo du glyphe. Ces témoins épinglent la LOI pure — quelle action reçoit quel
/// contour — et la mémoire de session des gestes que la passerelle ne sert pas.
@MainActor
final class StoryRailContourTests: XCTestCase {

    private func contour(_ action: StoryRailEmphasisAction,
                         live: StoryRailContour.Live = .init(),
                         participation: StoryViewerParticipation = .none) -> StoryRailContour {
        StoryRailContour.resolve(action, live: live, participation: participation)
    }

    // MARK: - Le son et le cœur

    func test_resolve_soundOn_isLive_soundMuted_isNone() {
        XCTAssertEqual(contour(.sound, live: .init(soundOn: true)), .live)
        XCTAssertEqual(contour(.sound, live: .init(soundOn: false)), .none)
    }

    func test_resolve_heartReacted_takesTheAuthorRing() {
        XCTAssertEqual(contour(.react, participation: .init(hasReacted: true)), .participated)
    }

    func test_resolve_heartBarOpenWithoutReaction_isLive() {
        XCTAssertEqual(contour(.react, live: .init(reactionBarOpen: true)), .live)
    }

    /// L'anneau de l'auteur DIT quelque chose de durable ; l'indigo seulement « en ce
    /// moment ». Un cœur posé dont la barre est rouverte garde son anneau.
    func test_resolve_heartReactedAndBarOpen_keepsTheAuthorRing() {
        XCTAssertEqual(contour(.react,
                               live: .init(reactionBarOpen: true),
                               participation: .init(hasReacted: true)), .participated)
    }

    // MARK: - L'anneau du cœur sur chaque geste fait

    func test_resolve_commented_ringsComments() {
        XCTAssertEqual(contour(.comments, participation: .init(hasCommented: true)), .participated)
        XCTAssertEqual(contour(.comments, live: .init(commentsOpen: true)), .live)
        XCTAssertEqual(contour(.comments), .none)
    }

    func test_resolve_sent_ringsForward_only() {
        let sent = StoryViewerParticipation(hasSent: true)
        XCTAssertEqual(contour(.forward, participation: sent), .participated)
        XCTAssertEqual(contour(.repost, participation: sent), .none)
        XCTAssertEqual(contour(.comments, participation: sent), .none)
    }

    func test_resolve_reposted_ringsRepost() {
        XCTAssertEqual(contour(.repost, participation: .init(hasReposted: true)), .participated)
    }

    func test_resolve_nothingDone_nothingOpen_noContourAnywhere() {
        for action in StoryRailEmphasisAction.allCases {
            XCTAssertEqual(contour(action), .none, "\(action) ne doit rien dessiner sans geste ni ouverture")
        }
    }

    func test_resolve_languagesOpen_isLive() {
        XCTAssertEqual(contour(.translations, live: .init(languagesOpen: true)), .live)
    }

    // MARK: - La mémoire de session

    func test_store_note_retainsTheMark_forItsStoryOnly() {
        let store = StoryViewerParticipationStore()
        store.note(.commented, storyId: "st-1")

        XCTAssertTrue(store.participation(for: "st-1", hasReacted: false).hasCommented)
        XCTAssertFalse(store.participation(for: "st-2", hasReacted: false).hasCommented)
    }

    func test_store_participation_carriesTheServedReaction() {
        let store = StoryViewerParticipationStore()
        XCTAssertTrue(store.participation(for: "st-1", hasReacted: true).hasReacted)
        XCTAssertEqual(store.participation(for: nil, hasReacted: false), .none)
    }

    func test_store_noteTwice_publishesOnce() {
        let store = StoryViewerParticipationStore()
        var publications = 0
        let subscription = store.objectWillChange.sink { publications += 1 }
        store.note(.sent, storyId: "st-1")
        store.note(.sent, storyId: "st-1")
        subscription.cancel()

        XCTAssertEqual(publications, 1, "un geste déjà noté ne redessine aucun rail")
    }

    func test_store_emptyStoryId_isIgnored() {
        let store = StoryViewerParticipationStore()
        store.note(.reposted, storyId: "")
        XCTAssertTrue(store.marks.isEmpty)
    }
}
