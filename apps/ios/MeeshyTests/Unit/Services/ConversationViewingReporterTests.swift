import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #8892 — côté émission : `viewing:start` quand l'écran de la conversation
/// est actif ET l'app au premier plan, `viewing:stop` à la fermeture ou au
/// passage en arrière-plan, ré-émission à chaque (re)connexion.
@MainActor
final class ConversationViewingReporterTests: XCTestCase {

    private final class SpyViewingEmitter: ConversationViewingEmitting {
        enum Call: Equatable {
            case start(String)
            case stop(String)
            case activity(String)
            case focus(String)
        }
        private(set) var calls: [Call] = []
        var onCall: ((Call) -> Void)?

        func emitViewingStart(conversationId: String) { record(.start(conversationId)) }
        func emitViewingStop(conversationId: String) { record(.stop(conversationId)) }
        func emitViewingActivity(conversationId: String, focus: Bool) {
            record(focus ? .focus(conversationId) : .activity(conversationId))
        }

        private func record(_ call: Call) {
            calls.append(call)
            onCall?(call)
        }
    }

    private func makeSUT(
        isForeground: Bool = true,
        reconnections: PassthroughSubject<Void, Never> = PassthroughSubject<Void, Never>(),
        now: @escaping () -> Date = Date.init,
        isBusy: @escaping () -> Bool = { false }
    ) -> (sut: ConversationViewingReporter, emitter: SpyViewingEmitter, connection: PassthroughSubject<Bool, Never>) {
        let emitter = SpyViewingEmitter()
        let connection = PassthroughSubject<Bool, Never>()
        let sut = ConversationViewingReporter(
            emitter: emitter,
            connection: connection.eraseToAnyPublisher(),
            reconnections: reconnections.eraseToAnyPublisher(),
            isForeground: isForeground,
            now: now,
            isBusy: isBusy
        )
        return (sut, emitter, connection)
    }

    func test_conversationOpened_inForeground_emitsStart() {
        let (sut, emitter, _) = makeSUT()

        sut.conversationOpened("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a")])
    }

    // MARK: - Regarder, écouter, agir (#9061)

    func test_activityOccurred_inTheAnnouncedConversation_emitsAtMostEveryTwoSeconds() {
        var clock = Date(timeIntervalSince1970: 1_000)
        let (sut, emitter, _) = makeSUT(now: { clock })
        sut.conversationOpened("conv-a")

        sut.activityOccurred("conv-a")
        sut.activityOccurred("conv-a")
        clock.addTimeInterval(1.9)
        sut.activityOccurred("conv-a")
        clock.addTimeInterval(0.1)
        sut.activityOccurred("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .activity("conv-a"), .activity("conv-a")])
    }

    func test_activityOccurred_whenNotAnnounced_emitsNothing() {
        let (sut, emitter, _) = makeSUT()
        sut.activityOccurred("conv-a")

        sut.conversationOpened("conv-a")
        sut.setCallScreenShown(true)
        sut.activityOccurred("conv-a")
        sut.setCallScreenShown(false)
        sut.setForeground(false)
        sut.activityOccurred("conv-a")
        sut.activityOccurred("conv-b")

        XCTAssertFalse(emitter.calls.contains { if case .activity = $0 { return true } else { return false } })
    }

    func test_touched_isActivityInTheAnnouncedConversation() {
        let (sut, emitter, _) = makeSUT()
        sut.touched()
        sut.conversationOpened("conv-a")

        sut.touched()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .activity("conv-a")])
    }

    func test_heartbeat_whileListeningOrRecording_emitsActivity() {
        var clock = Date(timeIntervalSince1970: 1_000)
        var busy = true
        let (sut, emitter, _) = makeSUT(now: { clock }, isBusy: { busy })
        sut.conversationOpened("conv-a")

        sut.heartbeat()
        clock.addTimeInterval(2)
        busy = false
        sut.heartbeat()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .activity("conv-a")])
    }

    func test_scrolling_emitsAtOnce_andKeepsTheHeartbeatAlive() {
        var clock = Date(timeIntervalSince1970: 1_000)
        let (sut, emitter, _) = makeSUT(now: { clock })
        sut.conversationOpened("conv-a")

        sut.scrollingChanged(true)
        clock.addTimeInterval(2)
        sut.heartbeat()
        sut.scrollingChanged(false)
        clock.addTimeInterval(2)
        sut.heartbeat()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .activity("conv-a"), .activity("conv-a")])
    }

    func test_conversationOpened_inBackground_emitsNothing() {
        let (sut, emitter, _) = makeSUT(isForeground: false)

        sut.conversationOpened("conv-a")

        XCTAssertEqual(emitter.calls, [])
    }

    func test_conversationOpened_anotherConversation_stopsThePreviousFirst() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.conversationOpened("conv-b")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-b")])
    }

    func test_conversationClosed_current_emitsStop() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
        XCTAssertNil(sut.viewingConversationId)
    }

    func test_conversationClosed_afterNextOpened_retractsNothing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-b")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls.last, .start("conv-b"))
        XCTAssertEqual(sut.viewingConversationId, "conv-b")
    }

    func test_conversationClosed_staleInstanceOfSameConversation_keepsViewing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-a")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
        XCTAssertEqual(sut.viewingConversationId, "conv-a")
    }

    // MARK: - Quitter la room : seulement au dernier écran (#9047)

    func test_conversationClosed_lastScreen_tellsToLeaveTheRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")

        XCTAssertTrue(sut.conversationClosed("conv-a"))
    }

    func test_conversationClosed_staleInstanceOfSameConversation_keepsTheRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-a")

        XCTAssertFalse(sut.conversationClosed("conv-a"),
                       "un ancien écran qui se démonte après la réouverture ne doit pas faire quitter la room")
    }

    func test_conversationClosed_afterAnotherConversationOpened_stillLeavesItsRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-b")

        XCTAssertTrue(sut.conversationClosed("conv-a"))
    }

    func test_socketHandlerDeinit_leavesTheRoomOnlyWhenTheReporterSaysSo() throws {
        let source = AppSourceGuard.stripComments(try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift"),
            encoding: .utf8))
        let deinitBody = try XCTUnwrap(source.range(of: "deinit {").map { source[$0.upperBound...] })
        let body = String(deinitBody.prefix(1200))
        XCTAssertFalse(body.contains("leaveRoom()"), "le départ immédiat effaçait la présence d'un écran rouvert")
        XCTAssertTrue(body.contains("if ConversationViewingReporter.shared.conversationClosed(id)"))
    }

    func test_setForeground_false_stopsThenTrue_restarts() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-a")])
    }

    func test_setForeground_withoutConversation_emitsNothing() {
        let (sut, emitter, _) = makeSUT()

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [])
    }

    func test_reconnect_reannouncesTheActiveConversation() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        let reannounced = expectation(description: "viewing:start re-emitted on reconnect")
        emitter.onCall = { call in
            if call == .start("conv-a") { reannounced.fulfill() }
        }

        connection.send(false)
        connection.send(true)

        await fulfillment(of: [reannounced], timeout: 1)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
    }

    func test_reconnect_inBackground_emitsNothing() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.setForeground(false)
        let nothing = expectation(description: "no emission while backgrounded")
        nothing.isInverted = true
        emitter.onCall = { _ in nothing.fulfill() }

        connection.send(true)

        await fulfillment(of: [nothing], timeout: 0.3)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_reconnect_withoutDisconnectTransition_reannouncesTheActiveConversation() async {
        let reconnections = PassthroughSubject<Void, Never>()
        let (sut, emitter, _) = makeSUT(reconnections: reconnections)
        sut.conversationOpened("conv-a")
        let reannounced = expectation(description: "viewing:start re-emitted on silent reconnect")
        emitter.onCall = { call in
            if call == .start("conv-a") { reannounced.fulfill() }
        }

        reconnections.send(())

        await fulfillment(of: [reannounced], timeout: 1)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
    }

    // MARK: - L'écran couvert ou quitté (#9052)

    func test_screenDisappeared_coveredByTheGallery_stopsThenReappearing_restarts() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")

        sut.screenDisappeared("conv-a")
        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-a")])
    }

    func test_screenDisappeared_thenHandlerClosed_doesNotStopTwice() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")

        sut.screenDisappeared("conv-a")
        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_sameConversationPushedOverItself_oldScreenDisappearing_keepsViewing() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")

        sut.screenDisappeared("conv-a")

        XCTAssertFalse(emitter.calls.contains(.stop("conv-a")))
    }

    func test_backFromAnotherConversation_reannouncesTheOneUnderneath() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-b")
        sut.screenDisappeared("conv-a")
        sut.conversationOpened("conv-b")

        sut.screenDisappeared("conv-b")
        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls.suffix(2), [.stop("conv-b"), .start("conv-a")])
        XCTAssertEqual(sut.viewingConversationId, "conv-a")
    }

    func test_foregroundReturn_whileCovered_emitsNothing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.screenDisappeared("conv-a")

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_reconnect_whileCovered_emitsNothing() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.screenDisappeared("conv-a")
        let nothing = expectation(description: "no emission while covered")
        nothing.isInverted = true
        emitter.onCall = { _ in nothing.fulfill() }

        connection.send(true)

        await fulfillment(of: [nothing], timeout: 0.3)
    }

    func test_conversationHosts_reportTheScreenVisibility() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        for host in ["RootLayers/RootRouteDestination.swift", "iPadRootView.swift", "GuestConversationContainer.swift"] {
            let source = AppSourceGuard.stripComments(try String(contentsOf: views.appendingPathComponent(host), encoding: .utf8))
            XCTAssertTrue(source.contains(".reportsConversationViewing("), "\(host) ne rapporte pas la visibilité de la conversation")
        }
    }

    // MARK: - Le plein écran ouvert depuis la conversation (#9052, #9065) :
    // un `fullScreenCover` ne déclenche pas `onDisappear` sur l'écran
    // recouvert — le contenu présenté se déclare lui-même. Il n'éloigne plus
    // de la conversation : il dit « regarde en plein écran », et le point
    // pulse chez les pairs.

    func test_coverBegan_keepsViewing_andSaysFocusAtOnce() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")

        sut.coverBegan()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a")])
    }

    func test_coverEnded_backToTheThread_endsFocusAtOnce() {
        var clock = Date(timeIntervalSince1970: 1_000)
        let (sut, emitter, _) = makeSUT(now: { clock })
        sut.conversationOpened("conv-a")
        sut.coverBegan()
        clock.addTimeInterval(0.5)

        sut.coverEnded()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a"), .activity("conv-a")])
    }

    func test_heartbeat_whileCovered_repeatsFocus_everyTwoSeconds() {
        var clock = Date(timeIntervalSince1970: 1_000)
        let (sut, emitter, _) = makeSUT(now: { clock })
        sut.conversationOpened("conv-a")
        sut.coverBegan()

        clock.addTimeInterval(1)
        sut.heartbeat()
        clock.addTimeInterval(1)
        sut.heartbeat()
        sut.activityOccurred("conv-a")
        clock.addTimeInterval(2)
        sut.activityOccurred("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a"), .focus("conv-a"), .focus("conv-a")])
    }

    func test_nestedCovers_focusOnce_andEndOnlyWithTheLastOne() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.coverBegan()
        sut.coverBegan()

        sut.coverEnded()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a")])
        sut.coverEnded()
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a"), .activity("conv-a")])
    }

    func test_coverEnded_withoutBegan_neverGoesBelowZero() {
        let (sut, emitter, _) = makeSUT()
        sut.coverEnded()
        sut.conversationOpened("conv-a")

        sut.coverBegan()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a")])
    }

    func test_reconnect_underACover_reannouncesTheConversation() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.coverBegan()
        let restarted = expectation(description: "re-announced under the cover")
        emitter.onCall = { if $0 == .start("conv-a") { restarted.fulfill() } }

        connection.send(true)

        await fulfillment(of: [restarted], timeout: 1)
    }

    // MARK: - Un appel fait quitter la conversation (#9065)

    func test_callScreenShown_stops_andHidden_restarts() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.setCallScreenShown(true)
        sut.setCallScreenShown(true)
        sut.setCallScreenShown(false)

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-a")])
    }

    func test_callScreenShown_overAFullScreenElement_stillLeaves() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.coverBegan()

        sut.setCallScreenShown(true)
        sut.heartbeat()

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .focus("conv-a"), .stop("conv-a")])
    }

    func test_callWindowPresenter_reportsTheCallScreenToTheReporter() throws {
        let presenter = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: presenter, encoding: .utf8))
        XCTAssertTrue(source.contains("setCallScreenShown("))
    }

    /// Chaque plein écran présenté depuis la conversation passe par
    /// `.conversationCover` : un `fullScreenCover` brut de plus laisserait le
    /// point « ici » fixe derrière une visionneuse, au lieu de le faire pulser.
    func test_everyConversationCover_declaresItself() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let hosts = try FileManager.default.contentsOfDirectory(atPath: views.path)
            .filter { ($0.hasPrefix("ConversationView") || $0 == "ConversationMediaViews.swift") && $0.hasSuffix(".swift") }
        XCTAssertGreaterThan(hosts.count, 3)
        var covers = 0
        for host in hosts {
            let source = AppSourceGuard.stripComments(try String(contentsOf: views.appendingPathComponent(host), encoding: .utf8))
            XCTAssertFalse(source.contains(".fullScreenCover("), "\(host) présente un plein écran sans .conversationCover")
            covers += source.components(separatedBy: ".conversationCover(").count - 1
        }
        // 13 → 12 (#9126, ca74b0279d) : la retouche d'une image en attente et
        // celle d'une vidéo en attente avaient chacune leur couverture ; elles
        // n'en font plus qu'UNE, la série de scènes de toutes les pièces du
        // message (`ConversationRetouchSeriesEditor`). Aucun plein écran n'a
        // quitté `.conversationCover` — l'assertion ci-dessus le tient.
        XCTAssertGreaterThanOrEqual(covers, 12)
    }

    /// Le mood remplace le point mais porte la présence en CONTOUR (#9065) :
    /// une rangée qui retire la présence sous un mood efface ce contour.
    func test_conversationRows_keepThePresenceUnderAMood() throws {
        let main = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main")
        for row in ["Views/ThemedConversationRow.swift", "Lentille/Row/LentilleConversationRow.swift"] {
            let source = AppSourceGuard.stripComments(try String(contentsOf: main.appendingPathComponent(row), encoding: .utf8))
            XCTAssertFalse(source.contains("moodStatus == nil"), "\(row) retire la présence sous un mood")
        }
    }

    func test_screenAppeared_beforeTheHandlerOpens_announcesNothing() {
        let (sut, emitter, _) = makeSUT()

        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls, [])
    }
}
