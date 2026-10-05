import XCTest
@testable import MeeshyUI

/// #9304 — jumelle iOS de #9302 : pendant que la page plus récente d'une
/// fenêtre sautée se charge, le bouton « revenir en bas » dit « Chargement… »
/// (points pulsés, VoiceOver), reste actif, et ne s'allume qu'au-delà de
/// 200 ms de chargement ininterrompu — une réponse rapide ne fait rien
/// clignoter.
final class ConversationScrollControlsLoadingNewerTests: XCTestCase {

    private func content(
        searching: Bool = false,
        loadingNewer: Bool = false,
        unread: Bool = false,
        offline: Bool = false
    ) -> ConversationScrollControlsView.PillContent {
        ConversationScrollControlsView.pillContent(
            isSearchingQuotedMessage: searching,
            showsLoadingNewer: loadingNewer,
            hasUnreadContent: unread,
            isOffline: offline
        )
    }

    func test_pillContent_loadingNewer_saysLoading() {
        XCTAssertEqual(content(loadingNewer: true), .loadingNewer)
    }

    func test_pillContent_searchingAndLoadingNewer_searchWins() {
        XCTAssertEqual(content(searching: true, loadingNewer: true), .searching,
                       "La recherche d'une citation est l'état le plus fort : rien n'est encore servi")
    }

    func test_pillContent_loadingNewerWithUnread_loadingWins() {
        XCTAssertEqual(content(loadingNewer: true, unread: true), .loadingNewer)
    }

    func test_pillContent_idle_keepsOrdinaryStates() {
        XCTAssertEqual(content(), .rest)
        XCTAssertEqual(content(unread: true), .unread)
        XCTAssertEqual(content(offline: true), .offline)
    }

    func test_isCompactShape_loadingNewer_isCapsule() {
        XCTAssertTrue(ConversationScrollControlsView.isCompactShape(
            hasUnreadContent: false, isOffline: false, isSearchingQuotedMessage: false, showsLoadingNewer: true
        ))
    }

    func test_acceptsTaps_loadingNewer_staysActive() {
        XCTAssertTrue(ConversationScrollControlsView.acceptsTaps(isSearchingQuotedMessage: false),
                      "Le retour au présent reste permis pendant le chargement de la page plus récente")
        XCTAssertFalse(ConversationScrollControlsView.acceptsTaps(isSearchingQuotedMessage: true),
                       "Revenir au présent avant que la fenêtre arrive la ferait atterrir par-dessus")
    }

    func test_loadingNewerSignalDelay_is200Milliseconds() {
        XCTAssertEqual(ConversationScrollControlsView.loadingNewerSignalDelay, .milliseconds(200),
                       "Même seuil que le web (THREAD_LOAD_SIGNAL_DELAY_MS)")
    }

    @MainActor
    func test_loadingNewerLabel_isLocalizedLoading() {
        XCTAssertFalse(ConversationScrollControlsView.loadingNewerLabel.isEmpty)
    }
}
